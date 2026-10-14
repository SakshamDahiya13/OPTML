import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import GlassCard from "./GlassCard";
import { useTheme } from "../context/ThemeContext";
import { radius, type as t } from "../theme";

type Props = {
  items: readonly string[];
  value: number;
  onChange: (index: number) => void;
};

/** Day / Week / Month / Year — a solid pill gliding across a glass track. */
export default function Segmented({ items, value, onChange }: Props) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const slot = items.length ? w / items.length : 0;
  const slide = useRef(new Animated.Value(value)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: value,
      useNativeDriver: true,
      friction: 16,
      tension: 110,
    }).start();
  }, [value, slide]);

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, slot],
  });

  return (
    <GlassCard radius={radius.pill} style={styles.card}>
      <View style={styles.row} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {slot > 0 ? (
          <Animated.View
            style={[styles.thumbSlot, { width: slot, transform: [{ translateX }] }]}
            pointerEvents="none"
          >
            <View style={[styles.thumb, { backgroundColor: colors.accent }]} />
          </Animated.View>
        ) : null}
        {items.map((label, i) => (
          <Pressable key={label} style={styles.item} onPress={() => onChange(i)}>
            <Text
              style={[
                t.label,
                {
                  color: i === value ? colors.onAccent : colors.textDim,
                  fontWeight: i === value ? "700" : "500",
                },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 4 },
  row: { flexDirection: "row", alignItems: "center" },
  thumbSlot: { position: "absolute", top: 0, bottom: 0, left: 0, justifyContent: "center" },
  thumb: { flex: 1, borderRadius: radius.pill },
  item: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10 },
});
