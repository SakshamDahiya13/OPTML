import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import GlassCard from "./GlassCard";
import { useTheme } from "../context/ThemeContext";
import { TAB_BAR_GAP, TAB_BAR_HEIGHT, cardShadow, radius } from "../theme";

const ICONS: Record<
  string,
  { outline: keyof typeof Ionicons.glyphMap; filled: keyof typeof Ionicons.glyphMap }
> = {
  Chat: { outline: "chatbubble-outline", filled: "chatbubble" },
  Workout: { outline: "barbell-outline", filled: "barbell" },
  Food: { outline: "restaurant-outline", filled: "restaurant" },
  Analysis: { outline: "stats-chart-outline", filled: "stats-chart" },
  Settings: { outline: "person-outline", filled: "person" },
};

const SLOT = 54;

/**
 * Compact centred nav pill, as in the reference: icons only, with a solid
 * marker that glides between them rather than a box blinking on and off.
 *
 * This is the one surface with `live` blur switched on — scrolling content
 * passes behind it, and the wallpaper backdrop alone can't account for that.
 */
export default function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { colors } = theme;

  const [w, setW] = useState(0);
  const count = state.routes.length;
  const slot = count ? w / count : 0;

  const slide = useRef(new Animated.Value(state.index)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: state.index,
      useNativeDriver: true,
      friction: 14,
      tension: 100,
    }).start();
  }, [state.index, slide]);

  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [0, slot] });

  return (
    <View
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) + TAB_BAR_GAP }]}
      pointerEvents="box-none"
    >
      <GlassCard
        strong
        live
        radius={radius.pill}
        style={[styles.bar, cardShadow(theme)]}
      >
        <View style={styles.row} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {slot > 0 ? (
            <Animated.View
              style={[styles.markerSlot, { width: slot, transform: [{ translateX }] }]}
              pointerEvents="none"
            >
              <View style={[styles.marker, { backgroundColor: colors.accent }]} />
            </Animated.View>
          ) : null}

          {state.routes.map((route, i) => {
            const focused = state.index === i;
            const icon = ICONS[route.name] ?? {
              outline: "ellipse-outline" as const,
              filled: "ellipse" as const,
            };

            function onPress() {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={
                  descriptors[route.key].options.tabBarAccessibilityLabel ?? route.name
                }
                onPress={onPress}
                onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
                style={styles.tab}
              >
                <Ionicons
                  name={focused ? icon.filled : icon.outline}
                  size={20}
                  color={focused ? colors.onAccent : colors.textDim}
                />
              </Pressable>
            );
          })}
        </View>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  bar: { height: TAB_BAR_HEIGHT, justifyContent: "center", paddingHorizontal: 6 },
  row: { flexDirection: "row", alignItems: "center", height: "100%", width: SLOT * 5 },
  markerSlot: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  marker: { width: 44, height: 44, borderRadius: radius.pill },
  tab: { width: SLOT, alignItems: "center", justifyContent: "center", height: "100%" },
});
