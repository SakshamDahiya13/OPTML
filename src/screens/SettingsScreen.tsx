import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../context/ThemeContext";
import { TAB_BAR_SPACE, radius, space, type as t } from "../theme";
import GlassCard from "../components/GlassCard";
import GlassScroll from "../components/GlassScroll";
import Screen from "../components/Screen";
import Header from "../components/Header";
import { supabase } from "../lib/supabase";

const MENU: { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string }[] = [
  { icon: "person-outline", label: "Profile" },
  { icon: "flag-outline", label: "Nutrition goals" },
  { icon: "barbell-outline", label: "Bodybuilder mode", sub: "Exact tracking instead of AI estimates" },
  { icon: "card-outline", label: "Subscription", sub: "Manage your plan" },
  { icon: "notifications-outline", label: "Notifications" },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, glass, mode, setMode } = useTheme();

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
        <Header title="Settings" subtitle="Profile, goals and preferences" />

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
                    style={[
                      styles.themePill,
                      active && { backgroundColor: colors.accent },
                    ]}
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
        <Text style={[t.tiny, { color: colors.textDim, marginBottom: 10 }]}>ACCOUNT</Text>
        <GlassCard>
          <View>
            {MENU.map((item, i) => (
              <View
                key={item.label}
                style={[
                  styles.row,
                  i !== MENU.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: glass.border,
                  },
                ]}
              >
                <View style={[styles.rowIcon, { backgroundColor: glass.track }]}>
                  <Ionicons name={item.icon} size={17} color={colors.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[t.cardTitle, { color: colors.text }]}>{item.label}</Text>
                  {item.sub ? (
                    <Text style={[t.label, { color: colors.textDim, marginTop: 3 }]}>
                      {item.sub}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
              </View>
            ))}
          </View>
        </GlassCard>

        <View style={{ height: space.gap }} />
        <Pressable onPress={handleLogOut}>
          <GlassCard style={styles.logout}>
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
  row: { flexDirection: "row", alignItems: "center", padding: 15, gap: 13 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  logout: {},
  logoutInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
});
