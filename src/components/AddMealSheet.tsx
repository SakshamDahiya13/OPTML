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
import { radius, space, type as t } from "../theme";
import { Meal, addMeal, updateMeal } from "../lib/db";

const LABELS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Present when editing a meal that's already saved. */
  existing?: Meal | null;
};

/**
 * Manual meal entry.
 *
 * The modal is transparent so the app's wallpaper still shows behind it —
 * GlassCard composites against that, so panes in here read as the same glass
 * as everywhere else rather than floating on a grey slab.
 */
export default function AddMealSheet({ visible, onClose, onSaved, existing }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, glass } = useTheme();

  const [label, setLabel] = useState<string>("Breakfast");
  const [name, setName] = useState("");
  const [cal, setCal] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [f, setF] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setLabel("Breakfast");
    setName("");
    setCal("");
    setP("");
    setC("");
    setF("");
    setError(null);
  }

  // Editing prefills from the meal's current totals. A meal with several
  // items (anything parsed from chat) only has ONE name/macro set to show,
  // so its items are joined into a readable label — saving replaces them
  // all with the single edited item, which the "combines into one" note
  // below warns about before the user commits to it.
  useEffect(() => {
    if (!visible) return;
    if (existing) {
      setLabel(existing.label);
      const items = existing.meal_items ?? [];
      setName(items.length > 1 ? items.map((i) => i.name).join(", ") : items[0]?.name ?? existing.label);
      setCal(String(Math.round(existing.calories)));
      setP(String(Math.round(existing.protein_g)));
      setC(String(Math.round(existing.carbs_g)));
      setF(String(Math.round(existing.fat_g)));
    } else {
      reset();
    }
    setError(null);
  }, [visible, existing]);

  function num(v: string): number {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  async function save() {
    if (!name.trim()) {
      setError("Give the meal a name.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const item = {
        name: name.trim(),
        calories: num(cal),
        protein_g: num(p),
        carbs_g: num(c),
        fat_g: num(f),
      };
      if (existing) {
        await updateMeal(existing.id, item, label);
      } else {
        await addMeal({ label, items: [item] });
      }
      reset();
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const FIELDS: [string, string, (v: string) => void, string][] = [
    ["Calories", cal, setCal, "kcal"],
    ["Protein", p, setP, "g"],
    ["Carbs", c, setC, "g"],
    ["Fat", f, setF, "g"],
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
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
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.head}>
                <Text style={[t.screenTitle, { color: colors.text, fontSize: 24 }]}>
                  {existing ? "Edit meal" : "Add meal"}
                </Text>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={22} color={colors.textDim} />
                </Pressable>
              </View>

              <Text style={[t.tiny, { color: colors.textDim, marginTop: 18 }]}>
                WHEN
              </Text>
              <View style={styles.chips}>
                {LABELS.map((l) => {
                  const on = label === l;
                  return (
                    <Pressable
                      key={l}
                      onPress={() => setLabel(l)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: on ? colors.accent : glass.track,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          t.label,
                          {
                            color: on ? colors.onAccent : colors.textDim,
                            fontWeight: on ? "700" : "500",
                          },
                        ]}
                      >
                        {l}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[t.tiny, { color: colors.textDim, marginTop: 20 }]}>
                WHAT
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. 2 eggs, toast, black coffee"
                placeholderTextColor={colors.textFaint}
                style={[
                  styles.input,
                  { color: colors.text, backgroundColor: glass.track },
                ]}
              />

              <Text style={[t.tiny, { color: colors.textDim, marginTop: 20 }]}>
                MACROS
              </Text>
              <View style={styles.grid}>
                {FIELDS.map(([lab, val, set, unit]) => (
                  <View key={lab} style={styles.cell}>
                    <Text style={[t.label, { color: colors.textDim, marginBottom: 6 }]}>
                      {lab}
                    </Text>
                    <View
                      style={[styles.numWrap, { backgroundColor: glass.track }]}
                    >
                      <TextInput
                        value={val}
                        onChangeText={set}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={colors.textFaint}
                        style={[styles.num, { color: colors.text }]}
                      />
                      <Text style={[t.label, { color: colors.textFaint }]}>{unit}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {error ? (
                <Text style={[t.label, { color: colors.danger, marginTop: 14 }]}>
                  {error}
                </Text>
              ) : null}

              <Pressable onPress={save} disabled={saving} style={{ marginTop: 22 }}>
                <View style={[styles.cta, { backgroundColor: colors.accent }]}>
                  {saving ? (
                    <ActivityIndicator color={colors.onAccent} />
                  ) : (
                    <Text style={[t.cardTitle, { color: colors.onAccent }]}>
                      {existing ? "Save changes" : "Save meal"}
                    </Text>
                  )}
                </View>
              </Pressable>

              <Text
                style={[
                  t.label,
                  { color: colors.textFaint, textAlign: "center", marginTop: 14 },
                ]}
              >
                {existing && (existing.meal_items?.length ?? 0) > 1
                  ? "Saving combines this meal's items into one."
                  : "You can also log meals by describing them in chat."}
              </Text>
            </ScrollView>
          </GlassCard>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  sheetWrap: { maxHeight: "92%" },
  sheet: { marginHorizontal: 10, paddingHorizontal: 20, paddingTop: 20 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill },
  input: {
    marginTop: 10,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  cell: { width: "47.5%", flexGrow: 1 },
  numWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    paddingHorizontal: 14,
    gap: 6,
  },
  num: { flex: 1, fontSize: 17, fontWeight: "600", paddingVertical: 13 },
  cta: {
    height: 54,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
