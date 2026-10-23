import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import GlassCard from "./GlassCard";
import { useTheme } from "../context/ThemeContext";
import { radius, type as t } from "../theme";
import { ParsedSleep, formatMinutes, saveSleep } from "../lib/db";

const QUALITY = ["Awful", "Poor", "OK", "Good", "Great"];

type Props = {
  sleep: ParsedSleep;
  onSaved: () => void;
  onDiscard: () => void;
};

/** "HH:MM" -> minutes past midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Turns whatever the message stated into concrete bed/wake timestamps for
 * tonight's log entry.
 *
 * The chat message is assumed to describe the night that just ended — "I
 * slept 7 hours" said at 9am means last night, not a prediction for tonight.
 * So "now" anchors the wake side, and bed time is derived backward from it.
 */
function resolveTimes(sleep: ParsedSleep): { bed: Date; wake: Date; minutes: number } {
  const now = new Date();

  if (sleep.wake_time) {
    const wake = new Date(now);
    const wm = toMinutes(sleep.wake_time);
    wake.setHours(Math.floor(wm / 60), wm % 60, 0, 0);

    if (sleep.bed_time) {
      const bm = toMinutes(sleep.bed_time);
      const minutes = bm > wm ? 24 * 60 - bm + wm : wm - bm;
      const bed = new Date(wake.getTime() - minutes * 60000);
      return { bed, wake, minutes };
    }
    if (sleep.hours) {
      const minutes = Math.round(sleep.hours * 60);
      return { bed: new Date(wake.getTime() - minutes * 60000), wake, minutes };
    }
  }

  // Only a duration, or nothing specific: anchor wake to right now.
  const minutes = sleep.hours ? Math.round(sleep.hours * 60) : 8 * 60;
  return { bed: new Date(now.getTime() - minutes * 60000), wake: now, minutes };
}

export default function ConfirmSleepCard({ sleep, onSaved, onDiscard }: Props) {
  const { colors, glass } = useTheme();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { bed, wake, minutes } = resolveTimes(sleep);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveSleep({ night_of: wake, bed_at: bed, wake_at: wake, quality: sleep.quality });
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
          Logged {formatMinutes(minutes)} of sleep
        </Text>
      </GlassCard>
    );
  }

  return (
    <GlassCard strong radius={radius.lg} style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: glass.track }]}>
          <Ionicons name="moon-outline" size={16} color={colors.text} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[t.cardTitle, { color: colors.text }]}>{formatMinutes(minutes)} sleep</Text>
          <Text style={[t.label, { color: colors.textDim, marginTop: 2 }]}>
            {sleep.quality ? QUALITY[sleep.quality - 1] : "No quality mentioned"}
          </Text>
        </View>
      </View>

      {!sleep.hours && !sleep.bed_time ? (
        <Text style={[t.label, { color: colors.textDim, marginTop: 4 }]}>
          No duration given — defaulted to 8h. Fix it on the Training tab if that's off.
        </Text>
      ) : null}

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
                Log sleep
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
  head: { flexDirection: "row", alignItems: "center", gap: 11 },
  icon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  ghost: { paddingHorizontal: 14, justifyContent: "center" },
  cta: { borderRadius: radius.md, paddingVertical: 13, alignItems: "center" },
});
