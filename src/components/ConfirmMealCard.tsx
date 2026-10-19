import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import GlassCard from "./GlassCard";
import { useTheme } from "../context/ThemeContext";
import { radius, type as t } from "../theme";
import {
  Confidence,
  ParsedItem,
  ParseResult,
  addParsedMeal,
  recordCorrection,
} from "../lib/db";

const LABELS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

const MACROS = [
  ["calories", "calories_min", "calories_max", "Calories", "kcal"],
  ["protein_g", "protein_min", "protein_max", "Protein", "g"],
  ["carbs_g", "carbs_min", "carbs_max", "Carbs", "g"],
  ["fat_g", "fat_min", "fat_max", "Fat", "g"],
] as const;

type MacroKey = (typeof MACROS)[number][0];

const CONFIDENCE_COPY: Record<Confidence, string> = {
  high: "Confident",
  medium: "Rough estimate",
  low: "Very rough — check this",
};

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "130–160" — or just the number when the bounds collapsed onto it. */
function rangeText(lo: number, hi: number, point: number): string {
  const l = Math.round(lo);
  const h = Math.round(hi);
  return l === h ? String(Math.round(point)) : `${l}–${h}`;
}

type Props = {
  result: ParseResult;
  onSaved: () => void;
  onDiscard: () => void;
};

/**
 * What the AI understood, before anything is written.
 *
 * Every number here is editable, and every edit is recorded as a correction —
 * that is what teaches this user's portions and what measures our real bias.
 * A correction also collapses that field's range onto the entered value: once
 * a human has said what it was, there is no uncertainty left to display.
 */
export default function ConfirmMealCard({ result, onSaved, onDiscard }: Props) {
  const { colors, glass } = useTheme();

  const [label, setLabel] = useState<string>(result.label);
  const [items, setItems] = useState<ParsedItem[]>(result.items);
  const [open, setOpen] = useState<number | null>(
    // Open the least certain item by default, so the thing most likely to be
    // wrong is the thing the user is looking at.
    result.items.findIndex((i) => i.confidence === "low") >= 0
      ? result.items.findIndex((i) => i.confidence === "low")
      : null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Frozen copy of what the AI said, for diffing on save.
  const original = useMemo(() => result.items.map((i) => ({ ...i })), [result]);

  const totals = useMemo(() => {
    const sum = (k: string) =>
      items.reduce((s, i) => s + Number((i as never)[k] ?? 0), 0);
    return {
      calories: sum("calories"),
      lo: sum("calories_min"),
      hi: sum("calories_max"),
      protein: sum("protein_g"),
      carbs: sum("carbs_g"),
      fat: sum("fat_g"),
    };
  }, [items]);

  function edit(index: number, key: MacroKey, raw: string) {
    const value = parseFloat(raw.replace(",", "."));
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item };
        const n = Number.isFinite(value) && value >= 0 ? value : 0;
        (next as Record<string, unknown>)[key] = n;
        // A human answer has no range.
        const spec = MACROS.find((m) => m[0] === key)!;
        (next as Record<string, unknown>)[spec[1]] = n;
        (next as Record<string, unknown>)[spec[2]] = n;
        next.confidence = "high";
        return next;
      })
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await addParsedMeal(label, items, result.raw_text);

      // Log what changed. Best effort — never block the save on it.
      await Promise.all(
        items.flatMap((item, i) => {
          const was = original[i];
          if (!was) return [];
          return MACROS.flatMap(([key]) => {
            const before = Number(was[key] ?? 0);
            const after = Number(item[key] ?? 0);
            return Math.abs(before - after) < 0.5
              ? []
              : [recordCorrection(item.name, key, before, after)];
          });
        })
      );

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
          Logged to {label.toLowerCase()} — {Math.round(totals.calories)} kcal
        </Text>
      </GlassCard>
    );
  }

  return (
    <GlassCard strong radius={radius.lg} style={styles.card}>
      <View style={styles.inner}>
        <View style={styles.chips}>
          {LABELS.map((l) => {
            const on = label === l;
            return (
              <Pressable
                key={l}
                onPress={() => setLabel(l)}
                style={[
                  styles.chip,
                  { backgroundColor: on ? colors.accent : glass.track },
                ]}
              >
                <Text
                  style={[
                    t.tiny,
                    { color: on ? colors.onAccent : colors.textDim },
                  ]}
                >
                  {l.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {items.length === 0 ? (
          <Text style={[t.label, { color: colors.textDim, marginTop: 14 }]}>
            I couldn't find any food in that.
          </Text>
        ) : null}

        {items.map((item, i) => {
          const expanded = open === i;
          return (
            <View
              key={`${item.name}-${i}`}
              style={[styles.item, { borderTopColor: glass.border }]}
            >
              <Pressable
                onPress={() => setOpen(expanded ? null : i)}
                style={styles.itemHead}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[t.cardTitle, { color: colors.text }]}>
                    {item.qty ? `${round(item.qty)} ` : ""}
                    {item.unit && item.unit !== "piece" ? `${item.unit} ` : ""}
                    {item.name}
                  </Text>
                  <Text
                    style={[
                      t.tiny,
                      {
                        color:
                          item.confidence === "low"
                            ? colors.danger
                            : colors.textFaint,
                        marginTop: 3,
                      },
                    ]}
                  >
                    {CONFIDENCE_COPY[item.confidence]}
                  </Text>
                </View>
                <Text style={[t.cardTitle, { color: colors.text }]}>
                  {Math.round(item.calories)}
                </Text>
                <Ionicons
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={15}
                  color={colors.textFaint}
                  style={{ marginLeft: 8 }}
                />
              </Pressable>

              {expanded ? (
                <View style={styles.detail}>
                  <Text style={[t.label, { color: colors.textDim }]}>
                    Likely between{" "}
                    <Text style={{ color: colors.text, fontWeight: "700" }}>
                      {rangeText(
                        item.calories_min,
                        item.calories_max,
                        item.calories
                      )}{" "}
                      kcal
                    </Text>
                  </Text>

                  {item.assumptions ? (
                    <View style={[styles.working, { backgroundColor: glass.track }]}>
                      {item.assumptions.matched ? (
                        <Text style={[t.tiny, { color: colors.textDim }]}>
                          Matched: {item.assumptions.matched}
                        </Text>
                      ) : null}
                      {item.assumptions.portion ? (
                        <Text style={[t.tiny, { color: colors.textDim, marginTop: 3 }]}>
                          Portion: {item.assumptions.portion}
                        </Text>
                      ) : null}
                      {item.assumptions.note ? (
                        <Text style={[t.tiny, { color: colors.textDim, marginTop: 3 }]}>
                          Guessed: {item.assumptions.note}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  <View style={styles.grid}>
                    {MACROS.map(([key, , , labelText, unit]) => (
                      <View key={key} style={styles.cell}>
                        <Text style={[t.tiny, { color: colors.textFaint }]}>
                          {labelText.toUpperCase()}
                        </Text>
                        <View
                          style={[styles.field, { backgroundColor: glass.track }]}
                        >
                          <TextInput
                            defaultValue={String(round(Number(item[key] ?? 0)))}
                            onChangeText={(v) => edit(i, key, v)}
                            keyboardType="decimal-pad"
                            style={[styles.input, { color: colors.text }]}
                          />
                          <Text style={[t.tiny, { color: colors.textFaint }]}>
                            {unit}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  <Text style={[t.tiny, { color: colors.textFaint, marginTop: 10 }]}>
                    Fix anything that's wrong — I'll remember it next time.
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}

        <View style={[styles.totals, { borderTopColor: glass.borderStrong }]}>
          <View style={{ flex: 1 }}>
            <Text style={[t.cardTitle, { color: colors.text }]}>
              {Math.round(totals.calories)} kcal
            </Text>
            <Text style={[t.tiny, { color: colors.textFaint, marginTop: 2 }]}>
              {rangeText(totals.lo, totals.hi, totals.calories)} kcal ·{" "}
              {Math.round(totals.protein)}P {Math.round(totals.carbs)}C{" "}
              {Math.round(totals.fat)}F
            </Text>
          </View>
        </View>

        {result.priors_used > 0 ? (
          <Text style={[t.tiny, { color: colors.textFaint, marginTop: 8 }]}>
            Used {result.priors_used} of your past corrections.
          </Text>
        ) : null}

        {error ? (
          <Text style={[t.label, { color: colors.danger, marginTop: 10 }]}>
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Pressable onPress={onDiscard} style={styles.discard} disabled={saving}>
            <Text style={[t.label, { color: colors.textDim }]}>Discard</Text>
          </Pressable>
          <Pressable
            onPress={save}
            disabled={saving || items.length === 0}
            style={{ flex: 1 }}
          >
            <View
              style={[
                styles.save,
                {
                  backgroundColor:
                    items.length === 0 ? glass.track : colors.accent,
                },
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={[t.label, { color: colors.onAccent, fontWeight: "700" }]}>
                  Save meal
                </Text>
              )}
            </View>
          </Pressable>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 4 },
  inner: { padding: 14 },
  chips: { flexDirection: "row", gap: 6 },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.pill },
  item: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12 },
  itemHead: { flexDirection: "row", alignItems: "center" },
  detail: { marginTop: 12 },
  working: { borderRadius: radius.sm, padding: 10, marginTop: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  cell: { width: "47%", flexGrow: 1 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    marginTop: 5,
    gap: 5,
  },
  input: { flex: 1, fontSize: 15, fontWeight: "600", paddingVertical: 9 },
  totals: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
    paddingTop: 12,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  discard: { paddingHorizontal: 16, paddingVertical: 13 },
  save: {
    height: 46,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  saved: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    marginTop: 4,
  },
});
