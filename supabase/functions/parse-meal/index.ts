// OPTML — parse-meal edge function
//
// Takes one sentence typed in chat and classifies it as a meal, a workout, a
// night of sleep, or none of those — then returns structured data for
// whichever it is. It does NOT write to the database: the app shows a
// confirm card first, and saves only what the user accepts.
//
// One classifier rather than three separate ones because the alternative is
// asking the user to pick a category before they've typed anything, which is
// exactly the friction a chat box exists to remove.
//
// Why this runs server-side: the model API key must never reach the device.
// Anything named EXPO_PUBLIC_* is inlined into the JS bundle and can be read
// out of the APK. This function holds the key in Supabase secrets instead, and
// the app authenticates with the user's own JWT.
//
// Deploy:
//   Dashboard -> Edge Functions -> Deploy a new function -> paste this file
//   Secrets needed: GEMINI_API_KEY  (required)
//                   GEMINI_MODEL    (optional, defaults below)
//                   AI_BASE_URL     (optional, for switching provider)
//
// Google serves Gemini over an OpenAI-compatible chat-completions API, which
// is what this calls. Moving to OpenAI, xAI or another compatible host is a
// secrets change (AI_BASE_URL + GEMINI_MODEL), not a code change.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Model names change often. Override with the GEMINI_MODEL secret rather than
// editing this file; if the provider rejects it, the error below says so.
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

// A meal description is a sentence, not an essay. Capping input keeps a
// pasted wall of text from turning into a surprise token bill.
const MAX_INPUT_CHARS = 500;

type Item = {
  name: string;
  qty: number | null;
  unit: string | null;
  calories: number; calories_min: number; calories_max: number;
  protein_g: number; protein_min: number; protein_max: number;
  carbs_g: number; carbs_min: number; carbs_max: number;
  fat_g: number; fat_min: number; fat_max: number;
  confidence: "high" | "medium" | "low";
  assumptions: { matched?: string; portion?: string; note?: string } | null;
};

const SYSTEM_PROMPT = `You read one message a user typed to log something about their day —
food, a workout, or sleep — and turn it into structured data.

Return ONLY a JSON object, no prose, no markdown fence, in exactly this shape:
{
  "kind": "food" | "workout" | "sleep" | "none",
  "label": "Breakfast" | "Lunch" | "Dinner" | "Snack",
  "items": [ ...food items, see below... ],
  "workout": { "name": string, "exercises": [ { "name": string, "sets": [ { "reps": number|null, "weight_kg": number|null } ] } ] } | null,
  "sleep": { "hours": number|null, "quality": 1|2|3|4|5|null, "bed_time": "HH:MM"|null, "wake_time": "HH:MM"|null } | null
}

FIRST decide "kind":
- "food": the message describes something eaten or drunk.
- "workout": the message describes exercise — sets, reps, a run, pushups,
  "leg day", a duration of activity.
- "sleep": the message states how long or how well they slept, or bed/wake
  times ("slept 7 hours", "woke up at 7", "bad sleep last night").
- "none": anything else — a greeting, a question, small talk. Return every
  other field null/empty when kind is "none".

Fill ONLY the block matching "kind". The other two stay null (or items: []
for a non-food kind). Never guess content for a block that doesn't match.

--- FOOD (kind: "food") ---
"items" is an array of:
  {
    "name": "short food name",
    "qty": number or null,
    "unit": "g" | "ml" | "piece" | "slice" | "cup" | "tbsp" | "oz" | null,
    "calories": number, "calories_min": number, "calories_max": number,
    "protein_g": number, "protein_min": number, "protein_max": number,
    "carbs_g": number, "carbs_min": number, "carbs_max": number,
    "fat_g": number, "fat_min": number, "fat_max": number,
    "confidence": "high" | "medium" | "low",
    "assumptions": { "matched": string, "portion": string, "note": string|null }
  }

Rules on the numbers, which matter more than anything else here:
1. The point estimate is your best single guess. The min and max are a genuine
   80% interval: you should expect the true value to fall inside them about
   four times in five.
2. RANGES MUST BE ALLOWED TO BE ASYMMETRIC. Studies of AI dietary estimation
   find systematic OVERESTIMATION of energy, carbohydrate and fat. When you are
   unsure about portion size or preparation, the interval should extend further
   BELOW your point estimate than above it. Do not default to a symmetric band.
3. Portion ambiguity is almost always the dominant uncertainty, not the food's
   composition. "a bowl of rice" could be 100g or 300g; that is a wide range,
   and you should say so rather than picking a tidy middle number and hiding it.
4. confidence: "high" for a weighed or clearly countable amount (2 eggs, 100g
   chicken, a labelled packaged item); "medium" for a common dish in a stated
   portion; "low" for a vague or homemade quantity where preparation varies a
   lot ("my mum's dal", "some pasta").
5. "assumptions" is shown to the user so they can see your working. Be concrete:
   "assumed 1 large egg = 50g", "assumed restaurant portion, cooked in oil".
   Put anything you genuinely guessed in "note".
6. Never invent micronutrients. Only the four macros above.
7. A single implausible quantity ("1kg bread", "5 litres of milk") is still
   logged honestly at face value — do not silently cap it. If it looks like a
   typo for a smaller amount, say so in "note" but still compute the stated
   quantity, so the confirm screen shows the real number rather than a quietly
   substituted one.

--- WORKOUT (kind: "workout") ---
"workout.exercises" holds one entry per distinct movement named. "sets" holds
one entry per set mentioned. If only a rep count is given with no set count
("40 pushups"), that is one set of that many reps, weight_kg null. If reps
AND weight are both absent for a cardio-style activity ("ran for 30 minutes"),
still create one exercise named for the activity with one set, reps null,
weight_kg null — "workout.name" or the surrounding context can carry the
duration in words; there is no duration field on a set.
"workout.name" is a short label for the session, e.g. "Push day", "Run",
"Pushups" — invent one if the user didn't name it.

--- SLEEP (kind: "sleep") ---
Fill whichever of hours / quality / bed_time / wake_time the message actually
states. Leave the rest null — do not compute hours from times or invent a
quality rating nobody mentioned. "quality" is 1 (awful) to 5 (great), only
set if the user described how it felt, not just how long.

Honesty about uncertainty is this product's entire purpose. A confidently
wrong number is far worse than a wide range or a null.`;

function clampNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Trust the model for shape, never for invariants. A min above a max, or a
 * point estimate outside its own range, would quietly corrupt every total
 * downstream — so the ranges are repaired here rather than on the device.
 */
function sanitise(raw: Record<string, unknown>): Item {
  const point = (k: string) => clampNumber(raw[k]);
  const fix = (base: string) => {
    const p = point(base);
    let lo = clampNumber(raw[`${base.replace("_g", "")}_min`], p);
    let hi = clampNumber(raw[`${base.replace("_g", "")}_max`], p);
    if (lo > hi) [lo, hi] = [hi, lo];
    return { p, lo: Math.min(lo, p), hi: Math.max(hi, p) };
  };

  const cal = fix("calories");
  const pro = fix("protein_g");
  const car = fix("carbs_g");
  const fat = fix("fat_g");
  const conf = raw.confidence;

  return {
    name: String(raw.name ?? "Food").slice(0, 120),
    qty: raw.qty == null ? null : clampNumber(raw.qty, 1),
    unit: raw.unit == null ? null : String(raw.unit).slice(0, 16),
    calories: cal.p, calories_min: cal.lo, calories_max: cal.hi,
    protein_g: pro.p, protein_min: pro.lo, protein_max: pro.hi,
    carbs_g: car.p, carbs_min: car.lo, carbs_max: car.hi,
    fat_g: fat.p, fat_min: fat.lo, fat_max: fat.hi,
    confidence: conf === "high" || conf === "low" ? conf : "medium",
    assumptions:
      raw.assumptions && typeof raw.assumptions === "object"
        ? (raw.assumptions as Item["assumptions"])
        : null,
  };
}

type ParsedSet = { reps: number | null; weight_kg: number | null };
type ParsedExercise = { name: string; sets: ParsedSet[] };
type ParsedWorkout = { name: string; exercises: ParsedExercise[] };

function sanitiseWorkout(raw: unknown): ParsedWorkout | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rawExercises = Array.isArray(r.exercises) ? r.exercises : [];

  const exercises: ParsedExercise[] = rawExercises
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .slice(0, 12)
    .map((e) => {
      const rawSets = Array.isArray(e.sets) ? e.sets : [];
      const sets: ParsedSet[] = rawSets
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .slice(0, 20)
        .map((x) => ({
          reps: x.reps == null ? null : Math.max(0, Math.round(clampNumber(x.reps))),
          weight_kg: x.weight_kg == null ? null : clampNumber(x.weight_kg),
        }));
      return {
        name: String(e.name ?? "Exercise").slice(0, 80),
        // An exercise the model named but gave no sets for is a dead end in
        // the UI — one with reps/weight both null at least shows up logged.
        sets: sets.length ? sets : [{ reps: null, weight_kg: null }],
      };
    })
    .filter((e) => e.name);

  if (!exercises.length) return null;
  return { name: String(r.name ?? "Workout").slice(0, 80), exercises };
}

type ParsedSleep = {
  hours: number | null;
  quality: number | null;
  bed_time: string | null;
  wake_time: string | null;
};

function sanitiseSleep(raw: unknown): ParsedSleep | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const time = (v: unknown): string | null => {
    const m = typeof v === "string" ? v.match(/^(\d{1,2}):(\d{2})$/) : null;
    if (!m) return null;
    const h = +m[1], min = +m[2];
    return h <= 23 && min <= 59 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
  };

  const hours = r.hours == null ? null : clampNumber(r.hours);
  const quality =
    typeof r.quality === "number" && r.quality >= 1 && r.quality <= 5
      ? Math.round(r.quality)
      : null;
  const bed_time = time(r.bed_time);
  const wake_time = time(r.wake_time);

  // Nothing at all to log means the model misclassified "sleep" — don't hand
  // the app an empty confirm card.
  if (hours === null && bed_time === null && wake_time === null) return null;

  return {
    hours: hours !== null && hours > 0 && hours < 24 ? hours : null,
    quality,
    bed_time,
    wake_time,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json({ error: "GEMINI_API_KEY is not set on this function." }, 500);
    }

    // Authenticate as the caller. Without this the function is an open proxy
    // to a paid API that anyone could point a script at.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth?.user) return json({ error: "Not signed in." }, 401);

    const body = await req.json().catch(() => ({}));
    const text = String(body?.text ?? "").trim();
    if (!text) return json({ error: "Nothing to parse." }, 400);
    if (text.length > MAX_INPUT_CHARS) {
      return json({ error: "That's too long to log as one meal." }, 400);
    }

    // This user's learned portions. The whole point of recording corrections
    // is that the next parse is better, so they go into the prompt.
    const { data: priors } = await supabase
      .from("portion_priors")
      .select("food_key, qty, unit, grams, calories, protein_g, carbs_g, fat_g, sample_count")
      .order("sample_count", { ascending: false })
      .limit(40);

    const priorsBlock = priors?.length
      ? `\n\nThis user has corrected these foods before. Where the meal mentions one of them, prefer THEIR values over a generic estimate, and raise confidence accordingly:\n${
        priors.map((p) =>
          `- ${p.food_key}: ${[
            p.calories != null ? `${Math.round(p.calories)} kcal` : null,
            p.protein_g != null ? `${Math.round(p.protein_g)}g protein` : null,
            p.grams != null ? `${Math.round(p.grams)}g` : null,
          ].filter(Boolean).join(", ")} (from ${p.sample_count} correction${p.sample_count === 1 ? "" : "s"})`
        ).join("\n")
      }`
      : "";

    const model = Deno.env.get("GEMINI_MODEL") ?? DEFAULT_MODEL;
    const baseUrl = Deno.env.get("AI_BASE_URL") ?? DEFAULT_BASE_URL;

    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT + priorsBlock },
          { role: "user", content: text },
        ],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      // The commonest misconfiguration by far is a model name that doesn't
      // exist on the account, so name the fix rather than echoing a 404.
      const looksLikeModel = /model/i.test(detail) && upstream.status < 500;
      return json(
        {
          error: looksLikeModel
            ? `The provider rejected model "${model}". Set the GEMINI_MODEL secret to a model your account can use.`
            : "The parsing service is unavailable right now.",
          status: upstream.status,
          detail: detail.slice(0, 400),
        },
        502,
      );
    }

    const completion = await upstream.json();
    const content = completion?.choices?.[0]?.message?.content;
    if (!content) return json({ error: "Empty response from the model." }, 502);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      return json({ error: "The model returned something that wasn't JSON." }, 502);
    }

    const kind = ["food", "workout", "sleep", "none"].includes(String(parsed.kind))
      ? (parsed.kind as "food" | "workout" | "sleep" | "none")
      : "none";

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items = kind === "food"
      ? rawItems
          .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
          .slice(0, 20)
          .map(sanitise)
      : [];

    const label = ["Breakfast", "Lunch", "Dinner", "Snack"].includes(
        String(parsed.label),
      )
      ? String(parsed.label)
      : "Snack";

    // A kind with nothing usable in its own block is really "none" — this
    // stops an empty workout/sleep confirm card reaching the chat.
    const workout = kind === "workout" ? sanitiseWorkout(parsed.workout) : null;
    const sleep = kind === "sleep" ? sanitiseSleep(parsed.sleep) : null;
    const effectiveKind =
      kind === "food" && items.length === 0 ? "none"
      : kind === "workout" && !workout ? "none"
      : kind === "sleep" && !sleep ? "none"
      : kind;

    return json({
      kind: effectiveKind,
      label,
      items,
      workout,
      sleep,
      raw_text: text,
      // Surfaced in the UI so the user knows their own corrections were used.
      priors_used: priors?.length ?? 0,
      usage: completion?.usage ?? null,
    });
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      500,
    );
  }
});
