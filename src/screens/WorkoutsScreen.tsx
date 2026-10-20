import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
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
import DaySelector from "../components/DaySelector";
import AddWorkoutSheet from "../components/AddWorkoutSheet";
import AddSleepSheet from "../components/AddSleepSheet";
import AddBodySheet from "../components/AddBodySheet";
import { CardHead, Legend, WeekBars } from "../components/Charts";
import { useQuery } from "../hooks/useQuery";
import {
  BodyMetric, SleepLog, Workout, dayRange, daysBack, deleteWorkout, formatMinutes,
  getBody, getSleep, listWorkouts, workoutVolume,
} from "../lib/db";

const RANGES = ["7 days", "14 days", "30 days"] as const;
const RANGE_DAYS = [7, 14, 30];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const QUALITY = ["Awful", "Poor", "OK", "Good", "Great"];

/** The date for a weekday index (0 = Sunday) within the current week. */
function dateForWeekday(index: number): Date {
  const today = new Date();
  const d = new Date(today);
  d.setDate(today.getDate() - today.getDay() + index);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function WorkoutsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { colors, glass } = theme;

  const [range, setRange] = useState(0);
  const nDays = RANGE_DAYS[range];

  // The day being logged, independent of the chart's range. Samsung keeps
  // these separate too: you review a trend over weeks but you enter data for
  // one day at a time.
  const [dayIndex, setDayIndex] = useState(new Date().getDay());
  const day = dateForWeekday(dayIndex);

  const [workoutOpen, setWorkoutOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);

  const q = useQuery<Workout[]>(() => {
    const days = daysBack(nDays);
    const { start } = dayRange(days[0]);
    const { end } = dayRange(days[days.length - 1]);
    return listWorkouts(start, end);
  }, [nDays]);

  const dayQ = useQuery<Workout[]>(() => {
    const { start, end } = dayRange(day);
    return listWorkouts(start, end);
  }, [dayIndex]);

  const sleepQ = useQuery<SleepLog | null>(() => getSleep(day), [dayIndex]);
  const bodyQ = useQuery<BodyMetric | null>(() => getBody(day), [dayIndex]);

  const refetchDay = useCallback(() => {
    dayQ.refetch();
    sleepQ.refetch();
    bodyQ.refetch();
    q.refetch();
  }, [dayQ, sleepQ, bodyQ, q]);

  const workouts = q.data ?? [];
  const dayWorkouts = dayQ.data ?? [];
  const sleep = sleepQ.data ?? null;
  const body = bodyQ.data ?? null;
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

  function confirmDelete(w: Workout) {
    Alert.alert(w.name, "Delete this workout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteWorkout(w.id);
            refetchDay();
          } catch (e) {
            Alert.alert("Couldn't delete", e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <GlassScroll
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingBottom: insets.bottom + TAB_BAR_SPACE,
        }}
      >
        <Header title={"Your\nTraining"} subtitle="Log a day, then watch the trend" />

        {/* ----------------------------------------------------- day logging */}
        <View style={{ height: 18 }} />
        <DaySelector value={dayIndex} onChange={setDayIndex} />

        <View style={{ height: space.gap }} />
        <Pressable onPress={() => setWorkoutOpen(true)}>
          <GlassCard strong style={[styles.logCta, cardShadow(theme)]}>
            <View style={styles.logInner}>
              <View style={[styles.icon, { backgroundColor: colors.accent }]}>
                <Ionicons name="add" size={19} color={colors.onAccent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[t.cardTitle, { color: colors.text }]}>Log a workout</Text>
                <Text style={[t.label, { color: colors.textDim, marginTop: 3 }]}>
                  Exercises, sets, reps and weight
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
            </View>
          </GlassCard>
        </Pressable>

        {dayWorkouts.map((w) => (
          <Pressable key={w.id} onLongPress={() => confirmDelete(w)}>
            <GlassCard style={styles.row}>
              <View style={styles.rowInner}>
                <View style={[styles.icon, { backgroundColor: glass.track }]}>
                  <Ionicons name="barbell-outline" size={16} color={colors.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[t.cardTitle, { color: colors.text }]}>{w.name}</Text>
                  <Text style={[t.label, { color: colors.textDim, marginTop: 3 }]} numberOfLines={1}>
                    {/* Exercise names, deduped — five sets of bench is one
                        movement to the reader, not five lines. */}
                    {[...new Set((w.exercise_sets ?? []).map((s) => s.exercise))].join(", ") || "No sets"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[t.cardTitle, { color: colors.text }]}>
                    {Math.round(workoutVolume(w))} kg
                  </Text>
                  <Text style={[t.tiny, { color: colors.textFaint, marginTop: 3 }]}>
                    {(w.exercise_sets ?? []).length} sets
                    {w.duration_min ? ` · ${w.duration_min}m` : ""}
                  </Text>
                </View>
              </View>
            </GlassCard>
          </Pressable>
        ))}

        <View style={{ height: space.gap }} />
        <View style={styles.pairRow}>
          <Pressable style={{ flex: 1 }} onPress={() => setSleepOpen(true)}>
            <GlassCard style={styles.pair}>
              <View style={styles.pairInner}>
                <Ionicons name="moon-outline" size={18} color={colors.textDim} />
                <Text style={[t.label, { color: colors.textDim, marginTop: 10 }]}>Sleep</Text>
                <Metric
                  parts={[{ v: sleep ? formatMinutes(sleep.minutes) : "—" }]}
                  scale={0.5}
                  align="flex-start"
                />
                <Text style={[t.tiny, { color: colors.textFaint, marginTop: 4 }]}>
                  {sleep?.quality ? QUALITY[sleep.quality - 1] : "Tap to log"}
                </Text>
              </View>
            </GlassCard>
          </Pressable>

          <Pressable style={{ flex: 1 }} onPress={() => setBodyOpen(true)}>
            <GlassCard style={styles.pair}>
              <View style={styles.pairInner}>
                <Ionicons name="body-outline" size={18} color={colors.textDim} />
                <Text style={[t.label, { color: colors.textDim, marginTop: 10 }]}>Weight</Text>
                <Metric
                  parts={
                    body?.weight_kg != null
                      ? [{ v: String(body.weight_kg), u: "kg" }]
                      : [{ v: "—" }]
                  }
                  scale={0.5}
                  align="flex-start"
                />
                <Text style={[t.tiny, { color: colors.textFaint, marginTop: 4 }]}>
                  {body?.body_fat_pct != null ? `${body.body_fat_pct}% fat` : "Tap to log"}
                </Text>
              </View>
            </GlassCard>
          </Pressable>
        </View>

        {/* ------------------------------------------------------- the trend */}
        <View style={{ height: space.section }} />
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
          <WeekBars values={perDay} labels={labels} activeIndex={perDay.length - 1} height={128} />
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
            { k: "Avg / day", v: String(Math.round(totalVolume / Math.max(nDays, 1))) },
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
        <Text style={[t.cardTitle, { color: colors.text, marginBottom: 12 }]}>Sessions</Text>

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
            <Text style={[t.label, { color: colors.textDim, marginTop: 6, textAlign: "center" }]}>
              Tap "Log a workout" above to add your first one.
            </Text>
          </GlassCard>
        ) : (
          workouts.map((w) => (
            <Pressable key={w.id} onLongPress={() => confirmDelete(w)}>
              <GlassCard style={styles.row}>
                <View style={styles.rowInner}>
                  <View style={[styles.icon, { backgroundColor: glass.track }]}>
                    <Ionicons name="barbell-outline" size={16} color={colors.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[t.cardTitle, { color: colors.text }]}>{w.name}</Text>
                    <Text style={[t.label, { color: colors.textDim, marginTop: 3 }]}>
                      {new Date(w.started_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                      {" · "}
                      {(w.exercise_sets ?? []).length} sets
                      {w.duration_min ? ` · ${w.duration_min} min` : ""}
                    </Text>
                  </View>
                  <Text style={[t.cardTitle, { color: colors.text }]}>
                    {Math.round(workoutVolume(w))} kg
                  </Text>
                </View>
              </GlassCard>
            </Pressable>
          ))
        )}

        {sessions ? (
          <Text style={[t.label, { color: colors.textFaint, textAlign: "center", marginTop: 14 }]}>
            Long-press a workout to delete it.
          </Text>
        ) : null}
      </GlassScroll>

      <AddWorkoutSheet
        visible={workoutOpen}
        onClose={() => setWorkoutOpen(false)}
        onSaved={refetchDay}
        day={day}
      />
      <AddSleepSheet
        visible={sleepOpen}
        onClose={() => setSleepOpen(false)}
        onSaved={refetchDay}
        day={day}
        existing={sleep}
      />
      <AddBodySheet
        visible={bodyOpen}
        onClose={() => setBodyOpen(false)}
        onSaved={refetchDay}
        day={day}
        existing={body}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, paddingHorizontal: space.gutter },
  hero: { padding: 18 },
  logCta: { marginBottom: 10 },
  logInner: { flexDirection: "row", alignItems: "center", gap: 13, padding: 15 },
  metricWrap: { marginTop: 16, marginBottom: 20, minHeight: 62, justifyContent: "center" },
  statRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1 },
  statInner: { padding: 14 },
  pairRow: { flexDirection: "row", gap: 10 },
  pair: { flex: 1 },
  pairInner: { padding: 14 },
  row: { marginBottom: 10 },
  rowInner: { flexDirection: "row", alignItems: "center", gap: 13, padding: 15 },
  icon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 34, paddingHorizontal: 24 },
});
