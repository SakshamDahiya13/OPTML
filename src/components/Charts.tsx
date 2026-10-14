import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../context/ThemeContext";
import { radius, type as t } from "../theme";

/** "Heart Rate            ‹  ›" — the card header used throughout the reference. */
export function CardHead({ title, right }: { title: string; right?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.head}>
      <Text style={[t.cardTitle, { color: colors.text }]}>{title}</Text>
      {right !== false ? (
        <View style={styles.chevrons}>
          <Ionicons name="chevron-back" size={15} color={colors.textFaint} />
          <Ionicons name="chevron-forward" size={15} color={colors.textDim} />
        </View>
      ) : null}
    </View>
  );
}

/** Horizontal progress track — macros, goals. */
export function TrackBar({ progress, color }: { progress: number; color?: string }) {
  const { colors, glass } = useTheme();
  const p = Math.max(0, Math.min(progress, 1));
  return (
    <View style={[styles.track, { backgroundColor: glass.track }]}>
      <View
        style={[
          styles.trackFill,
          { width: `${p * 100}%`, backgroundColor: color ?? colors.accent },
        ]}
      />
    </View>
  );
}

/** Vertical capsule bars with day labels. */
export function WeekBars({
  values,
  labels,
  activeIndex,
  height = 128,
}: {
  values: number[];
  labels: string[];
  activeIndex?: number;
  height?: number;
}) {
  const { colors, glass } = useTheme();
  const max = Math.max(...values, 1);
  return (
    <View>
      <View style={[styles.bars, { height }]}>
        {values.map((v, i) => {
          const on = i === activeIndex;
          return (
            <View key={i} style={styles.barCol}>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max((v / max) * height, 6),
                    backgroundColor: on ? colors.accent : glass.track,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.barLabels}>
        {labels.map((l, i) => (
          <Text
            key={i}
            style={[
              t.tiny,
              {
                flex: 1,
                textAlign: "center",
                color: i === activeIndex ? colors.text : colors.textFaint,
              },
            ]}
          >
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * Scattered capsules at varying heights — the reference's overnight heart-rate
 * plot. `points` are 0..1 pairs of [centre, magnitude].
 */
export function ScatterCapsules({
  points,
  axis,
  height = 150,
}: {
  points: [number, number][];
  axis: string[];
  height?: number;
}) {
  const { colors } = useTheme();
  return (
    <View>
      <View style={{ height }}>
        {points.map(([c, m], i) => {
          const h = Math.max(m * height * 0.46, 10);
          const top = Math.max(Math.min((1 - c) * height - h / 2, height - h), 0);
          return (
            <View
              key={i}
              style={[
                styles.capsule,
                {
                  left: `${(i / Math.max(points.length - 1, 1)) * 92 + 2}%`,
                  top,
                  height: h,
                  backgroundColor: colors.text,
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.axis}>
        {axis.map((a) => (
          <Text key={a} style={[t.tiny, { color: colors.textFaint }]}>
            {a}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Small legend dots under a chart. */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.legend}>
      {items.map((it) => (
        <View key={it.label} style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: it.color }]} />
          <Text style={[t.tiny, { color: colors.textDim, fontWeight: "500" }]}>
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chevrons: { flexDirection: "row", gap: 14 },
  track: { height: 6, borderRadius: radius.pill, overflow: "hidden" },
  trackFill: { height: "100%", borderRadius: radius.pill },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  barCol: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  bar: { width: "100%", borderRadius: radius.pill },
  barLabels: { flexDirection: "row", gap: 8, marginTop: 9 },
  capsule: { position: "absolute", width: 7, borderRadius: radius.pill },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  legend: { flexDirection: "row", gap: 20, marginTop: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
