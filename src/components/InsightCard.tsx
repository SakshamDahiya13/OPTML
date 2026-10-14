import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import GlassCard from "./GlassCard";
import { useTheme } from "../context/ThemeContext";
import { radius, type as t } from "../theme";

type Props = { title: string; body?: string };

/** The blush "AI detected…" callout from the reference. */
export default function InsightCard({ title, body }: Props) {
  const { colors, insight } = useTheme();
  return (
    <GlassCard radius={radius.lg} wash={insight.bg} style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: insight.icon }]}>
          <Ionicons name="sparkles" size={13} color={colors.text} />
        </View>
        <Text style={[t.cardTitle, { color: colors.text, flex: 1 }]}>{title}</Text>
      </View>
      {body ? (
        <Text style={[t.label, { color: colors.textDim, marginTop: 7, lineHeight: 17 }]}>
          {body}
        </Text>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
