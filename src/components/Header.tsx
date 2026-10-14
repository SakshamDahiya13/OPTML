import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import GlassCard from "./GlassCard";
import { useTheme } from "../context/ThemeContext";
import { radius, type as t } from "../theme";

type Props = { title: string; subtitle?: string; avatar?: boolean };

/** Two-line title with a round glass avatar, as in the reference. */
export default function Header({ title, subtitle, avatar = true }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={[t.screenTitle, { color: colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[t.label, { color: colors.textDim, marginTop: 5 }]}>{subtitle}</Text>
        ) : null}
      </View>
      {avatar ? (
        <GlassCard strong radius={radius.pill} style={styles.avatar}>
          <View style={styles.avatarInner}>
            <Ionicons name="person" size={17} color={colors.textDim} />
          </View>
        </GlassCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  text: { flex: 1, paddingRight: 14 },
  avatar: { width: 42, height: 42, marginTop: 2 },
  avatarInner: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
});
