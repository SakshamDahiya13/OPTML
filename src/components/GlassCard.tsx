import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../context/ThemeContext";
import { radius as r } from "../theme";
import { useBackdropOrigin } from "./GlassBackdrop";
import { useGlassScroll } from "./GlassScroll";

type Props = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Corner radius. Defaults to radius.lg. */
  radius?: number;
  /** Brighter veil + border. For hero surfaces and overlays. */
  strong?: boolean;
  /** Colour wash over the backdrop — used by the insight callout. */
  wash?: string;
  /** Also run a real BlurView. Only worth it where live content passes behind
   *  the pane (the floating tab bar); everywhere else the backdrop is the
   *  wallpaper, which is already blurred. */
  live?: boolean;
};

/**
 * A frosted pane that genuinely shows the wallpaper blurred behind it.
 *
 * It does not blur at render time. The wallpaper is fixed to the screen and
 * ships with a pre-blurred twin, so the correct backdrop for a pane is simply
 * that twin, sampled at the pane's current screen position — which is exact,
 * not an approximation of backdrop blur. The sampling window is driven by the
 * scroll offset on the native driver, so it tracks the pane while you scroll.
 *
 * Doing it this way also means there is no native blur path that can quietly
 * do nothing: the backdrop is an Image and a transform, which either both work
 * or neither does.
 */
export default function GlassCard({
  children,
  style,
  radius = r.lg,
  strong = false,
  wash,
  live = false,
}: Props) {
  const { glass, wallpaperBlurred } = useTheme();
  const { width: W, height: H } = useWindowDimensions();
  const origin = useBackdropOrigin();
  const scroll = useGlassScroll();

  const ref = useRef<View>(null);
  // x: distance from the wallpaper's left edge.
  // anchor: distance from the wallpaper's top edge, in *content* space, so it
  // stays valid as the list scrolls under the pane.
  const [box, setBox] = useState({ x: 0, anchor: 0 });

  const measure = useCallback(() => {
    ref.current?.measureInWindow((wx, wy) => {
      if (!Number.isFinite(wx) || !Number.isFinite(wy)) return;
      const x = wx - origin.x;
      const anchor = wy - origin.y + (scroll ? scroll.now.current : 0);
      setBox((prev) =>
        prev.x === x && prev.anchor === anchor ? prev : { x, anchor }
      );
    });
  }, [origin.x, origin.y, scroll]);

  // onLayout alone can miss a pane whose size never changes but whose position
  // settles a frame later (common inside a ScrollView on first paint), so take
  // one more reading after the frame commits.
  useEffect(() => {
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [measure]);

  // screenY = anchor - scrollY, and the backdrop must be offset by -screenY.
  // Memoised so scrolling doesn't allocate a fresh native node every frame.
  const translateY = useMemo(
    () =>
      scroll
        ? scroll.y.interpolate({
            inputRange: [0, 1],
            outputRange: [-box.anchor, 1 - box.anchor],
          })
        : -box.anchor,
    [scroll, box.anchor]
  );

  return (
    <View style={[{ borderRadius: radius }, style]}>
      <View
        ref={ref}
        onLayout={measure}
        style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}
        pointerEvents="none"
      >
        <Animated.View
          style={[
            styles.backdrop,
            { left: -box.x, width: W, height: H, transform: [{ translateY }] },
          ]}
        >
          <Image
            source={wallpaperBlurred}
            style={styles.fill}
            resizeMode="cover"
            fadeDuration={0}
          />
        </Animated.View>

        {live ? (
          <BlurView
            intensity={glass.liveIntensity}
            tint={glass.tint}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: strong ? glass.fillStrong : glass.fill },
          ]}
        />
        {wash ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: wash }]} />
        ) : null}

        <LinearGradient
          colors={glass.sheen}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.75, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Lit hairline across the top — the detail that sells a glass edge. */}
        <View style={[styles.topEdge, { backgroundColor: glass.topEdge }]} />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radius,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: strong ? glass.borderStrong : glass.border,
            },
          ]}
        />
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0 },
  fill: { width: "100%", height: "100%" },
  topEdge: { position: "absolute", top: 0, left: 22, right: 22, height: 1 },
});
