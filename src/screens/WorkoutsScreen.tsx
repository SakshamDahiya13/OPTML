import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
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
import { CardHead, Legend, WeekBars } from "../components/Charts";
import { useQuery } from "../hooks/useQuery";
import { Workout, dayRange, daysBack, listWorkouts, workoutVolume } from "../lib/db";

const RANGES = ["7 days", "14 days", "30 days"] as const;
const RANGE_DAYS = [7, 14, 30];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export default function WorkoutsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { colors, glass } = theme;
  const [range, setRange] = useState(0);
  const nDays = RANGE_DAYS[range];

  const q = useQuery<Workout[]>(() => {
    const days = daysBack(nDays);
    const { start } = dayRange(days[0]);
    const { end } = dayRange(days[days.length - 1]);
    return listWorkouts(start, end);
  }, [nDays]);

  const workouts = q.data ?? [];
  const days = daysBack(nDays);

  const perDay = days.map((date) => {
    const { start, end } = dayRange(date);
    const inDay = workouts.filter((w) => {
      const at = new Date(w.started_at).getTime();
      return at >= start.getTime() && at < end.getTime();
    });
    return inDay.reduce((sum, w) => sum + workoutVolume(w), 0);
  });

  const totalVolume = perDay.reduce((a, b) => a + b, 0);
  const sessions = workouts.length;
  const minutes = workouts.reduce((a, w) => a + (w.duration_min ?? 0), 0);

  const labels = days.map((d, i) =>
    nDays <= 7 ? DOW[d.getDay()] : i % Math.ceil(nDays / 7) === 0 ? String(d.getDate()) : ""
  );

  const loading = q.loading && !q.data;
  const empty = !loading && sessions === 0;

  const volumeLabel =
    totalVolume >= 1000
      ? [{ v: (totalVolume / 1000).toFixed(1), u: "t" }]
      : [{ v: String(Math.round(totalVolume)), u: "kg" }];

  return (
    <Screen>
      <GlassScroll
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingBottom: insets.bottom + TAB_BAR_SPACE,
        }}
      >
        <Header title={"Your\nTraining"} subtitle={`Last ${nDays} days`} />

        <View style={{ height: 18 }} />
        <Segmented items={RANGES} value={range} onChange={setRange} />

        <View style={{ height: space.gap }} />
        <GlassCard strong style={[styles.hero, cardShadow(theme)]}>
          <CardHead title="Total volume" />
          <View style={styles.metricWrap}>
            {loading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Metric
                parts={volumeLabel}
                caption={sessions ? `across ${sessions} sessions` : "nothing logged yet"}
                align="flex-start"
              />
            )}
          </View>
          <WeekBars
            values={perDay}
            labels={labels}
            activeIndex={perDay.length - 1}
            height={128}
          />
          <Legend
            items={[
              { label: "Today", color: colors.accent },
              { label: "Earlier", color: glass.track },
            ]}
          />
        </GlassCard>

        <View style={{ height: space.gap }} />
        <View style={styles.statRow}>
          {[
            { k: "Sessions", v: String(sessions) },
            { k: "Minutes", v: String(minutes) },
            {
              k: "Avg / day",
              v: String(Math.round(totalVolume / Math.max(nDays, 1))),
            },
          ].map((s) => (
            <GlassCard key={s.k} style={styles.stat}>
              <View style={styles.statInner}>
                <Text style={[t.label, { color: colors.textDim }]}>{s.k}</Text>
                <Metric parts={[{ v: s.v }]} scale={0.56} align="flex-start" />
              </View>
            </GlassCard>
          ))}
        </View>

        <View style={{ height: space.section }} />
        <Text style={[t.cardTitle, { color: colors.text, marginBottom: 12 }]}>
          Sessions
        </Text>

        {loading ? (
          <GlassCard style={styles.empty}>
            <ActivityIndicator color={colors.textDim} />
          </GlassCard>
        ) : empty ? (
          <GlassCard style={styles.empty}>
            <Ionicons name="barbell-outline" size={26} color={colors.textFaint} />
            <Text style={[t.cardTitle, { color: colors.text, marginTop: 12 }]}>
              No sessions yet
            </Text>
            <Text
              style={[
                t.label,
                { color: colors.textDim, marginTop: 6, textAlign: "center" },
              ]}
            >
              Workout logging arrives with the chat coach — describe a session and
              it'll land here.
            </Text>
          </GlassCard>
        ) : (
          workouts.map((w) => (
            <GlassCard key={w.id} style={styles.row}>
              <View style={styles.rowInner}>
                <View style={[styles.icon, { backgroundColor: glass.track }]}>
                  <Ionicons name="barbell-outline" size={16} color={colors.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[t.cardTitle, { color: colors.text }]}>{w.name}</Text>
                  <Text style={[t.label, { color: colors.textDim, marginTop: 3 }]}>
                    {(w.exercise_sets ?? []).length} sets
                    {w.duration_min ? ` · ${w.duration_min} min` : ""}
                  </Text>
                </View>
                <Text style={[t.cardTitle, { color: colors.text }]}>
                  {Math.round(workoutVolume(w))} kg
                </Text>
              </View>
            </GlassCard>
          ))
        )}
      </GlassScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, paddingHorizontal: space.gutter },
  hero: { padding: 18 },
  metricWrap: { marginTop: 16, marginBottom: 20, minHeight: 62, justifyContent: "center" },
  statRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1 },
  statInner: { padding: 14 },
  row: { marginBottom: 10 },
  rowInner: { flexDirection: "row", alignItems: "center", gap: 13, padding: 15 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 34, paddingHorizontal: 24 },
});
