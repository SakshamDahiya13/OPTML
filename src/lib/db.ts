import { supabase } from "./supabase";

/* ------------------------------------------------------------------ types */

export type Macros = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type Profile = {
  id: string;
  display_name: string | null;
  sex: "male" | "female" | "other" | null;
  birth_year: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal_calories: number;
  goal_protein_g: number;
  goal_carbs_g: number;
  goal_fat_g: number;
  bodybuilder_mode: boolean;
};

export type MealItem = Macros & {
  id: string;
  meal_id: string;
  name: string;
  qty: number | null;
  unit: string | null;
};

export type Meal = Macros & {
  id: string;
  user_id: string;
  eaten_at: string;
  label: string;
  raw_text: string | null;
  source: "manual" | "chat";
  meal_items?: MealItem[];
};

export type ExerciseSet = {
  id: string;
  workout_id: string;
  exercise: string;
  set_no: number;
  reps: number | null;
  weight_kg: number | null;
  done: boolean;
};

export type Workout = {
  id: string;
  user_id: string;
  started_at: string;
  name: string;
  raw_text: string | null;
  source: "manual" | "chat";
  duration_min: number | null;
  calories: number | null;
  exercise_sets?: ExerciseSet[];
};

export const ZERO: Macros = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

/* ------------------------------------------------------------------ dates */

/**
 * Local-time day boundaries.
 *
 * Day boundaries are deliberately computed on the device rather than in SQL:
 * "what did I eat today" means today where the user is standing, and the
 * server has no idea what timezone that is.
 */
export function dayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function daysBack(n: number, from = new Date()): Date[] {
  const out: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    out.push(d);
  }
  return out;
}

export function sumMacros(rows: Macros[]): Macros {
  return rows.reduce<Macros>(
    (a, r) => ({
      calories: a.calories + Number(r.calories ?? 0),
      protein_g: a.protein_g + Number(r.protein_g ?? 0),
      carbs_g: a.carbs_g + Number(r.carbs_g ?? 0),
      fat_g: a.fat_g + Number(r.fat_g ?? 0),
    }),
    { ...ZERO }
  );
}

/* --------------------------------------------------------------- profiles */

export async function getProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) throw error;
  // A row should always exist (the signup trigger makes one), but a user who
  // registered before the schema was applied won't have one until the backfill
  // runs — create it rather than crashing the screen.
  if (!data) {
    const { data: made, error: e2 } = await supabase
      .from("profiles")
      .insert({ id: auth.user.id })
      .select()
      .single();
    if (e2) throw e2;
    return made as Profile;
  }
  return data as Profile;
}

export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", auth.user.id)
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
}

/* ------------------------------------------------------------------ meals */

export async function listMeals(start: Date, end: Date): Promise<Meal[]> {
  const { data, error } = await supabase
    .from("meals")
    .select("*, meal_items(*)")
    .gte("eaten_at", start.toISOString())
    .lt("eaten_at", end.toISOString())
    .order("eaten_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Meal[];
}

export type NewMealItem = {
  name: string;
  qty?: number | null;
  unit?: string | null;
} & Partial<Macros>;

export type NewMeal = {
  label: string;
  eatenAt?: Date;
  rawText?: string | null;
  source?: "manual" | "chat";
  items: NewMealItem[];
};

/**
 * Insert a meal and its items. Totals are derived from the items so the stored
 * totals can never drift from what they're made of.
 *
 * supabase-js can't wrap two inserts in one transaction, so if the items fail
 * the meal row is removed rather than left behind as an empty meal.
 */
export async function addMeal(meal: NewMeal): Promise<Meal> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in.");

  const items = meal.items.map((i) => ({
    name: i.name,
    qty: i.qty ?? null,
    unit: i.unit ?? null,
    calories: Number(i.calories ?? 0),
    protein_g: Number(i.protein_g ?? 0),
    carbs_g: Number(i.carbs_g ?? 0),
    fat_g: Number(i.fat_g ?? 0),
  }));
  const totals = sumMacros(items);

  const { data: created, error } = await supabase
    .from("meals")
    .insert({
      user_id: auth.user.id,
      label: meal.label,
      eaten_at: (meal.eatenAt ?? new Date()).toISOString(),
      raw_text: meal.rawText ?? null,
      source: meal.source ?? "manual",
      ...totals,
    })
    .select()
    .single();

  if (error) throw error;

  if (items.length) {
    const { error: itemsError } = await supabase
      .from("meal_items")
      .insert(items.map((i) => ({ ...i, meal_id: created.id })));

    if (itemsError) {
      await supabase.from("meals").delete().eq("id", created.id);
      throw itemsError;
    }
  }

  return created as Meal;
}

export async function deleteMeal(id: string): Promise<void> {
  // meal_items go with it via on delete cascade.
  const { error } = await supabase.from("meals").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------ AI-parsed meals */

export type Confidence = "high" | "medium" | "low";

export type Assumptions = {
  matched?: string;
  portion?: string;
  note?: string;
} | null;

/** What the parse-meal edge function returns per food. */
export type ParsedItem = {
  name: string;
  qty: number | null;
  unit: string | null;
  calories: number;
  calories_min: number;
  calories_max: number;
  protein_g: number;
  protein_min: number;
  protein_max: number;
  carbs_g: number;
  carbs_min: number;
  carbs_max: number;
  fat_g: number;
  fat_min: number;
  fat_max: number;
  confidence: Confidence;
  assumptions: Assumptions;
};

export type ParseResult = {
  label: string;
  items: ParsedItem[];
  raw_text: string;
  priors_used: number;
};

const RANGE_FIELDS = [
  ["calories", "calories_min", "calories_max"],
  ["protein_g", "protein_min", "protein_max"],
  ["carbs_g", "carbs_min", "carbs_max"],
  ["fat_g", "fat_min", "fat_max"],
] as const;

/**
 * Save a meal the AI parsed, keeping its ranges.
 *
 * Meal-level bounds are the sums of the item bounds. That is deliberately
 * conservative: it assumes every item could be wrong in the same direction at
 * once, which is wider than treating the errors as independent. Overstating
 * uncertainty is the right way to be wrong for this product.
 */
export async function addParsedMeal(
  label: string,
  items: ParsedItem[],
  rawText: string,
  eatenAt?: Date
): Promise<Meal> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in.");

  const total: Record<string, number> = {};
  for (const [point, min, max] of RANGE_FIELDS) {
    total[point] = items.reduce((s, i) => s + Number(i[point] ?? 0), 0);
    total[min] = items.reduce((s, i) => s + Number(i[min] ?? i[point] ?? 0), 0);
    total[max] = items.reduce((s, i) => s + Number(i[max] ?? i[point] ?? 0), 0);
  }

  // The meal is only as certain as its least certain item.
  const rank: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };
  const confidence: Confidence = items.length
    ? items.reduce<Confidence>(
        (worst, i) => (rank[i.confidence] < rank[worst] ? i.confidence : worst),
        "high"
      )
    : "medium";

  const { data: created, error } = await supabase
    .from("meals")
    .insert({
      user_id: auth.user.id,
      label,
      eaten_at: (eatenAt ?? new Date()).toISOString(),
      raw_text: rawText,
      source: "chat",
      confidence,
      ...total,
    })
    .select()
    .single();

  if (error) throw error;

  if (items.length) {
    const { error: itemsError } = await supabase.from("meal_items").insert(
      items.map((i) => ({
        meal_id: created.id,
        name: i.name,
        qty: i.qty,
        unit: i.unit,
        calories: i.calories,
        calories_min: i.calories_min,
        calories_max: i.calories_max,
        protein_g: i.protein_g,
        protein_min: i.protein_min,
        protein_max: i.protein_max,
        carbs_g: i.carbs_g,
        carbs_min: i.carbs_min,
        carbs_max: i.carbs_max,
        fat_g: i.fat_g,
        fat_min: i.fat_min,
        fat_max: i.fat_max,
        confidence: i.confidence,
        assumptions: i.assumptions,
      }))
    );
    if (itemsError) {
      await supabase.from("meals").delete().eq("id", created.id);
      throw itemsError;
    }
  }

  return created as Meal;
}

/**
 * Tell the database a human disagreed with an estimate.
 *
 * This is the single most valuable write in the app: it teaches this user's
 * portions AND it is the evidence base for publishing our real accuracy. Best
 * effort by design — a failure here must never cost the user their meal.
 */
export async function recordCorrection(
  foodKey: string,
  field: "qty" | "calories" | "protein_g" | "carbs_g" | "fat_g",
  aiValue: number,
  userValue: number,
  mealItemId?: string
): Promise<void> {
  const { error } = await supabase.rpc("record_correction", {
    p_meal_item_id: mealItemId ?? null,
    p_food_key: foodKey,
    p_field: field,
    p_ai_value: aiValue,
    p_user_value: userValue,
  });
  if (error) console.warn("correction not recorded:", error.message);
}

export type AccuracyRow = {
  field: string;
  samples: number;
  mean_ai: number;
  mean_actual: number;
  mean_bias: number;
};

/** Our own measured bias, from this user's corrections. */
export async function accuracySummary(): Promise<AccuracyRow[]> {
  const { data, error } = await supabase.rpc("accuracy_summary");
  if (error) throw error;
  return (data ?? []) as AccuracyRow[];
}

/* --------------------------------------------------------------- workouts */

export async function listWorkouts(start: Date, end: Date): Promise<Workout[]> {
  const { data, error } = await supabase
    .from("workouts")
    .select("*, exercise_sets(*)")
    .gte("started_at", start.toISOString())
    .lt("started_at", end.toISOString())
    .order("started_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Workout[];
}

/** Total kg lifted — reps x weight across every completed set. */
export function workoutVolume(w: Workout): number {
  return (w.exercise_sets ?? []).reduce(
    (sum, s) => (s.done ? sum + (s.reps ?? 0) * Number(s.weight_kg ?? 0) : sum),
    0
  );
}
