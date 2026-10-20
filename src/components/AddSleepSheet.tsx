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
import { SleepLog, formatMinutes, saveSleep } from "../lib/db";

const QUALITY = ["Awful", "Poor", "OK", "Good", "Great"];

/** "23:30" -> 1410 minutes past midnight. null if it isn't a real time. */
function parseTime(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2})[:.\s]?(\d{2})$/);
  if (!m) return null;
  const h = +m[1];
  const min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function fmtTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** The morning you woke up on. A night belongs to its wake-up date. */
  day: Date;
  existing: SleepLog | null;
};

export default function AddSleepSheet({ visible, onClose, onSaved, day, existing }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, glass } = useTheme();

  const [bed, setBed] = useState("23:00");
  const [wake, setWake] = useState("07:00");
  const [quality, setQuality] = useState<number>(3);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reopening on a night that's already logged should edit it, not silently
  // start blank and then overwrite it on save.
  useEffect(() => {
    if (!visible) return;
    if (existing) {
      setBed(fmtTime(new Date(existing.bed_at)));
      setWake(fmtTime(new Date(existing.wake_at)));
      setQuality(existing.quality ?? 3);
      setNote(existing.note ?? "");
    } else {
      setBed("23:00");
      setWake("07:00");
      setQuality(3);
      setNote("");
    }
    setError(null);
  }, [visible, existing]);

  const bedMin = parseTime(bed);
  const wakeMin = parseTime(wake);

  // Bedtime is almost always the previous evening, so a bedtime later in the
  // clock than the wake time means "yesterday". 23:00 -> 07:00 is 8 hours,
  // not minus 16.
  const duration =
    bedMin === null || wakeMin === null
      ? null
      : wakeMin > bedMin
        ? wakeMin - bedMin
        : wakeMin + 24 * 60 - bedMin;

  async function save() {
    if (bedMin === null || wakeMin === null) {
      setError("Enter times as HH:MM, e.g. 23:30.");
      return;
    }
    if (!duration) {
      setError("Bedtime and wake time can't be the same.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const wakeAt = new Date(day);
      wakeAt.setHours(Math.floor(wakeMin / 60), wakeMin % 60, 0, 0);
      const bedAt = new Date(wakeAt.getTime() - duration * 60000);

      await saveSleep({ night_of: day, bed_at: bedAt, wake_at: wakeAt, quality, note: note.trim() || null });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <GlassCard strong radius={radius.xl} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.head}>
                <Text style={[t.screenTitle, { color: colors.text, fontSize: 24 }]}>
                  {existing ? "Edit sleep" : "Log sleep"}
                </Text>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={22} color={colors.textDim} />
                </Pressable>
              </View>

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={[t.tiny, { color: colors.textDim, marginBottom: 8 }]}>WENT TO BED</Text>
                  <TextInput
                    value={bed} onChangeText={setBed} keyboardType="numbers-and-punctuation"
                    placeholder="23:00" placeholderTextColor={colors.textFaint}
                    style={[styles.time, { color: colors.text, backgroundColor: glass.track }]}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[t.tiny, { color: colors.textDim, marginBottom: 8 }]}>WOKE UP</Text>
                  <TextInput
                    value={wake} onChangeText={setWake} keyboardType="numbers-and-punctuation"
                    placeholder="07:00" placeholderTextColor={colors.textFaint}
                    style={[styles.time, { color: colors.text, backgroundColor: glass.track }]}
                  />
                </View>
              </View>

              <Text style={[t.cardTitle, { color: duration ? colors.text : colors.textFaint, textAlign: "center", marginTop: 16 }]}>
                {duration ? formatMinutes(duration) : "—"}
              </Text>

              <Text style={[t.tiny, { color: colors.textDim, marginTop: 22 }]}>HOW DID YOU FEEL</Text>
              <View style={styles.chips}>
                {QUALITY.map((label, i) => {
                  const on = quality === i + 1;
                  return (
                    <Pressable key={label} onPress={() => setQuality(i + 1)}
                      style={[styles.chip, { backgroundColor: on ? colors.accent : glass.track }]}>
                      <Text style={[t.label, { color: on ? colors.onAccent : colors.textDim, fontWeight: on ? "700" : "500" }]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[t.tiny, { color: colors.textDim, marginTop: 22 }]}>NOTE</Text>
              <TextInput
                value={note} onChangeText={setNote}
                placeholder="Woke up twice, room too warm"
                placeholderTextColor={colors.textFaint}
                style={[styles.input, { color: colors.text, backgroundColor: glass.track }]}
              />

              {error ? <Text style={[t.label, { color: colors.danger, marginTop: 14 }]}>{error}</Text> : null}

              <Pressable onPress={save} disabled={saving} style={{ marginTop: 22 }}>
                <View style={[styles.cta, { backgroundColor: colors.accent }]}>
                  {saving ? <ActivityIndicator color={colors.onAccent} />
                    : <Text style={[t.cardTitle, { color: colors.onAccent }]}>Save sleep</Text>}
                </View>
              </Pressable>

              <Text style={[t.label, { color: colors.textFaint, textAlign: "center", marginTop: 14 }]}>
                No sensor, so this is what you tell us — not a made-up score.
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
  row2: { flexDirection: "row", gap: 12, marginTop: 20 },
  time: { borderRadius: radius.md, paddingVertical: 16, fontSize: 22, fontWeight: "600", textAlign: "center" },
  input: { marginTop: 10, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill },
  cta: { borderRadius: radius.md, paddingVertical: 16, alignItems: "center" },
});
