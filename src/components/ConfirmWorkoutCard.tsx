import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import GlassCard from "./GlassCard";
import { useTheme } from "../context/ThemeContext";
import { radius, type as t } from "../theme";
import { ParsedWorkout, addWorkout } from "../lib/db";

type Props = {
  workout: ParsedWorkout;
  onSaved: () => void;
  onDiscard: () => void;
};

/**
 * Chat's workout confirm card — a summary, not an editor.
 *
 * ConfirmMealCard lets you fix a macro because a macro can be silently wrong
 * in either direction. A set the user just typed ("40 pushups") can't be
 * wrong the same way: they stated it, so this is read-and-confirm rather
 * than read-and-correct. Anything that needs editing is what the Workout
 * tab's full sheet is for.
 */
export default function ConfirmWorkoutCard({ workout, onSaved, onDiscard }: Props) {
  const { colors, glass } = useTheme();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const totalSets = workout.exercises.reduce((n, e) => n + e.sets.length, 0);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await addWorkout({
        name: workout.name,
        exercises: workout.exercises.map((e) => ({
          name: e.name,
          sets: e.sets.map((s) => ({ reps: s.reps, weight_kg: s.weight_kg })),
        })),
      });
      setDone(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <GlassCard style={styles.saved}>
        <Ionicons name="checkmark-circle" size={17} color={colors.text} />
        <Text style={[t.label, { color: colors.text }]}>
          Logged {workout.name.toLowerCase()} — {totalSets} {totalSets === 1 ? "set" : "sets"}
        </Text>
      </GlassCard>
    );
  }

  return (
    <GlassCard strong radius={radius.lg} style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: glass.track }]}>
          <Ionicons name="barbell-outline" size={16} color={colors.text} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[t.cardTitle, { color: colors.text }]}>{workout.name}</Text>
          <Text style={[t.label, { color: colors.textDim, marginTop: 2 }]}>
            {totalSets} {totalSets === 1 ? "set" : "sets"}
          </Text>
        </View>
      </View>

      {workout.exercises.map((ex, i) => (
        <View key={i} style={styles.exRow}>
          <Text style={[t.label, { color: colors.text, fontWeight: "600" }]}>{ex.name}</Text>
          <Text style={[t.label, { color: colors.textDim, marginTop: 2 }]}>
            {ex.sets
              .map((s) =>
                s.reps != null && s.weight_kg != null
                  ? `${s.reps} × ${s.weight_kg}kg`
                  : s.reps != null
                    ? `${s.reps} reps`
                    : "1 set"
              )
              .join(" · ")}
          </Text>
        </View>
      ))}

      {error ? <Text style={[t.label, { color: colors.danger, marginTop: 10 }]}>{error}</Text> : null}

      <View style={styles.actions}>
        <Pressable onPress={onDiscard} style={styles.ghost} disabled={saving}>
          <Text style={[t.label, { color: colors.textDim }]}>Discard</Text>
        </Pressable>
        <Pressable onPress={save} disabled={saving} style={{ flex: 1 }}>
          <View style={[styles.cta, { backgroundColor: colors.accent }]}>
            {saving ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={[t.label, { color: colors.onAccent, fontWeight: "700" }]}>
                Log workout
              </Text>
            )}
          </View>
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  saved: { flexDirection: "row", alignItems: "center", gap: 9, padding: 14 },
  card: { padding: 16, marginBottom: 2 },
  head: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 12 },
  icon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  exRow: { marginTop: 8 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  ghost: { paddingHorizontal: 14, justifyContent: "center" },
  cta: { borderRadius: radius.md, paddingVertical: 13, alignItems: "center" },
});
