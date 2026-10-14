import { useRef, useState } from "react";
import {
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

type Message = { id: string; from: "ai" | "me"; text: string };

const INITIAL: Message[] = [
  {
    id: "1",
    from: "ai",
    text: "Morning. Log anything you eat in plain language and I'll work out the macros — no weighing required.",
  },
  { id: "2", from: "me", text: "2 eggs, a slice of toast and a black coffee" },
  {
    id: "3",
    from: "ai",
    text: "Logged — about 380 kcal, 22 g protein. That's a solid start. You've got 2,020 kcal left today.",
  },
];

const QUICK = ["Log a meal", "What should I eat?", "How am I doing?"];

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { colors, glass } = theme;
  const [messages, setMessages] = useState<Message[]>(INITIAL);
  const [input, setInput] = useState("");
  const scrollRef = useRef<ScrollView | null>(null);

  function send(text?: string) {
    const body = (text ?? input).trim();
    if (!body) return;
    setMessages((prev) => [
      ...prev,
      { id: String(Date.now()), from: "me", text: body },
      {
        id: String(Date.now() + 1),
        from: "ai",
        text: "Got it — I've added that to today's log and updated your macros.",
      },
    ]);
    setInput("");
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
          <Header title="Coach" subtitle="Your nutrition AI" />
          <View style={{ height: 20 }} />

          {messages.map((m) => (
            <View
              key={m.id}
              style={[styles.bubbleRow, m.from === "me" && styles.bubbleRowMe]}
            >
              {m.from === "ai" ? (
                <View style={[styles.aiBadge, { backgroundColor: glass.track }]}>
                  <Ionicons name="sparkles" size={12} color={colors.text} />
                </View>
              ) : null}
              <GlassCard
                strong={m.from === "me"}
                radius={radius.lg}
                style={styles.bubble}
              >
                <Text style={[styles.bubbleText, { color: colors.text }]}>{m.text}</Text>
              </GlassCard>
            </View>
          ))}

          <View style={styles.quickRow}>
            {QUICK.map((q) => (
              <Pressable key={q} onPress={() => send(q)}>
                <GlassCard radius={radius.pill} style={styles.quick}>
                  <Text style={[t.label, { color: colors.textDim }]}>{q}</Text>
                </GlassCard>
              </Pressable>
            ))}
          </View>
        </GlassScroll>

        <View
          style={[
            styles.composerWrap,
            { bottom: insets.bottom + TAB_BAR_SPACE - 10 },
          ]}
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
                placeholder="Tell me what you ate…"
                placeholderTextColor={colors.textFaint}
                style={[styles.input, { color: colors.text }]}
                onSubmitEditing={() => send()}
                returnKeyType="send"
              />
              <Pressable onPress={() => send()} style={styles.sendWrap}>
                <View style={[styles.send, { backgroundColor: colors.accent }]}>
                  <Ionicons name="arrow-up" size={17} color={colors.onAccent} />
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
  aiBadge: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  bubble: { flexShrink: 1 },
  bubbleText: { fontSize: 14, lineHeight: 20, padding: 14 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
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
  sendWrap: { padding: 1 },
  send: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
