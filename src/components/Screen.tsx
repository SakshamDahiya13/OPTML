import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

// Plain flex wrapper. Background + blur target live once at the app root
// (GlassProvider in GlassBackdrop.tsx), shared by every screen and the tab bar.
export default function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.root}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
