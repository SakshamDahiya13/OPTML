import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import GlassCard from "./GlassCard";
import { useTheme } from "../context/ThemeContext";
import { radius, type as t } from "../theme";
import { addWorkout, recentExercises } from "../lib/db";

/** A set the user is still typing. Strings, because "" is not 0. */
type DraftSet = { reps: string; weight: string };
type DraftExercise = { name: string; sets: DraftSet[] };

const PRESETS = [
  "Bench press", "Squat", "Deadlift", "Overhead press", "Barbell row",
  "Pull-up", "Lat pulldown", "Bicep curl", "Tricep pushdown", "Leg press",
  "Running", "Cycling", "Plank",
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** The day being logged — workouts land on the day you're looking at. */
  day: Date;
};

/**
 * Structured workout entry, Hevy-style: exercises hold sets, sets hold
 * weight and reps.
 *
 * Deliberately NOT a free-text box. A workout typed as prose can't be
 * charted, can't show a personal best, and can't tell you that last week you
 * benched 60kg for 8. The whole point of logging is the comparison.
 */
export default function AddWorkoutSheet({ visible, onClose, onSaved, day }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, glass } = useTheme();

  const [name, setName] = useState("");
  const [duration, setDuration] = useState("");
  const [exercises, setExercises] = useState<DraftExercise[]>([]);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loaded once per open. Your own history is a far better exercise list than
  // any fixed catalogue — most people rotate through the same dozen lifts.
  useEffect(() => {
    if (!visible) return;
    recentExercises().then(setRecent).catch(() => setRecent([]));
  }, [visible]);

  function reset() {
    setName("");
    setDuration("");
    setExercises([]);
    setPicking(false);
    setSearch("");
    setError(null);
  }

  function addExercise(exName: string) {
    const clean = exName.trim();
    if (!clean) return;
    // A new exercise starts with one empty set, so there's always something
    // to type into — an exercise with zero sets is a dead end.
    setExercises((xs) => [...xs, { name: clean, sets: [{ reps: "", weight: "" }] }]);
    setPicking(false);
    setSearch("");
  }

  function patchSet(ei: number, si: number, patch: Partial<DraftSet>) {
    setExercises((xs) =>
      xs.map((ex, i) =>
        i !== ei
          ? ex
          : { ...ex, sets: ex.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) }
      )
    );
  }

  function addSet(ei: number) {
    setExercises((xs) =>
      xs.map((ex, i) => {
        if (i !== ei) return ex;
        // Carry the last set's numbers forward. Sets are usually repeats of
        // each other, so this turns five taps into zero.
        const last = ex.sets[ex.sets.length - 1] ?? { reps: "", weight: "" };
        return { ...ex, sets: [...ex.sets, { ...last }] };
      })
    );
  }

  function removeSet(ei: number, si: number) {
    setExercises((xs) =>
      xs
        .map((ex, i) => (i === ei ? { ...ex, sets: ex.sets.filter((_, j) => j !== si) } : ex))
        // Deleting the last set deletes the exercise: an empty one is noise.
        .filter((ex) => ex.sets.length > 0)
    );
  }

  function removeExercise(ei: number) {
    setExercises((xs) => xs.filter((_, i) => i !== ei));
  }

  function num(v: string): number | null {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  async function save() {
    if (!exercises.length) {
      setError("Add at least one exercise.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // The chosen day, but at the current time of day — so two workouts on
      // the same date still sort correctly against each other.
      const now = new Date();
      const started = new Date(day);
      started.setHours(now.getHours(), now.getMinutes(), 0, 0);

      await addWorkout({
        name: name.trim() || "Workout",
        started_at: started,
        duration_min: num(duration),
        exercises: exercises.map((ex) => ({
          name: ex.name,
          sets: ex.sets.map((s) => ({ reps: num(s.reps), weight_kg: num(s.weight) })),
        })),
      });
      reset();
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const q = search.trim().toLowerCase();
  const options = [...recent, ...PRESETS.filter((p) => !recent.includes(p))].filter(
    (o) => !q || o.toLowerCase().includes(q)
  );

  const totalSets = exercises.reduce((n, ex) => n + ex.sets.length, 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <GlassCard
            strong
            radius={radius.xl}
            style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
          >
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.head}>
                <Text style={[t.screenTitle, { color: colors.text, fontSize: 24 }]}>
                  Log workout
                </Text>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={22} color={colors.textDim} />
                </Pressable>
              </View>

              <Text style={[t.tiny, { color: colors.textDim, marginTop: 18 }]}>SESSION</Text>
              <View style={styles.row2}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Push day"
                  placeholderTextColor={colors.textFaint}
                  style={[styles.input, { flex: 2, color: colors.text, backgroundColor: glass.track }]}
                />
                <View style={[styles.numWrap, { flex: 1, backgroundColor: glass.track }]}>
                  <TextInput
                    value={duration}
                    onChangeText={setDuration}
                    keyboardType="number-pad"
                    placeholder="45"
                    placeholderTextColor={colors.textFaint}
                    style={[styles.num, { color: colors.text }]}
                  />
                  <Text style={[t.label, { color: colors.textFaint }]}>min</Text>
                </View>
              </View>

              {exercises.map((ex, ei) => (
                <View key={`${ex.name}-${ei}`} style={styles.exBlock}>
                  <View style={styles.exHead}>
                    <Text style={[t.cardTitle, { color: colors.text }]}>{ex.name}</Text>
                    <Pressable onPress={() => removeExercise(ei)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={17} color={colors.textFaint} />
                    </Pressable>
                  </View>

                  <View style={styles.setHead}>
                    <Text style={[t.tiny, { color: colors.textFaint, width: 30 }]}>SET</Text>
                    <Text style={[t.tiny, { color: colors.textFaint, flex: 1 }]}>KG</Text>
                    <Text style={[t.tiny, { color: colors.textFaint, flex: 1 }]}>REPS</Text>
                    <View style={{ width: 26 }} />
                  </View>

                  {ex.sets.map((s, si) => (
                    <View key={si} style={styles.setRow}>
                      <Text style={[t.label, { color: colors.textDim, width: 30 }]}>
                        {si + 1}
                      </Text>
                      <TextInput
                        value={s.weight}
                        onChangeText={(v) => patchSet(ei, si, { weight: v })}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor={colors.textFaint}
                        style={[styles.setInput, { flex: 1, color: colors.text, backgroundColor: glass.track }]}
                      />
                      <TextInput
                        value={s.reps}
                        onChangeText={(v) => patchSet(ei, si, { reps: v })}
                        keyboardType="number-pad"
                        placeholder="—"
                        placeholderTextColor={colors.textFaint}
                        style={[styles.setInput, { flex: 1, color: colors.text, backgroundColor: glass.track }]}
                      />
                      <Pressable onPress={() => removeSet(ei, si)} hitSlop={8} style={{ width: 26, alignItems: "flex-end" }}>
                        <Ionicons name="close" size={15} color={colors.textFaint} />
                      </Pressable>
                    </View>
                  ))}

                  <Pressable onPress={() => addSet(ei)} style={[styles.addSet, { backgroundColor: glass.track }]}>
                    <Ionicons name="add" size={15} color={colors.textDim} />
                    <Text style={[t.label, { color: colors.textDim }]}>Add set</Text>
                  </Pressable>
                </View>
              ))}

              {picking ? (
                <View style={styles.picker}>
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    autoFocus
                    placeholder="Search or type a new exercise"
                    placeholderTextColor={colors.textFaint}
                    onSubmitEditing={() => addExercise(search)}
                    style={[styles.input, { color: colors.text, backgroundColor: glass.track }]}
                  />
                  <View style={styles.chips}>
                    {/* Anything you type is offered as-is, so the preset list
                        never blocks logging a movement we didn't think of. */}
                    {q && !options.some((o) => o.toLowerCase() === q) ? (
                      <Pressable onPress={() => addExercise(search)} style={[styles.chip, { backgroundColor: colors.accent }]}>
                        <Text style={[t.label, { color: colors.onAccent, fontWeight: "700" }]}>
                          Add "{search.trim()}"
                        </Text>
                      </Pressable>
                    ) : null}
                    {options.slice(0, 14).map((o) => (
                      <Pressable key={o} onPress={() => addExercise(o)} style={[styles.chip, { backgroundColor: glass.track }]}>
                        <Text style={[t.label, { color: colors.textDim }]}>{o}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable onPress={() => setPicking(false)} style={{ marginTop: 10 }}>
                    <Text style={[t.label, { color: colors.textFaint, textAlign: "center" }]}>
                      Cancel
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setPicking(true)} style={[styles.addEx, { borderColor: glass.track }]}>
                  <Ionicons name="add" size={17} color={colors.text} />
                  <Text style={[t.label, { color: colors.text, fontWeight: "600" }]}>
                    Add exercise
                  </Text>
                </Pressable>
              )}

              {error ? (
                <Text style={[t.label, { color: colors.danger, marginTop: 14 }]}>{error}</Text>
              ) : null}

              <Pressable onPress={save} disabled={saving} style={{ marginTop: 20 }}>
                <View style={[styles.cta, { backgroundColor: colors.accent }]}>
                  {saving ? (
                    <ActivityIndicator color={colors.onAccent} />
                  ) : (
                    <Text style={[t.cardTitle, { color: colors.onAccent }]}>
                      {totalSets ? `Save ${totalSets} ${totalSets === 1 ? "set" : "sets"}` : "Save workout"}
                    </Text>
                  )}
                </View>
              </Pressable>
            </ScrollView>
          </GlassCard>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.28)" },
  sheetWrap: { maxHeight: "92%" },
  sheet: { marginHorizontal: 10, paddingHorizontal: 20, paddingTop: 20 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row2: { flexDirection: "row", gap: 10, marginTop: 10 },
  input: { borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  numWrap: { flexDirection: "row", alignItems: "center", borderRadius: radius.md, paddingHorizontal: 14 },
  num: { flex: 1, paddingVertical: 14, fontSize: 15 },
  exBlock: { marginTop: 22 },
  exHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  setHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 2, marginBottom: 6 },
  setRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 7 },
  setInput: { borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, textAlign: "center" },
  addSet: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: radius.sm, marginTop: 3 },
  addEx: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 15, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", marginTop: 20 },
  picker: { marginTop: 20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill },
  cta: { borderRadius: radius.md, paddingVertical: 16, alignItems: "center" },
});
