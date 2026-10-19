import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../context/ThemeContext";
import { TAB_BAR_SPACE, radius, space, type as t } from "../theme";
import GlassCard from "../components/GlassCard";
import GlassScroll from "../components/GlassScroll";
import Screen from "../components/Screen";
import Header from "../components/Header";
import { useQuery } from "../hooks/useQuery";
import { Profile, getProfile, updateProfile } from "../lib/db";
import { supabase } from "../lib/supabase";

const GOALS: [keyof Profile, string, string][] = [
  ["goal_calories", "Calories", "kcal"],
  ["goal_protein_g", "Protein", "g"],
  ["goal_carbs_g", "Carbs", "g"],
  ["goal_fat_g", "Fat", "g"],
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, glass, mode, setMode } = useTheme();

  const q = useQuery<Profile | null>(() => getProfile(), []);
  const profile = q.data;

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Seed the inputs once the profile arrives, but never clobber something the
  // user is part-way through typing.
  useEffect(() => {
    if (!profile || dirty) return;
    setDraft({
      goal_calories: String(profile.goal_calories),
      goal_protein_g: String(profile.goal_protein_g),
      goal_carbs_g: String(profile.goal_carbs_g),
      goal_fat_g: String(profile.goal_fat_g),
    });
  }, [profile, dirty]);

  async function saveGoals() {
    setSaving(true);
    try {
      const patch: Partial<Profile> = {};
      for (const [key] of GOALS) {
        const n = parseInt(draft[key as string] ?? "", 10);
        if (Number.isFinite(n) && n >= 0) {
          (patch as Record<string, number>)[key as string] = n;
        }
      }
      await updateProfile(patch);
      setDirty(false);
      q.refetch();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleBodybuilder(on: boolean) {
    try {
      await updateProfile({ bodybuilder_mode: on });
      q.refetch();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : String(e));
    }
  }

  function handleLogOut() {
    Alert.alert("Log out?", "You'll need to log back in to keep logging.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => supabase.auth.signOut() },
    ]);
  }

  return (
    <Screen>
      <GlassScroll
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingBottom: insets.bottom + TAB_BAR_SPACE,
        }}
      >
        <Header title="Settings" subtitle="Goals, tracking and preferences" />

        <View style={{ height: 24 }} />
        <Text style={[t.tiny, { color: colors.textDim, marginBottom: 10 }]}>
          APPEARANCE
        </Text>
        <GlassCard style={styles.themeCard}>
          <View style={styles.themeRow}>
            {(["light", "dark"] as const).map((m) => {
              const active = mode === m;
              return (
                <Pressable key={m} style={styles.themeOption} onPress={() => setMode(m)}>
                  <View
                    style={[styles.themePill, active && { backgroundColor: colors.accent }]}
                  >
                    <Ionicons
                      name={m === "light" ? "sunny-outline" : "moon-outline"}
                      size={16}
                      color={active ? colors.onAccent : colors.textDim}
                    />
                    <Text
                      style={[
                        t.label,
                        {
                          color: active ? colors.onAccent : colors.textDim,
                          fontWeight: active ? "700" : "500",
                        },
                      ]}
                    >
                      {m === "light" ? "Light" : "Dark"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </GlassCard>

        <View style={{ height: space.section }} />
        <Text style={[t.tiny, { color: colors.textDim, marginBottom: 10 }]}>
          DAILY GOALS
        </Text>
        <GlassCard style={styles.pad}>
          {q.loading && !profile ? (
            <ActivityIndicator color={colors.textDim} />
          ) : (
            <>
              {GOALS.map(([key, label, unit], i) => (
                <View
                  key={key as string}
                  style={[
                    styles.goalRow,
                    i !== GOALS.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: glass.border,
                    },
                  ]}
                >
                  <Text style={[t.cardTitle, { color: colors.text, flex: 1 }]}>
                    {label}
                  </Text>
                  <TextInput
                    value={draft[key as string] ?? ""}
                    onChangeText={(v) => {
                      setDirty(true);
                      setDraft((d) => ({ ...d, [key as string]: v }));
                    }}
                    keyboardType="number-pad"
                    style={[
                      styles.goalInput,
                      { color: colors.text, backgroundColor: glass.track },
                    ]}
                  />
                  <Text style={[t.label, { color: colors.textFaint, width: 30 }]}>
                    {unit}
                  </Text>
                </View>
              ))}

              {dirty ? (
                <Pressable onPress={saveGoals} disabled={saving} style={{ marginTop: 14 }}>
                  <View style={[styles.save, { backgroundColor: colors.accent }]}>
                    {saving ? (
                      <ActivityIndicator color={colors.onAccent} />
                    ) : (
                      <Text style={[t.label, { color: colors.onAccent, fontWeight: "700" }]}>
                        Save goals
                      </Text>
                    )}
                  </View>
                </Pressable>
              ) : null}
            </>
          )}
        </GlassCard>

        <View style={{ height: space.section }} />
        <Text style={[t.tiny, { color: colors.textDim, marginBottom: 10 }]}>
          TRACKING
        </Text>
        <GlassCard style={styles.pad}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 14 }}>
              <Text style={[t.cardTitle, { color: colors.text }]}>
                Bodybuilder mode
              </Text>
              <Text style={[t.label, { color: colors.textDim, marginTop: 4 }]}>
                Match foods against a nutrition database for exact numbers and
                micronutrients, instead of AI estimates.
              </Text>
            </View>
            <Switch
              value={profile?.bodybuilder_mode ?? false}
              onValueChange={toggleBodybuilder}
              disabled={!profile}
              trackColor={{ false: glass.track, true: colors.accent }}
              thumbColor={colors.onAccent}
            />
          </View>
        </GlassCard>

        <View style={{ height: space.gap }} />
        <Pressable onPress={handleLogOut}>
          <GlassCard>
            <View style={styles.logoutInner}>
              <Ionicons name="log-out-outline" size={17} color={colors.danger} />
              <Text style={[t.cardTitle, { color: colors.danger }]}>Log out</Text>
            </View>
          </GlassCard>
        </Pressable>
      </GlassScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, paddingHorizontal: space.gutter },
  pad: { padding: 16 },
  themeCard: { padding: 5 },
  themeRow: { flexDirection: "row", gap: 5 },
  themeOption: { flex: 1 },
  themePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 },
  goalInput: {
    width: 86,
    textAlign: "right",
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    fontWeight: "600",
  },
  save: {
    height: 46,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  switchRow: { flexDirection: "row", alignItems: "center" },
  logoutInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
});
