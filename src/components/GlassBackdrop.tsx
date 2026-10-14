import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { Image, StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

type Origin = { x: number; y: number };

/**
 * Where the wallpaper's top-left sits in window coordinates.
 *
 * Panes locate themselves with measureInWindow, which is relative to the whole
 * window — including the status bar strip under an edge-to-edge app. Measuring
 * the wallpaper the same way and subtracting means the two always agree, no
 * matter how the host pads the root view.
 */
const OriginContext = createContext<Origin>({ x: 0, y: 0 });

export const useBackdropOrigin = () => useContext(OriginContext);

export default function GlassProvider({ children }: { children: ReactNode }) {
  const { colors, wallpaper } = useTheme();
  const ref = useRef<View>(null);
  const [origin, setOrigin] = useState<Origin>({ x: 0, y: 0 });

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      setOrigin((prev) => (prev.x === x && prev.y === y ? prev : { x, y }));
    });
  }, []);

  return (
    <OriginContext.Provider value={origin}>
      <View
        ref={ref}
        onLayout={measure}
        style={[styles.root, { backgroundColor: colors.bg }]}
      >
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Image source={wallpaper} style={styles.wallpaper} resizeMode="cover" />
        </View>
        {children}
      </View>
    </OriginContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  wallpaper: { width: "100%", height: "100%" },
});
