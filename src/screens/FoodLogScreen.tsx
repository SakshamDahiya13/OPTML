import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../context/ThemeContext";
import { TAB_BAR_SPACE, cardShadow, radius, space, type as t } from "../theme";
import GlassCard from "../components/GlassCard";
import GlassScroll from "../components/GlassScroll";
import Screen from "../components/Screen";
import Header from "../components/Header";
import DaySelector from "../components/DaySelector";
import Metric from "../components/Metric";
import InsightCard from "../components/InsightCard";
import ProgressRing from "../components/ProgressRing";
import { CardHead, TrackBar } from "../components/Charts";

const GOAL = { calories: 2400, protein: 160, carbs: 260, fat: 70 };
const EATEN = { calories: 1820, protein: 118, carbs: 190, fat: 54 };

const MEALS = [
  { name: "Breakfast", desc: "2 eggs, 1 slice toast, black coffee", time: "8:10 AM", kcal: 380 },
  { name: "Lunch", desc: "Salmon, small rice, barbecue sauce", time: "1:30 PM", kcal: 610 },
  { name: "Snack", desc: "Greek yogurt, handful of almonds", time: "4:45 PM", kcal: 260 },
  { name: "Dinner", desc: "Chicken breast, quinoa, broccoli", time: "8:05 PM", kcal: 570 },
];

const MACROS = [
  { key: "Protein", eaten: EATEN.protein, goal: GOAL.protein },
  { key: "Carbs", eaten: EATEN.carbs, goal: GOAL.carbs },
  { key: "Fat", eaten: EATEN.fat, goal: GOAL.fat },
];

export default function FoodLogScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { colors, glass } = theme;
  const pct = Math.round((EATEN.calories / GOAL.calories) * 100);

  return (
    <Screen>
      <GlassScroll
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingBottom: insets.bottom + TAB_BAR_SPACE,
        }}
      >
        <Header title="Today" subtitle="Here's your day so far" />

        <View style={{ height: 18 }} />
        <DaySelector />

        <View style={{ height: space.gap }} />
        <GlassCard strong style={[styles.hero, cardShadow(theme)]}>
          <CardHead title="Calories" />
          <View style={styles.ringWrap}>
            <ProgressRing
              size={196}
              strokeWidth={13}
              progress={EATEN.calories / GOAL.calories}
              trackColor={glass.track}
              fillColor={colors.accent}
            >
              <Metric
                parts={[{ v: String(EATEN.calories) }]}
                caption={`of ${GOAL.calories} kcal`}
              />
            </ProgressRing>
          </View>
          <Text style={[t.label, { color: colors.textDim, textAlign: "center" }]}>
            {pct}% of today's goal
          </Text>
        </GlassCard>

        <View style={{ height: space.gap }} />
        <View style={styles.macroRow}>
          {MACROS.map((m) => (
            <GlassCard key={m.key} style={styles.macro}>
              <View style={styles.macroInner}>
                <Text style={[t.label, { color: colors.textDim }]}>{m.key}</Text>
                <Metric
                  parts={[{ v: String(m.eaten), u: `/${m.goal}g` }]}
                  scale={0.52}
                  align="flex-start"
                />
                <View style={{ height: 10 }} />
                <TrackBar progress={m.eaten / m.goal} />
              </View>
            </GlassCard>
          ))}
        </View>

        <View style={{ height: space.gap }} />
        <InsightCard
          title="You're 580 kcal short of your goal"
          body="Protein is tracking well. A lean dinner around 550 kcal would land you on target without going over."
        />

        <View style={{ height: space.section }} />
        <View style={styles.sectionRow}>
          <Text style={[t.cardTitle, { color: colors.text }]}>Today's meals</Text>
          <Pressable>
            <GlassCard strong radius={radius.pill} style={styles.addBtn}>
              <View style={styles.addInner}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={[t.label, { color: colors.text, fontWeight: "600" }]}>
                  Add meal
                </Text>
              </View>
            </GlassCard>
          </Pressable>
        </View>

        {MEALS.map((meal) => (
          <GlassCard key={meal.name} style={styles.meal}>
            <View style={styles.mealInner}>
              <View style={[styles.mealIcon, { backgroundColor: glass.track }]}>
                <Ionicons name="restaurant-outline" size={16} color={colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[t.cardTitle, { color: colors.text }]}>{meal.name}</Text>
                <Text
                  style={[t.label, { color: colors.textDim, marginTop: 3 }]}
                  numberOfLines={2}
                >
                  {meal.desc}
                </Text>
              </View>
              <View style={styles.mealRight}>
                <Text style={[t.tiny, { color: colors.textFaint }]}>{meal.time}</Text>
                <Text style={[t.cardTitle, { color: colors.text, marginTop: 4 }]}>
                  {meal.kcal}
                </Text>
              </View>
            </View>
          </GlassCard>
        ))}
      </GlassScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, paddingHorizontal: space.gutter },
  hero: { padding: 18 },
  ringWrap: { alignItems: "center", marginTop: 14, marginBottom: 14 },
  macroRow: { flexDirection: "row", gap: 10 },
  macro: { flex: 1 },
  macroInner: { padding: 14 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  addBtn: { height: 36 },
  addInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    height: 36,
  },
  meal: { marginBottom: 10 },
  mealInner: { flexDirection: "row", alignItems: "center", gap: 13, padding: 15 },
  mealIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  mealRight: { alignItems: "flex-end" },
});
