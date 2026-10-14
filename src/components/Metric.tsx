import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { type as t } from "../theme";

export type MetricPart = { v: string; u?: string };

type Props = {
  parts: MetricPart[];
  caption?: string;
  /** Scales the whole group; 1 is the hero size from the reference. */
  scale?: number;
  align?: "center" | "flex-start";
};

/**
 * The reference's signature figure: large tight numerals with a much smaller
 * unit riding on the same baseline ("7h 42m", "1820 cal").
 */
export default function Metric({
  parts,
  caption,
  scale = 1,
  align = "center",
}: Props) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: align }}>
      <View style={styles.row}>
        {parts.map((p, i) => (
          <View key={i} style={styles.group}>
            <Text
              style={[
                t.display,
                {
                  fontSize: t.display.fontSize! * scale,
                  letterSpacing: t.display.letterSpacing! * scale,
                  color: colors.text,
                },
              ]}
            >
              {p.v}
            </Text>
            {p.u ? (
              <Text
                style={[
                  t.unit,
                  {
                    fontSize: t.unit.fontSize! * scale,
                    color: colors.textDim,
                    marginBottom: 7 * scale,
                    marginLeft: 1,
                  },
                ]}
              >
                {p.u}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {caption ? (
        <Text style={[t.label, { color: colors.textFaint, marginTop: 2 }]}>{caption}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end" },
  group: { flexDirection: "row", alignItems: "flex-end", marginRight: 10 },
});
