// OPTML — parse-meal edge function
//
// Takes a sentence ("2 eggs and toast") and returns structured food items with
// honest ranges. It does NOT write to the database: the app shows a confirm
// card first, and saves only what the user accepts.
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

const SYSTEM_PROMPT = `You convert a description of a meal into structured nutrition data.

Return ONLY a JSON object, no prose, in exactly this shape:
{
  "label": "Breakfast" | "Lunch" | "Dinner" | "Snack",
  "items": [
    {
      "name": "short food name",
      "qty": number or null,
      "unit": "g" | "ml" | "piece" | "slice" | "cup" | "tbsp" | "oz" | null,
      "calories": number, "calories_min": number, "calories_max": number,
      "protein_g": number, "protein_min": number, "protein_max": number,
      "carbs_g": number, "carbs_min": number, "carbs_max": number,
      "fat_g": number, "fat_min": number, "fat_max": number,
      "confidence": "high" | "medium" | "low",
      "assumptions": { "matched": "what food you matched", "portion": "what portion you assumed", "note": "anything you had to guess, or null" }
    }
  ]
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
7. If the text describes no food at all, return {"label":"Snack","items":[]}.

Honesty about uncertainty is this product's entire purpose. A confidently wrong
number is far worse than a wide range.`;

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

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items = rawItems
      .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
      .slice(0, 20)
      .map(sanitise);

    const label = ["Breakfast", "Lunch", "Dinner", "Snack"].includes(
        String(parsed.label),
      )
      ? String(parsed.label)
      : "Snack";

    return json({
      label,
      items,
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
