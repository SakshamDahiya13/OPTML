import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
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
import AddMealSheet from "../components/AddMealSheet";
import ScanSheet from "../components/ScanSheet";
import { CardHead, TrackBar } from "../components/Charts";
import { useQuery } from "../hooks/useQuery";
import {
  Meal,
  Profile,
  dayRange,
  deleteMeal,
  getProfile,
  listMeals,
  sumMacros,
} from "../lib/db";

/** The date for a weekday index (0 = Sunday) within the current week. */
function dateForWeekday(index: number): Date {
  const today = new Date();
  const d = new Date(today);
  d.setDate(today.getDate() - today.getDay() + index);
  d.setHours(0, 0, 0, 0);
  return d;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function FoodLogScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { colors, glass } = theme;

  const navigation = useNavigation<{ navigate: (screen: string) => void }>();
  const [dayIndex, setDayIndex] = useState(new Date().getDay());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const profileQ = useQuery<Profile | null>(() => getProfile(), []);
  const mealsQ = useQuery<Meal[]>(() => {
    const { start, end } = dayRange(dateForWeekday(dayIndex));
    return listMeals(start, end);
  }, [dayIndex]);

  const meals = mealsQ.data ?? [];
  const eaten = sumMacros(meals);
  const goals = {
    calories: profileQ.data?.goal_calories ?? 2400,
    protein_g: profileQ.data?.goal_protein_g ?? 160,
    carbs_g: profileQ.data?.goal_carbs_g ?? 260,
    fat_g: profileQ.data?.goal_fat_g ?? 70,
  };
  const pct = goals.calories
    ? Math.round((eaten.calories / goals.calories) * 100)
    : 0;
  const remaining = Math.max(goals.calories - eaten.calories, 0);

  const refetch = useCallback(() => {
    mealsQ.refetch();
    profileQ.refetch();
  }, [mealsQ, profileQ]);

  function confirmDelete(meal: Meal) {
    Alert.alert(meal.label, "Remove this meal from your log?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMeal(meal.id);
            mealsQ.refetch();
          } catch (e) {
            Alert.alert("Couldn't delete", e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }

  const MACROS: [string, number, number][] = [
    ["Protein", eaten.protein_g, goals.protein_g],
    ["Carbs", eaten.carbs_g, goals.carbs_g],
    ["Fat", eaten.fat_g, goals.fat_g],
  ];

  const loading = mealsQ.loading && !mealsQ.data;
  const error = mealsQ.error ?? profileQ.error;

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
        <DaySelector value={dayIndex} onChange={setDayIndex} />

        {error ? (
          <>
            <View style={{ height: space.gap }} />
            <GlassCard style={styles.pad}>
              <Text style={[t.cardTitle, { color: colors.danger }]}>
                Couldn't load your log
              </Text>
              <Text style={[t.label, { color: colors.textDim, marginTop: 6 }]}>
                {error}
              </Text>
              <Pressable onPress={refetch} style={{ marginTop: 12 }}>
                <Text style={[t.label, { color: colors.text, fontWeight: "700" }]}>
                  Try again
                </Text>
              </Pressable>
            </GlassCard>
          </>
        ) : null}

        <View style={{ height: space.gap }} />
        <GlassCard strong style={[styles.hero, cardShadow(theme)]}>
          <CardHead title="Calories" />
          <View style={styles.ringWrap}>
            <ProgressRing
              size={196}
              strokeWidth={13}
              progress={goals.calories ? eaten.calories / goals.calories : 0}
              trackColor={glass.track}
              fillColor={colors.accent}
            >
              {loading ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Metric
                  parts={[{ v: String(Math.round(eaten.calories)) }]}
                  caption={`of ${goals.calories} kcal`}
                />
              )}
            </ProgressRing>
          </View>
          <Text style={[t.label, { color: colors.textDim, textAlign: "center" }]}>
            {loading ? "Loading…" : `${pct}% of today's goal`}
          </Text>
        </GlassCard>

        <View style={{ height: space.gap }} />
        <View style={styles.macroRow}>
          {MACROS.map(([name, got, goal]) => (
            <GlassCard key={name} style={styles.macro}>
              <View style={styles.macroInner}>
                <Text style={[t.label, { color: colors.textDim }]}>{name}</Text>
                <Metric
                  parts={[{ v: String(Math.round(got)), u: `/${goal}g` }]}
                  scale={0.52}
                  align="flex-start"
                />
                <View style={{ height: 10 }} />
                <TrackBar progress={goal ? got / goal : 0} />
              </View>
            </GlassCard>
          ))}
        </View>

        {meals.length ? (
          <>
            <View style={{ height: space.gap }} />
            <InsightCard
              title={
                remaining > 0
                  ? `${Math.round(remaining)} kcal left today`
                  : `${Math.round(eaten.calories - goals.calories)} kcal over your goal`
              }
              body={
                remaining > 0
                  ? `You've logged ${meals.length} ${
                      meals.length === 1 ? "meal" : "meals"
                    } and ${Math.round(eaten.protein_g)}g of protein so far.`
                  : "Worth easing off at dinner, or adding a session to balance it out."
              }
            />
          </>
        ) : null}

        <View style={{ height: space.section }} />
        <View style={styles.sectionRow}>
          <Text style={[t.cardTitle, { color: colors.text }]}>
            {dayIndex === new Date().getDay() ? "Today's meals" : "Meals"}
          </Text>
          <View style={styles.sectionBtns}>
            <Pressable onPress={() => setScanOpen(true)}>
              <GlassCard strong radius={radius.pill} style={styles.scanBtn}>
                <View style={styles.scanInner}>
                  <Ionicons name="barcode-outline" size={17} color={colors.text} />
                </View>
              </GlassCard>
            </Pressable>
            <Pressable onPress={() => setSheetOpen(true)}>
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
        </View>

        {loading ? (
          <GlassCard style={styles.empty}>
            <ActivityIndicator color={colors.textDim} />
          </GlassCard>
        ) : meals.length === 0 ? (
          <GlassCard style={styles.empty}>
            <Ionicons name="restaurant-outline" size={26} color={colors.textFaint} />
            <Text style={[t.cardTitle, { color: colors.text, marginTop: 12 }]}>
              Nothing logged yet
            </Text>
            <Text
              style={[
                t.label,
                { color: colors.textDim, marginTop: 6, textAlign: "center" },
              ]}
            >
              Add a meal to start tracking this day.
            </Text>
          </GlassCard>
        ) : (
          meals.map((meal) => (
            <Pressable key={meal.id} onLongPress={() => confirmDelete(meal)}>
              <GlassCard style={styles.meal}>
                <View style={styles.mealInner}>
                  <View style={[styles.mealIcon, { backgroundColor: glass.track }]}>
                    <Ionicons name="restaurant-outline" size={16} color={colors.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[t.cardTitle, { color: colors.text }]}>
                      {meal.label}
                    </Text>
                    <Text
                      style={[t.label, { color: colors.textDim, marginTop: 3 }]}
                      numberOfLines={2}
                    >
                      {(meal.meal_items ?? []).map((i) => i.name).join(", ") ||
                        meal.raw_text ||
                        "—"}
                    </Text>
                  </View>
                  <View style={styles.mealRight}>
                    <Text style={[t.tiny, { color: colors.textFaint }]}>
                      {timeOf(meal.eaten_at)}
                    </Text>
                    <Text style={[t.cardTitle, { color: colors.text, marginTop: 4 }]}>
                      {Math.round(meal.calories)}
                    </Text>
                  </View>
                </View>
              </GlassCard>
            </Pressable>
          ))
        )}

        {meals.length ? (
          <Text
            style={[
              t.label,
              { color: colors.textFaint, textAlign: "center", marginTop: 14 },
            ]}
          >
            Long-press a meal to delete it.
          </Text>
        ) : null}
      </GlassScroll>

      <AddMealSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={refetch}
      />

      <ScanSheet
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onSaved={refetch}
        // A barcode we don't recognise hands off to the parser rather than
        // dead-ending the user on "not found".
        onFallbackToChat={() => navigation.navigate("Chat")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, paddingHorizontal: space.gutter },
  pad: { padding: 16 },
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
  sectionBtns: { flexDirection: "row", alignItems: "center", gap: 8 },
  scanBtn: { height: 36, width: 40 },
  scanInner: { height: 36, width: 40, alignItems: "center", justifyContent: "center" },
  addBtn: { height: 36 },
  addInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    height: 36,
  },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 34, paddingHorizontal: 24 },
  meal: { marginBottom: 10 },
  mealInner: { flexDirection: "row", alignItems: "center", gap: 13, padding: 15 },
  mealIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  mealRight: { alignItems: "flex-end" },
});
