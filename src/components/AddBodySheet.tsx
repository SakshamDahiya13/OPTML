import { useEffect, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import GlassCard from "./GlassCard";
import { useTheme } from "../context/ThemeContext";
import { radius, type as t } from "../theme";
import { BodyMetric, saveBody } from "../lib/db";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  day: Date;
  existing: BodyMetric | null;
};

/** Weight, body fat and waist for one day. Upserts — see saveBody. */
export default function AddBodySheet({ visible, onClose, onSaved, day, existing }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, glass } = useTheme();

  const [weight, setWeight] = useState("");
  const [fat, setFat] = useState("");
  const [waist, setWaist] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setWeight(existing?.weight_kg != null ? String(existing.weight_kg) : "");
    setFat(existing?.body_fat_pct != null ? String(existing.body_fat_pct) : "");
    setWaist(existing?.waist_cm != null ? String(existing.waist_cm) : "");
    setError(null);
  }, [visible, existing]);

  function num(v: string): number | null {
    if (!v.trim()) return null;
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  async function save() {
    const w = num(weight);
    const f = num(fat);
    const c = num(waist);
    if (w === null && f === null && c === null) {
      setError("Fill in at least one measurement.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await saveBody(day, { weight_kg: w, body_fat_pct: f, waist_cm: c });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const FIELDS: [string, string, (v: string) => void, string][] = [
    ["Weight", weight, setWeight, "kg"],
    ["Body fat", fat, setFat, "%"],
    ["Waist", waist, setWaist, "cm"],
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <GlassCard strong radius={radius.xl} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.head}>
                <Text style={[t.screenTitle, { color: colors.text, fontSize: 24 }]}>
                  {existing ? "Edit measurements" : "Add measurements"}
                </Text>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={22} color={colors.textDim} />
                </Pressable>
              </View>

              {FIELDS.map(([label, val, set, unit]) => (
                <View key={label} style={{ marginTop: 18 }}>
                  <Text style={[t.tiny, { color: colors.textDim, marginBottom: 8 }]}>
                    {label.toUpperCase()}
                  </Text>
                  <View style={[styles.numWrap, { backgroundColor: glass.track }]}>
                    <TextInput
                      value={val} onChangeText={set} keyboardType="decimal-pad"
                      placeholder="—" placeholderTextColor={colors.textFaint}
                      style={[styles.num, { color: colors.text }]}
                    />
                    <Text style={[t.label, { color: colors.textFaint }]}>{unit}</Text>
                  </View>
                </View>
              ))}

              {error ? <Text style={[t.label, { color: colors.danger, marginTop: 14 }]}>{error}</Text> : null}

              <Pressable onPress={save} disabled={saving} style={{ marginTop: 22 }}>
                <View style={[styles.cta, { backgroundColor: colors.accent }]}>
                  {saving ? <ActivityIndicator color={colors.onAccent} />
                    : <Text style={[t.cardTitle, { color: colors.onAccent }]}>Save</Text>}
                </View>
              </Pressable>

              <Text style={[t.label, { color: colors.textFaint, textAlign: "center", marginTop: 14 }]}>
                Weigh yourself at the same time each day — morning, before eating.
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
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.28)" },
  sheetWrap: { maxHeight: "92%" },
  sheet: { marginHorizontal: 10, paddingHorizontal: 20, paddingTop: 20 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  numWrap: { flexDirection: "row", alignItems: "center", borderRadius: radius.md, paddingHorizontal: 16 },
  num: { flex: 1, paddingVertical: 15, fontSize: 18, fontWeight: "600" },
  cta: { borderRadius: radius.md, paddingVertical: 16, alignItems: "center" },
});
