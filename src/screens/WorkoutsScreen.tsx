import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../context/ThemeContext";
import { TAB_BAR_SPACE, cardShadow, radius, space, type as t } from "../theme";
import GlassCard from "../components/GlassCard";
import GlassScroll from "../components/GlassScroll";
import Screen from "../components/Screen";
import Header from "../components/Header";
import Segmented from "../components/Segmented";
import Metric from "../components/Metric";
import InsightCard from "../components/InsightCard";
import { CardHead, Legend, WeekBars } from "../components/Charts";

const RANGES = ["Day", "Week", "Month", "Year"] as const;

const VOLUME = [62, 48, 75, 0, 83, 54, 36];
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

const EXERCISES = [
  { name: "Barbell Bench Press", sets: "4 × 8", load: "70 kg", done: true },
  { name: "Incline Dumbbell Press", sets: "3 × 10", load: "24 kg", done: true },
  { name: "Cable Fly", sets: "3 × 12", load: "18 kg", done: true },
  { name: "Overhead Press", sets: "4 × 8", load: "40 kg", done: false },
  { name: "Lateral Raise", sets: "3 × 15", load: "10 kg", done: false },
  { name: "Triceps Rope Pushdown", sets: "3 × 12", load: "27 kg", done: false },
];

export default function WorkoutsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { colors, glass } = theme;
  const [range, setRange] = useState(1);
  const done = EXERCISES.filter((e) => e.done).length;

  return (
    <Screen>
      <GlassScroll
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingBottom: insets.bottom + TAB_BAR_SPACE,
        }}
      >
        <Header title={"Push\nSession"} subtitle="Chest · Shoulders · Triceps" />

        <View style={{ height: 18 }} />
        <Segmented items={RANGES} value={range} onChange={setRange} />

        <View style={{ height: space.gap }} />
        <GlassCard strong style={[styles.hero, cardShadow(theme)]}>
          <CardHead title="Total volume" />
          <View style={styles.metricWrap}>
            <Metric parts={[{ v: "12.4", u: "k" }, { v: "kg", u: "" }]} />
          </View>
          <WeekBars values={VOLUME} labels={DAYS} activeIndex={4} />
          <Legend
            items={[
              { label: "Completed", color: colors.accent },
              { label: "Rest", color: glass.track },
            ]}
          />
        </GlassCard>

        <View style={{ height: space.gap }} />
        <View style={styles.statRow}>
          {[
            { k: "Exercises", v: `${done}/${EXERCISES.length}` },
            { k: "Minutes", v: "58" },
            { k: "Calories", v: "482" },
          ].map((s) => (
            <GlassCard key={s.k} style={styles.stat}>
              <View style={styles.statInner}>
                <Text style={[t.label, { color: colors.textDim }]}>{s.k}</Text>
                <Metric parts={[{ v: s.v }]} scale={0.56} align="flex-start" />
              </View>
            </GlassCard>
          ))}
        </View>

        <View style={{ height: space.gap }} />
        <InsightCard
          title="Bench volume up 12% this week"
          body="Your pressing strength is trending up. Keep the overhead press at 40 kg before adding load."
        />

        <View style={{ height: space.section }} />
        <Text style={[t.cardTitle, { color: colors.text, marginBottom: 12 }]}>
          Today's exercises
        </Text>

        {EXERCISES.map((ex) => (
          <GlassCard key={ex.name} style={styles.row}>
            <View style={styles.rowInner}>
              <View
                style={[
                  styles.check,
                  {
                    backgroundColor: ex.done ? colors.accent : "transparent",
                    borderColor: ex.done ? colors.accent : glass.borderStrong,
                  },
                ]}
              >
                {ex.done ? (
                  <Ionicons name="checkmark" size={14} color={colors.onAccent} />
                ) : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[t.cardTitle, { color: colors.text }]}>{ex.name}</Text>
                <Text style={[t.label, { color: colors.textDim, marginTop: 3 }]}>
                  {ex.sets} · {ex.load}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
            </View>
          </GlassCard>
        ))}
      </GlassScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, paddingHorizontal: space.gutter },
  hero: { padding: 18 },
  metricWrap: { marginTop: 16, marginBottom: 20, alignItems: "flex-start" },
  statRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1 },
  statInner: { padding: 14 },
  row: { marginBottom: 10 },
  rowInner: { flexDirection: "row", alignItems: "center", gap: 13, padding: 15 },
  check: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
