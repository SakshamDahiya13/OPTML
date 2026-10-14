import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../context/ThemeContext";
import { cardShadow, radius, space, type as t } from "../theme";
import GlassCard from "../components/GlassCard";
import Screen from "../components/Screen";
import { supabase } from "../lib/supabase";
import type { AuthStackParamList } from "../navigation/AuthStack";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const theme = useTheme();
  const { colors, glass } = theme;
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) setError(error.message);
    // On success the onAuthStateChange listener in App.tsx switches to the
    // main tabs automatically — nothing else to do here.
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.container,
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 26 },
          ]}
        >
          <View style={styles.brandRow}>
            <View style={[styles.mark, { backgroundColor: colors.accent }]}>
              <Ionicons name="flash" size={15} color={colors.onAccent} />
            </View>
            <Text style={[t.tiny, { color: colors.textDim }]}>OPTML</Text>
          </View>

          <View style={styles.spacer} />

          <Text style={[styles.headline, { color: colors.text }]}>
            Your training{"\n"}starts with{"\n"}what you eat
          </Text>

          <View style={{ height: 28 }} />

          <GlassCard style={styles.field}>
            <View style={styles.fieldInner}>
              <Text style={[t.tiny, { color: colors.textDim }]}>EMAIL</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={colors.textFaint}
                style={[styles.input, { color: colors.text }]}
              />
            </View>
          </GlassCard>

          <View style={{ height: 10 }} />

          <GlassCard style={styles.field}>
            <View style={styles.fieldInner}>
              <Text style={[t.tiny, { color: colors.textDim }]}>PASSWORD</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textFaint}
                style={[styles.input, { color: colors.text }]}
              />
            </View>
          </GlassCard>

          {error ? (
            <Text style={[t.label, { color: colors.danger, marginTop: 12 }]}>{error}</Text>
          ) : null}

          <View style={{ height: 20 }} />

          <Pressable onPress={handleLogin} disabled={loading}>
            <View style={[styles.cta, { backgroundColor: colors.accent }, cardShadow(theme)]}>
              {loading ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={[t.cardTitle, { color: colors.onAccent }]}>Sign in</Text>
              )}
            </View>
          </Pressable>

          <Pressable onPress={() => navigation.navigate("SignUp")} style={styles.alt}>
            <Text style={[t.label, { color: colors.textDim }]}>
              Don't have an account?{" "}
              <Text style={{ color: colors.text, fontWeight: "700" }}>Create one</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: space.gutter },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  mark: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  spacer: { flex: 1 },
  headline: { fontSize: 38, fontWeight: "600", letterSpacing: -1.4, lineHeight: 43 },
  field: {},
  fieldInner: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 6 },
  input: { fontSize: 15, paddingVertical: 8 },
  cta: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  alt: { alignItems: "center", marginTop: 20 },
});
