import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { TAB_BAR_SPACE, cardShadow, space, type as t } from "../theme";
import GlassCard from "../components/GlassCard";
import GlassScroll from "../components/GlassScroll";
import Screen from "../components/Screen";
import Header from "../components/Header";
import Segmented from "../components/Segmented";
import Metric from "../components/Metric";
import InsightCard from "../components/InsightCard";
import { CardHead, Legend, ScatterCapsules, TrackBar, WeekBars } from "../components/Charts";

const RANGES = ["Day", "Week", "Month", "Year"] as const;

const CALORIES = [2180, 2420, 1960, 2310, 1820, 2540, 2060];
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

const HR: [number, number][] = [
  [0.32, 0.5], [0.44, 0.75], [0.38, 0.4], [0.58, 0.9], [0.49, 0.55],
  [0.62, 0.7], [0.4, 0.45], [0.55, 0.85], [0.47, 0.5], [0.35, 0.6],
  [0.52, 0.42], [0.6, 0.8],
];

const MICROS = [
  { k: "Fibre", v: 24, goal: 35, u: "g" },
  { k: "Sugar", v: 48, goal: 60, u: "g" },
  { k: "Sodium", v: 1850, goal: 2300, u: "mg" },
  { k: "Water", v: 2.1, goal: 3, u: "L" },
];

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { colors, glass } = theme;
  const [range, setRange] = useState(1);
  const avg = Math.round(CALORIES.reduce((a, b) => a + b, 0) / CALORIES.length);

  return (
    <Screen>
      <GlassScroll
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingBottom: insets.bottom + TAB_BAR_SPACE,
        }}
      >
        <Header title={"Your\nTrends"} subtitle="Last 7 days" />

        <View style={{ height: 18 }} />
        <Segmented items={RANGES} value={range} onChange={setRange} />

        <View style={{ height: space.gap }} />
        <GlassCard strong style={[styles.hero, cardShadow(theme)]}>
          <CardHead title="Average intake" />
          <View style={styles.metricWrap}>
            <Metric parts={[{ v: avg.toLocaleString(), u: "kcal" }]} caption="per day" />
          </View>
          <WeekBars values={CALORIES} labels={DAYS} activeIndex={4} height={132} />
          <Legend
            items={[
              { label: "On target", color: colors.accent },
              { label: "Under", color: glass.track },
            ]}
          />
        </GlassCard>

        <View style={{ height: space.gap }} />
        <InsightCard
          title="AI detected 2 low-protein days"
          body="Tuesday and Friday fell under 100 g. Shifting a snack to Greek yogurt would close most of that gap."
        />

        <View style={{ height: space.gap }} />
        <GlassCard style={styles.card}>
          <CardHead title="Resting heart rate" />
          <View style={{ height: 14 }} />
          <ScatterCapsules
            points={HR}
            axis={["10:00 PM", "01:00 AM", "04:00 AM", "07:00 AM"]}
          />
        </GlassCard>

        <View style={{ height: space.gap }} />
        <GlassCard style={styles.card}>
          <CardHead title="Micronutrients" right={false} />
          <View style={{ height: 6 }} />
          {MICROS.map((m) => (
            <View key={m.k} style={styles.micro}>
              <View style={styles.microTop}>
                <Text style={[t.label, { color: colors.text, fontWeight: "600" }]}>
                  {m.k}
                </Text>
                <Text style={[t.label, { color: colors.textDim }]}>
                  {m.v}
                  {m.u} / {m.goal}
                  {m.u}
                </Text>
              </View>
              <TrackBar progress={m.v / m.goal} />
            </View>
          ))}
        </GlassCard>
      </GlassScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, paddingHorizontal: space.gutter },
  hero: { padding: 18 },
  card: { padding: 18 },
  metricWrap: { marginTop: 16, marginBottom: 20, alignItems: "flex-start" },
  micro: { marginTop: 14 },
  microTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
});
