import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { useTheme } from "../context/ThemeContext";
import { TAB_BAR_SPACE, cardShadow, radius, space, type as t } from "../theme";
import GlassCard from "../components/GlassCard";
import GlassScroll from "../components/GlassScroll";
import Screen from "../components/Screen";
import Header from "../components/Header";
import ConfirmMealCard from "../components/ConfirmMealCard";
import ConfirmWorkoutCard from "../components/ConfirmWorkoutCard";
import ConfirmSleepCard from "../components/ConfirmSleepCard";
import { parseLog } from "../lib/parse";
import type { ParsedSleep, ParsedWorkout, ParseResult } from "../lib/db";

type Message =
  | { id: string; kind: "text"; from: "ai" | "me"; text: string }
  | { id: string; kind: "error"; from: "ai"; text: string }
  | { id: string; kind: "confirmFood"; from: "ai"; result: ParseResult }
  | { id: string; kind: "confirmWorkout"; from: "ai"; workout: ParsedWorkout }
  | { id: string; kind: "confirmSleep"; from: "ai"; sleep: ParsedSleep };

const INTRO: Message[] = [
  {
    id: "intro",
    kind: "text",
    from: "ai",
    text: "Tell me what you ate, a workout you did, or how you slept — \"2 eggs and toast\", \"did 3 sets of squats\", \"slept 7 hours\". I'll show you exactly what I understood before anything gets saved.",
  },
];

const QUICK = ["2 eggs and toast", "40 pushups", "slept 7 hours, felt good"];

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { colors, glass } = theme;

  const [messages, setMessages] = useState<Message[]>(INTRO);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  const push = useCallback((m: Message) => {
    setMessages((prev) => [...prev, m]);
  }, []);

  const send = useCallback(
    async (text?: string) => {
      const body = (text ?? input).trim();
      if (!body || busy) return;

      setInput("");
      push({ id: `u${Date.now()}`, kind: "text", from: "me", text: body });
      setBusy(true);

      try {
        const result = await parseLog(body);
        if (result.kind === "food") {
          push({ id: `c${Date.now()}`, kind: "confirmFood", from: "ai", result });
        } else if (result.kind === "workout" && result.workout) {
          push({ id: `w${Date.now()}`, kind: "confirmWorkout", from: "ai", workout: result.workout });
        } else if (result.kind === "sleep" && result.sleep) {
          push({ id: `s${Date.now()}`, kind: "confirmSleep", from: "ai", sleep: result.sleep });
        } else {
          push({
            id: `a${Date.now()}`,
            kind: "text",
            from: "ai",
            text: "I couldn't tell what to log from that. Try describing food, a workout, or how you slept.",
          });
        }
      } catch (e) {
        push({
          id: `e${Date.now()}`,
          kind: "error",
          from: "ai",
          text: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setBusy(false);
      }
    },
    [input, busy, push]
  );

  function dismiss(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <GlassScroll
          scrollRef={scrollRef}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
          style={styles.scroll}
          contentContainerStyle={{
            paddingTop: insets.top + 14,
            paddingBottom: insets.bottom + TAB_BAR_SPACE + 64,
          }}
        >
          <Header title="Coach" subtitle="Log a meal by describing it" />
          <View style={{ height: 20 }} />

          {messages.map((m) => {
            if (m.kind === "confirmFood") {
              return (
                <View key={m.id} style={styles.cardRow}>
                  <ConfirmMealCard
                    result={m.result}
                    onSaved={() => {}}
                    onDiscard={() => dismiss(m.id)}
                  />
                </View>
              );
            }
            if (m.kind === "confirmWorkout") {
              return (
                <View key={m.id} style={styles.cardRow}>
                  <ConfirmWorkoutCard
                    workout={m.workout}
                    onSaved={() => {}}
                    onDiscard={() => dismiss(m.id)}
                  />
                </View>
              );
            }
            if (m.kind === "confirmSleep") {
              return (
                <View key={m.id} style={styles.cardRow}>
                  <ConfirmSleepCard
                    sleep={m.sleep}
                    onSaved={() => {}}
                    onDiscard={() => dismiss(m.id)}
                  />
                </View>
              );
            }

            const mine = m.from === "me";
            return (
              <View
                key={m.id}
                style={[styles.bubbleRow, mine && styles.bubbleRowMe]}
              >
                {!mine ? (
                  <View style={[styles.badge, { backgroundColor: glass.track }]}>
                    <Ionicons
                      name={m.kind === "error" ? "alert-circle" : "sparkles"}
                      size={12}
                      color={m.kind === "error" ? colors.danger : colors.text}
                    />
                  </View>
                ) : null}
                <GlassCard strong={mine} radius={radius.lg} style={styles.bubble}>
                  <Text
                    style={[
                      styles.bubbleText,
                      { color: m.kind === "error" ? colors.danger : colors.text },
                    ]}
                  >
                    {m.text}
                  </Text>
                </GlassCard>
              </View>
            );
          })}

          {busy ? (
            <View style={styles.bubbleRow}>
              <View style={[styles.badge, { backgroundColor: glass.track }]}>
                <Ionicons name="sparkles" size={12} color={colors.text} />
              </View>
              <GlassCard radius={radius.lg} style={styles.bubble}>
                <View style={styles.thinking}>
                  <ActivityIndicator size="small" color={colors.textDim} />
                  <Text style={[t.label, { color: colors.textDim }]}>
                    Working it out…
                  </Text>
                </View>
              </GlassCard>
            </View>
          ) : null}

          {messages.length <= 1 && !busy ? (
            <View style={styles.quickRow}>
              {QUICK.map((q) => (
                <Pressable key={q} onPress={() => send(q)}>
                  <GlassCard radius={radius.pill} style={styles.quick}>
                    <Text style={[t.label, { color: colors.textDim }]}>{q}</Text>
                  </GlassCard>
                </Pressable>
              ))}
            </View>
          ) : null}
        </GlassScroll>

        <View
          style={[styles.composerWrap, { bottom: insets.bottom + TAB_BAR_SPACE - 10 }]}
          pointerEvents="box-none"
        >
          <GlassCard
            strong
            live
            radius={radius.pill}
            style={[styles.composer, cardShadow(theme)]}
          >
            <View style={styles.composerInner}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="What did you eat?"
                placeholderTextColor={colors.textFaint}
                style={[styles.input, { color: colors.text }]}
                onSubmitEditing={() => send()}
                returnKeyType="send"
                editable={!busy}
              />
              <Pressable onPress={() => send()} disabled={busy}>
                <View
                  style={[
                    styles.sendBtn,
                    { backgroundColor: busy ? glass.track : colors.accent },
                  ]}
                >
                  <Ionicons
                    name="arrow-up"
                    size={17}
                    color={busy ? colors.textFaint : colors.onAccent}
                  />
                </View>
              </Pressable>
            </View>
          </GlassCard>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, paddingHorizontal: space.gutter },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 9, marginBottom: 12 },
  bubbleRowMe: { justifyContent: "flex-end", paddingLeft: 48 },
  badge: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  bubble: { flexShrink: 1 },
  bubbleText: { fontSize: 14, lineHeight: 20, padding: 14 },
  thinking: { flexDirection: "row", alignItems: "center", gap: 9, padding: 14 },
  cardRow: { marginBottom: 12 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  quick: { paddingHorizontal: 14, paddingVertical: 9 },
  composerWrap: { position: "absolute", left: space.gutter, right: space.gutter },
  composer: { height: 54 },
  composerInner: {
    flexDirection: "row",
    alignItems: "center",
    height: 54,
    paddingLeft: 20,
    paddingRight: 6,
    gap: 8,
  },
  input: { flex: 1, fontSize: 14 },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
