import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type LabelReading = {
  found: boolean;
  name: string | null;
  brand: string | null;
  serving_grams: number | null;
  per100: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
  };
  basis: "per100" | "perServing" | "unknown";
  notes: string | null;
};

/**
 * Photograph a nutrition panel and get the numbers back.
 *
 * `image` is raw base64 with no data: prefix — CameraView's takePictureAsync
 * returns exactly that when called with { base64: true }.
 */
export async function readLabel(image: string, mime = "image/jpeg"): Promise<LabelReading> {
  const { data, error } = await supabase.functions.invoke("read-label", {
    body: { image, mime },
  });

  if (error) {
    // Same unwrapping as parse.ts: supabase-js buries the function's own
    // message behind "non-2xx status code", which tells the user nothing.
    let message = error.message;
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      if (body?.error) message = String(body.error);
    }
    throw new Error(message);
  }

  if (!data || typeof data.found !== "boolean") {
    throw new Error("The label reader returned an unexpected response.");
  }

  return data as LabelReading;
}

/**
 * Convert a reading into per-100g values for the contribute form.
 *
 * The model is told never to rescale, because it cannot be trusted to notice
 * that the serving size it used was unreadable. So the rescale happens here,
 * where we can refuse to do it.
 *
 * Returns `scaled: false` when the numbers are per-serving and the serving
 * weight is unknown — the caller must then show the values as-is and say so,
 * rather than presenting a wrong per-100g figure as fact.
 */
export function toPer100(r: LabelReading): {
  values: { calories: string; protein: string; carbs: string; fat: string };
  scaled: boolean;
  warning: string | null;
} {
  const perServing = r.basis === "perServing";
  const grams = r.serving_grams;
  const canScale = perServing && grams !== null && grams > 0;

  const f = (v: number | null): string => {
    if (v === null) return "";
    const out = canScale ? (v * 100) / (grams as number) : v;
    // One decimal: labels rarely print more, and "7.2g" reads as measured
    // while "7.23456g" reads as computed.
    return String(Math.round(out * 10) / 10);
  };

  return {
    values: {
      calories: f(r.per100.calories),
      protein: f(r.per100.protein),
      carbs: f(r.per100.carbs),
      fat: f(r.per100.fat),
    },
    scaled: canScale,
    warning: perServing && !canScale
      ? "These are per serving — the pack didn't show a serving weight. Check them against the label before saving."
      : r.basis === "unknown"
        ? "Couldn't tell if the label is per 100g or per serving. Check these before saving."
        : null,
  };
}
