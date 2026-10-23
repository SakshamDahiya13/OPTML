import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import GlassCard from "./GlassCard";
import { useTheme } from "../context/ThemeContext";
import { radius, type as t } from "../theme";

const PRESETS = [1, 3, 5, 10, 15, 20, 30, 45, 60];

// A long-short-long-short buzz reads as "alarm" rather than "notification" —
// a single vibrate() is easy to miss if the phone's in a pocket mid-run.
const ALARM_PATTERN = [0, 700, 300, 700, 300, 700, 300, 700];

type Stage = "setup" | "lead-in" | "running" | "paused" | "done";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called with the elapsed minutes, whether the timer finished or was stopped early. */
  onFinish: (minutes: number) => void;
  exerciseName: string;
};

function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * A countdown timer for duration-based exercise — running, cycling, planks,
 * anything measured in minutes rather than reps.
 *
 * Deliberately uses the device's built-in Vibration API for the alarm rather
 * than a bundled sound file: no asset to ship, no new native module, and it
 * works even with the phone silenced, which a notification sound wouldn't.
 */
export default function WorkoutTimer({ visible, onClose, onFinish, exerciseName }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, glass } = useTheme();

  const [stage, setStage] = useState<Stage>("setup");
  const [minutes, setMinutes] = useState(5);
  const [customMin, setCustomMin] = useState("");
  const [leadIn, setLeadIn] = useState(3);
  const [remaining, setRemaining] = useState(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (!visible) {
      setStage("setup");
      Vibration.cancel();
    }
  }, [visible]);

  // Lead-in: 3, 2, 1, then start. Gives the user a second to put the phone
  // down and actually start moving before the clock begins.
  useEffect(() => {
    if (stage !== "lead-in") return;
    if (leadIn <= 0) {
      setRemaining(minutes * 60);
      elapsedRef.current = 0;
      setStage("running");
      return;
    }
    const id = setTimeout(() => setLeadIn((n) => n - 1), 800);
    return () => clearTimeout(id);
  }, [stage, leadIn, minutes]);

  useEffect(() => {
    if (stage !== "running") return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          Vibration.vibrate(ALARM_PATTERN, true);
          setStage("done");
          return 0;
        }
        elapsedRef.current += 1;
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [stage]);

  function start() {
    const custom = parseFloat(customMin);
    const mins = Number.isFinite(custom) && custom > 0 ? custom : minutes;
    setMinutes(mins);
    setLeadIn(3);
    setStage("lead-in");
  }

  function finish(stopped: boolean) {
    Vibration.cancel();
    const mins = Math.max(1, Math.round(elapsedRef.current / 60) || (stopped ? 0 : minutes));
    onFinish(mins);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={styles.scrim}
          onPress={stage === "setup" ? onClose : undefined}
        />
        <View style={[styles.sheetWrap, { paddingBottom: insets.bottom + 24 }]}>
          <GlassCard strong radius={radius.xl} style={styles.sheet}>
            {stage === "setup" ? (
              <>
                <View style={styles.head}>
                  <Text style={[t.screenTitle, { color: colors.text, fontSize: 22 }]}>
                    Time {exerciseName}
                  </Text>
                  <Pressable onPress={onClose} hitSlop={10}>
                    <Ionicons name="close" size={22} color={colors.textDim} />
                  </Pressable>
                </View>

                <Text style={[t.tiny, { color: colors.textDim, marginTop: 18 }]}>DURATION</Text>
                <View style={styles.chips}>
                  {PRESETS.map((m) => {
                    const on = minutes === m && !customMin;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => {
                          setMinutes(m);
                          setCustomMin("");
                        }}
                        style={[styles.chip, { backgroundColor: on ? colors.accent : glass.track }]}
                      >
                        <Text style={[t.label, { color: on ? colors.onAccent : colors.textDim, fontWeight: on ? "700" : "500" }]}>
                          {m}m
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable onPress={start} style={{ marginTop: 22 }}>
                  <View style={[styles.cta, { backgroundColor: colors.accent }]}>
                    <Text style={[t.cardTitle, { color: colors.onAccent }]}>
                      Start {customMin || minutes} min
                    </Text>
                  </View>
                </Pressable>
              </>
            ) : null}

            {stage === "lead-in" ? (
              <View style={styles.center}>
                <Text style={[styles.bigNum, { color: colors.text }]}>
                  {leadIn > 0 ? leadIn : "GO"}
                </Text>
                <Text style={[t.label, { color: colors.textDim, marginTop: 8 }]}>Get ready</Text>
              </View>
            ) : null}

            {stage === "running" || stage === "paused" ? (
              <View style={styles.center}>
                <Text style={[styles.clock, { color: colors.text }]}>{mmss(remaining)}</Text>
                <Text style={[t.label, { color: colors.textDim, marginTop: 6 }]}>{exerciseName}</Text>
                <Pressable onPress={() => finish(true)} style={{ marginTop: 28 }}>
                  <View style={[styles.cta, styles.ctaWide, { backgroundColor: glass.track }]}>
                    <Text style={[t.cardTitle, { color: colors.text }]}>Stop</Text>
                  </View>
                </Pressable>
              </View>
            ) : null}

            {stage === "done" ? (
              <View style={styles.center}>
                <Ionicons name="checkmark-circle" size={40} color={colors.text} />
                <Text style={[t.screenTitle, { color: colors.text, fontSize: 22, marginTop: 10 }]}>
                  Time's up
                </Text>
                <Text style={[t.label, { color: colors.textDim, marginTop: 4 }]}>
                  {minutes} min of {exerciseName.toLowerCase()}
                </Text>
                <Pressable onPress={() => finish(false)} style={{ marginTop: 22, width: "100%" }}>
                  <View style={[styles.cta, { backgroundColor: colors.accent }]}>
                    <Text style={[t.cardTitle, { color: colors.onAccent }]}>Done</Text>
                  </View>
                </Pressable>
              </View>
            ) : null}
          </GlassCard>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)" },
  sheetWrap: { marginHorizontal: 10 },
  sheet: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill },
  cta: { borderRadius: radius.md, paddingVertical: 16, alignItems: "center" },
  ctaWide: { paddingHorizontal: 40 },
  center: { alignItems: "center", paddingVertical: 10 },
  bigNum: { fontSize: 64, fontWeight: "700" },
  clock: { fontSize: 56, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
