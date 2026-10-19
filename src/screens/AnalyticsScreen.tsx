import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../context/ThemeContext";
import { TAB_BAR_SPACE, cardShadow, space, type as t } from "../theme";
import GlassCard from "../components/GlassCard";
import GlassScroll from "../components/GlassScroll";
import Screen from "../components/Screen";
import Header from "../components/Header";
import Segmented from "../components/Segmented";
import Metric from "../components/Metric";
import InsightCard from "../components/InsightCard";
import { CardHead, Legend, TrackBar, WeekBars } from "../components/Charts";
import { useQuery } from "../hooks/useQuery";
import {
  Macros,
  Meal,
  Profile,
  ZERO,
  dayRange,
  daysBack,
  getProfile,
  listMeals,
  sumMacros,
} from "../lib/db";

const RANGES = ["7 days", "14 days", "30 days"] as const;
const RANGE_DAYS = [7, 14, 30];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

type DayTotal = { date: Date; macros: Macros; count: number };

/** Bucket meals into local-time days. */
function bucket(meals: Meal[], days: Date[]): DayTotal[] {
  return days.map((date) => {
    const { start, end } = dayRange(date);
    const inDay = meals.filter((m) => {
      const at = new Date(m.eaten_at).getTime();
      return at >= start.getTime() && at < end.getTime();
    });
    return { date, macros: sumMacros(inDay), count: inDay.length };
  });
}

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { colors, glass } = theme;
  const [range, setRange] = useState(0);
  const nDays = RANGE_DAYS[range];

  const profileQ = useQuery<Profile | null>(() => getProfile(), []);
  const mealsQ = useQuery<Meal[]>(() => {
    const days = daysBack(nDays);
    const { start } = dayRange(days[0]);
    const { end } = dayRange(days[days.length - 1]);
    return listMeals(start, end);
  }, [nDays]);

  const days = daysBack(nDays);
  const totals = bucket(mealsQ.data ?? [], days);
  const logged = totals.filter((d) => d.count > 0);

  const avg: Macros = logged.length
    ? {
        calories: sumMacros(logged.map((d) => d.macros)).calories / logged.length,
        protein_g: sumMacros(logged.map((d) => d.macros)).protein_g / logged.length,
        carbs_g: sumMacros(logged.map((d) => d.macros)).carbs_g / logged.length,
        fat_g: sumMacros(logged.map((d) => d.macros)).fat_g / logged.length,
      }
    : { ...ZERO };

  const goals = {
    calories: profileQ.data?.goal_calories ?? 2400,
    protein_g: profileQ.data?.goal_protein_g ?? 160,
    carbs_g: profileQ.data?.goal_carbs_g ?? 260,
    fat_g: profileQ.data?.goal_fat_g ?? 70,
  };

  // Only label every day when there are few enough to read.
  const labels = totals.map((d, i) =>
    nDays <= 7 ? DOW[d.date.getDay()] : i % Math.ceil(nDays / 7) === 0 ? String(d.date.getDate()) : ""
  );
  const todayIdx = totals.length - 1;

  const onTarget = logged.filter(
    (d) => Math.abs(d.macros.calories - goals.calories) <= goals.calories * 0.1
  ).length;

  const loading = mealsQ.loading && !mealsQ.data;
  const empty = !loading && logged.length === 0;

  const MACROS: [string, number, number][] = [
    ["Protein", avg.protein_g, goals.protein_g],
    ["Carbs", avg.carbs_g, goals.carbs_g],
    ["Fat", avg.fat_g, goals.fat_g],
  ];

  return (
    <Screen>
      <GlassScroll
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingBottom: insets.bottom + TAB_BAR_SPACE,
        }}
      >
        <Header title={"Your\nTrends"} subtitle={`Last ${nDays} days`} />

        <View style={{ height: 18 }} />
        <Segmented items={RANGES} value={range} onChange={setRange} />

        <View style={{ height: space.gap }} />
        <GlassCard strong style={[styles.hero, cardShadow(theme)]}>
          <CardHead title="Average intake" />
          <View style={styles.metricWrap}>
            {loading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Metric
                parts={[{ v: Math.round(avg.calories).toLocaleString(), u: "kcal" }]}
                caption={
                  logged.length
                    ? `per day across ${logged.length} logged ${
                        logged.length === 1 ? "day" : "days"
                      }`
                    : "no days logged yet"
                }
                align="flex-start"
              />
            )}
          </View>
          <WeekBars
            values={totals.map((d) => d.macros.calories)}
            labels={labels}
            activeIndex={todayIdx}
            height={132}
          />
          <Legend
            items={[
              { label: "Today", color: colors.accent },
              { label: "Earlier", color: glass.track },
            ]}
          />
        </GlassCard>

        {empty ? (
          <>
            <View style={{ height: space.gap }} />
            <GlassCard style={styles.empty}>
              <Ionicons name="bar-chart-outline" size={26} color={colors.textFaint} />
              <Text style={[t.cardTitle, { color: colors.text, marginTop: 12 }]}>
                No data yet
              </Text>
              <Text
                style={[
                  t.label,
                  { color: colors.textDim, marginTop: 6, textAlign: "center" },
                ]}
              >
                Log a few meals and your trends will build up here.
              </Text>
            </GlassCard>
          </>
        ) : (
          <>
            <View style={{ height: space.gap }} />
            <InsightCard
              title={
                onTarget
                  ? `${onTarget} of ${logged.length} days on target`
                  : "Still finding your baseline"
              }
              body={
                avg.protein_g < goals.protein_g * 0.85
                  ? `Protein is averaging ${Math.round(
                      avg.protein_g
                    )}g against a ${goals.protein_g}g goal — the biggest gap worth closing.`
                  : `Averaging ${Math.round(
                      avg.protein_g
                    )}g protein a day, which is tracking well against your goal.`
              }
            />

            <View style={{ height: space.gap }} />
            <GlassCard style={styles.card}>
              <CardHead title="Daily averages" right={false} />
              <View style={{ height: 6 }} />
              {MACROS.map(([name, got, goal]) => (
                <View key={name} style={styles.row}>
                  <View style={styles.rowTop}>
                    <Text style={[t.label, { color: colors.text, fontWeight: "600" }]}>
                      {name}
                    </Text>
                    <Text style={[t.label, { color: colors.textDim }]}>
                      {Math.round(got)}g / {goal}g
                    </Text>
                  </View>
                  <TrackBar progress={goal ? got / goal : 0} />
                </View>
              ))}
            </GlassCard>
          </>
        )}

        <View style={{ height: space.gap }} />
        <GlassCard style={styles.card}>
          <CardHead title="Micronutrients" right={false} />
          <View style={styles.lockedRow}>
            <Ionicons name="lock-closed-outline" size={15} color={colors.textFaint} />
            <Text style={[t.label, { color: colors.textDim, flex: 1 }]}>
              Vitamins and minerals need exact food matching. They'll appear once
              bodybuilder mode is switched on.
            </Text>
          </View>
        </GlassCard>
      </GlassScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, paddingHorizontal: space.gutter },
  hero: { padding: 18 },
  card: { padding: 18 },
  metricWrap: { marginTop: 16, marginBottom: 20, minHeight: 62, justifyContent: "center" },
  row: { marginTop: 14 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 34, paddingHorizontal: 24 },
  lockedRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
});
