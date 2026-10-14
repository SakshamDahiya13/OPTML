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

type Props = NativeStackScreenProps<AuthStackParamList, "SignUp">;

export default function SignUpScreen({ navigation }: Props) {
  const theme = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  async function handleSignUp() {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setError(null);
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // If email confirmation is on there's no session yet, so tell the user to
    // check their inbox. If it's off, onAuthStateChange in App.tsx picks the
    // session up and this screen just unmounts.
    if (!data.session) {
      setInfoMessage("Check your inbox to confirm your email, then sign in.");
    }
  }

  const FIELDS = [
    {
      label: "EMAIL",
      value: email,
      set: setEmail,
      placeholder: "you@example.com",
      secure: false,
      email: true,
    },
    {
      label: "PASSWORD",
      value: password,
      set: setPassword,
      placeholder: "At least 6 characters",
      secure: true,
      email: false,
    },
    {
      label: "CONFIRM PASSWORD",
      value: confirmPassword,
      set: setConfirmPassword,
      placeholder: "Repeat your password",
      secure: true,
      email: false,
    },
  ];

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
            Create your{"\n"}account
          </Text>

          <View style={{ height: 24 }} />

          {FIELDS.map((f, i) => (
            <View key={f.label} style={{ marginTop: i === 0 ? 0 : 10 }}>
              <GlassCard>
                <View style={styles.fieldInner}>
                  <Text style={[t.tiny, { color: colors.textDim }]}>{f.label}</Text>
                  <TextInput
                    value={f.value}
                    onChangeText={f.set}
                    secureTextEntry={f.secure}
                    autoCapitalize="none"
                    keyboardType={f.email ? "email-address" : "default"}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.textFaint}
                    style={[styles.input, { color: colors.text }]}
                  />
                </View>
              </GlassCard>
            </View>
          ))}

          {error ? (
            <Text style={[t.label, { color: colors.danger, marginTop: 12 }]}>{error}</Text>
          ) : null}
          {infoMessage ? (
            <Text style={[t.label, { color: colors.textDim, marginTop: 12 }]}>
              {infoMessage}
            </Text>
          ) : null}

          <View style={{ height: 20 }} />

          <Pressable onPress={handleSignUp} disabled={loading}>
            <View style={[styles.cta, { backgroundColor: colors.accent }, cardShadow(theme)]}>
              {loading ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={[t.cardTitle, { color: colors.onAccent }]}>Create account</Text>
              )}
            </View>
          </Pressable>

          <Pressable onPress={() => navigation.navigate("Login")} style={styles.alt}>
            <Text style={[t.label, { color: colors.textDim }]}>
              Already have an account?{" "}
              <Text style={{ color: colors.text, fontWeight: "700" }}>Sign in</Text>
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
