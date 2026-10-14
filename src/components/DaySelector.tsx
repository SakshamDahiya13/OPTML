import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import GlassCard from "./GlassCard";
import { useTheme } from "../context/ThemeContext";
import { radius, type as t } from "../theme";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = { value?: number; onChange?: (index: number) => void };

export default function DaySelector({ value, onChange }: Props) {
  const { colors } = useTheme();
  const [internal, setInternal] = useState(new Date().getDay());
  const active = value ?? internal;

  const [w, setW] = useState(0);
  const slot = w / DAYS.length;
  const slide = useRef(new Animated.Value(active)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: active,
      useNativeDriver: true,
      friction: 16,
      tension: 110,
    }).start();
  }, [active, slide]);

  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [0, slot] });

  function select(i: number) {
    setInternal(i);
    onChange?.(i);
  }

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
        {DAYS.map((d, i) => (
          <Pressable key={d} style={styles.item} onPress={() => select(i)}>
            <Text
              style={[
                t.tiny,
                {
                  color: i === active ? colors.onAccent : colors.textDim,
                  fontWeight: i === active ? "700" : "600",
                },
              ]}
            >
              {d.toUpperCase()}
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
  thumb: { flex: 1, borderRadius: radius.pill, marginHorizontal: 2 },
  item: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 11 },
});
