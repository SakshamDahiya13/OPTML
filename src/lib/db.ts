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

/** What the parse-meal function returns for a workout-shaped message. */
export type ParsedWorkout = {
  name: string;
  exercises: { name: string; sets: { reps: number | null; weight_kg: number | null }[] }[];
};

/** What it returns for a sleep-shaped message. Any field may be null. */
export type ParsedSleep = {
  hours: number | null;
  quality: number | null;
  bed_time: string | null;
  wake_time: string | null;
};

/**
 * The full shape of a parse-meal response. "kind" says which of items /
 * workout / sleep actually holds data — the other two are empty/null.
 */
export type ParseLogResult = {
  kind: "food" | "workout" | "sleep" | "none";
  label: string;
  items: ParsedItem[];
  workout: ParsedWorkout | null;
  sleep: ParsedSleep | null;
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

/* -------------------------------------------------------- writing workouts */

export type NewExerciseSet = {
  reps: number | null;
  weight_kg: number | null;
  done?: boolean;
};

export type NewExercise = {
  name: string;
  sets: NewExerciseSet[];
};

export type NewWorkout = {
  name: string;
  started_at?: Date;
  duration_min?: number | null;
  calories?: number | null;
  exercises: NewExercise[];
};

/**
 * Creates a workout and its sets.
 *
 * Postgres has no multi-table insert, so this is two round trips. If the
 * second fails the workout would be left with no sets — an empty shell in the
 * list — so we delete the parent rather than leave that behind. There is no
 * transaction available over PostgREST; this is the next best thing.
 */
export async function addWorkout(w: NewWorkout): Promise<Workout> {
  const { data: user } = await supabase.auth.getUser();
  const uid = user.user?.id;
  if (!uid) throw new Error("Not signed in.");

  const { data: workout, error } = await supabase
    .from("workouts")
    .insert({
      user_id: uid,
      name: w.name,
      started_at: (w.started_at ?? new Date()).toISOString(),
      duration_min: w.duration_min ?? null,
      calories: w.calories ?? null,
      source: "manual",
    })
    .select()
    .single();

  if (error) throw error;

  // set_no is per exercise, not per workout: "set 3" means the third set of
  // that movement, which is what a user counting reps actually means.
  const rows = w.exercises.flatMap((ex) =>
    ex.sets.map((s, i) => ({
      workout_id: workout.id,
      exercise: ex.name,
      set_no: i + 1,
      reps: s.reps,
      weight_kg: s.weight_kg,
      done: s.done ?? true,
    }))
  );

  if (rows.length) {
    const { error: setErr } = await supabase.from("exercise_sets").insert(rows);
    if (setErr) {
      await supabase.from("workouts").delete().eq("id", workout.id);
      throw setErr;
    }
  }

  return { ...(workout as Workout), exercise_sets: [] };
}

export async function deleteWorkout(id: string): Promise<void> {
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) throw error;
}

/** Distinct exercise names this user has logged, most recent first. */
export async function recentExercises(limit = 20): Promise<string[]> {
  const { data, error } = await supabase
    .from("exercise_sets")
    .select("exercise, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  const seen = new Set<string>();
  for (const r of data ?? []) {
    if (seen.size >= limit) break;
    seen.add((r as { exercise: string }).exercise);
  }
  return [...seen];
}

/* ------------------------------------------------------------------ sleep */

export type SleepLog = {
  id: string;
  user_id: string;
  night_of: string;
  bed_at: string;
  wake_at: string;
  minutes: number;
  quality: number | null;
  note: string | null;
};

/** YYYY-MM-DD in the device's own timezone, not UTC. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function getSleep(day: Date): Promise<SleepLog | null> {
  const { data, error } = await supabase
    .from("sleep_logs")
    .select("*")
    .eq("night_of", localDay(day))
    .maybeSingle();

  if (error) throw error;
  return (data as SleepLog) ?? null;
}

export async function listSleep(from: Date, to: Date): Promise<SleepLog[]> {
  const { data, error } = await supabase
    .from("sleep_logs")
    .select("*")
    .gte("night_of", localDay(from))
    .lte("night_of", localDay(to))
    .order("night_of", { ascending: false });

  if (error) throw error;
  return (data ?? []) as SleepLog[];
}

export type NewSleep = {
  night_of: Date;
  bed_at: Date;
  wake_at: Date;
  quality?: number | null;
  note?: string | null;
};

/**
 * Upsert on (user_id, night_of) — logging the same night twice corrects it
 * instead of double-counting. See the unique constraint in 005.
 */
export async function saveSleep(s: NewSleep): Promise<SleepLog> {
  const { data: user } = await supabase.auth.getUser();
  const uid = user.user?.id;
  if (!uid) throw new Error("Not signed in.");

  const minutes = Math.round((s.wake_at.getTime() - s.bed_at.getTime()) / 60000);
  if (minutes <= 0 || minutes >= 24 * 60) {
    throw new Error("Wake time must be after bedtime, and under 24 hours.");
  }

  const { data, error } = await supabase
    .from("sleep_logs")
    .upsert(
      {
        user_id: uid,
        night_of: localDay(s.night_of),
        bed_at: s.bed_at.toISOString(),
        wake_at: s.wake_at.toISOString(),
        minutes,
        quality: s.quality ?? null,
        note: s.note ?? null,
      },
      { onConflict: "user_id,night_of" }
    )
    .select()
    .single();

  if (error) throw error;
  return data as SleepLog;
}

export async function deleteSleep(id: string): Promise<void> {
  const { error } = await supabase.from("sleep_logs").delete().eq("id", id);
  if (error) throw error;
}

/* ----------------------------------------------------------- body metrics */

export type BodyMetric = {
  id: string;
  user_id: string;
  measured_on: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  waist_cm: number | null;
  note: string | null;
};

export async function getBody(day: Date): Promise<BodyMetric | null> {
  const { data, error } = await supabase
    .from("body_metrics")
    .select("*")
    .eq("measured_on", localDay(day))
    .maybeSingle();

  if (error) throw error;
  return (data as BodyMetric) ?? null;
}

export async function listBody(from: Date, to: Date): Promise<BodyMetric[]> {
  const { data, error } = await supabase
    .from("body_metrics")
    .select("*")
    .gte("measured_on", localDay(from))
    .lte("measured_on", localDay(to))
    .order("measured_on", { ascending: false });

  if (error) throw error;
  return (data ?? []) as BodyMetric[];
}

export async function saveBody(
  day: Date,
  patch: Partial<Pick<BodyMetric, "weight_kg" | "body_fat_pct" | "waist_cm" | "note">>
): Promise<BodyMetric> {
  const { data: user } = await supabase.auth.getUser();
  const uid = user.user?.id;
  if (!uid) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("body_metrics")
    .upsert(
      { user_id: uid, measured_on: localDay(day), ...patch },
      { onConflict: "user_id,measured_on" }
    )
    .select()
    .single();

  if (error) throw error;
  return data as BodyMetric;
}

/** "7h 20m" — the form every sleep tracker uses. */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
