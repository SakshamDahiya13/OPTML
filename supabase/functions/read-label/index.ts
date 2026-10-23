// OPTML — read-label
//
// Takes a photo of a nutrition panel and returns the numbers as structured
// data, so a product missing from every database can be added in one shot
// instead of a dozen typed fields.
//
// This is the answer to the bootstrapping problem: the USDA import covers
// US/CA/NZ packaged goods, and this covers everything else — Indian packets
// above all, which no affordable API carries.
//
// Secrets (Edge Function secrets, not .env):
//   GEMINI_API_KEY   required — the same key parse-meal uses
//   VISION_MODEL     optional, defaults below
//
// Deliberately NOT sharing parse-meal's GEMINI_MODEL secret: that one only
// has to read text, this one has to read a photograph. If a cheaper text
// model is chosen there it would silently break label scanning here.

const MODEL = Deno.env.get("VISION_MODEL") ?? "gemini-3.5-flash-lite";
const KEY = Deno.env.get("GEMINI_API_KEY");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = `You are reading a nutrition facts panel from a food package photo.

Return ONLY a JSON object, no markdown fence, no commentary:
{
  "found": true | false,
  "name": string | null,
  "brand": string | null,
  "serving_grams": number | null,
  "per100": {
    "calories": number | null,
    "protein": number | null,
    "carbs": number | null,
    "fat": number | null
  },
  "basis": "per100" | "perServing" | "unknown",
  "notes": string | null
}

RULES — these matter more than filling every field:

1. If you cannot clearly read a nutrition panel, set "found": false and leave
   every number null. A guessed number is worse than no number: the user can
   type it themselves, but they cannot tell that your guess was invented.

2. NEVER infer a number from the others. If the label shows energy and fat
   but the protein line is blurred, protein is null. Do not back-calculate
   calories from macros, or macros from calories.

3. Energy must be KILOCALORIES. Many labels, especially European and Indian
   ones, print kJ — sometimes both. If only kJ is given, divide by 4.184 and
   round to the nearest whole number. Never return a kJ figure as calories:
   it would be ~4x too high and would silently wreck the user's day.

4. Labels state values per 100g, per serving, or both.
   - If a per-100g column exists, use it and set "basis": "per100".
   - If ONLY per-serving values exist, put those raw numbers in "per100"
     anyway, set "basis": "perServing", and put the serving size in
     "serving_grams". The caller rescales. Do NOT rescale yourself — if the
     serving size is unreadable your arithmetic would be wrong and no one
     could tell.
   - "basis": "unknown" if you genuinely cannot tell which it is.

5. "serving_grams" is the serving weight in grams or millilitres as a plain
   number. "30g" -> 30. "2 biscuits (25g)" -> 25. If it is stated only in
   pieces or cups with no weight, null.

6. Carbohydrate: use TOTAL carbohydrate, not "of which sugars". If the label
   only gives "available carbohydrate" use that.

7. "name" is the product as printed, without the brand. "brand" is the maker.
   If the photo shows only the panel and no front-of-pack name, both null —
   the user will type them.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  if (!KEY) return json({ error: "GEMINI_API_KEY is not set on this function." }, 500);

  try {
    const { image, mime } = await req.json();
    if (typeof image !== "string" || image.length < 100) {
      return json({ error: "No image supplied." }, 400);
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mime ?? "image/jpeg", data: image } },
              ],
            },
          ],
          generationConfig: {
            // Reading printed numbers is transcription, not writing. Any
            // creativity here is a hallucinated macro.
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!res.ok) {
      const detail = await res.text();
      // Surface Google's own message. A wrong model name or an unbilled key
      // both land here and are otherwise indistinguishable from "couldn't
      // read the label", which would send the user hunting the wrong bug.
      return json({ error: `Gemini ${res.status}: ${detail.slice(0, 300)}` }, 502);
    }

    const body = await res.json();
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) return json({ error: "Gemini returned no text." }, 502);

    let parsed: Record<string, unknown>;
    try {
      // responseMimeType should make the fence impossible, but models have
      // emitted one anyway; stripping costs nothing.
      parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
    } catch {
      return json({ error: "Gemini returned malformed JSON." }, 502);
    }

    return json(sanitise(parsed));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

type Per100 = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

/**
 * Repairs the model's output rather than trusting it.
 *
 * Everything here has been emitted by a vision model at some point: strings
 * where numbers belong, "N/A", negative values, a whole missing per100
 * object. The UI puts these straight into editable fields, so a bad value is
 * recoverable — but a value that is silently 4x too high is not, which is
 * why the kJ check below rejects rather than converts.
 */
function sanitise(r: Record<string, unknown>) {
  const n = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const x = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.]/g, ""));
    return Number.isFinite(x) && x >= 0 ? Math.round(x * 10) / 10 : null;
  };

  const s = (v: unknown): string | null => {
    const str = typeof v === "string" ? v.trim() : "";
    return str && !/^(n\/?a|none|null|unknown)$/i.test(str) ? str.slice(0, 160) : null;
  };

  const src = (r.per100 ?? {}) as Record<string, unknown>;
  const per100: Per100 = {
    calories: n(src.calories),
    protein: n(src.protein),
    carbs: n(src.carbs),
    fat: n(src.fat),
  };

  // No food is over 900 kcal/100g — pure fat is 900. A higher number means
  // the model handed back kilojoules despite rule 3, so drop it and let the
  // user type it. Dividing by 4.184 here would be guessing at the cause.
  if (per100.calories !== null && per100.calories > 900) per100.calories = null;

  // Macros are grams per 100g; none can exceed 100.
  for (const k of ["protein", "carbs", "fat"] as const) {
    const v = per100[k];
    if (v !== null && v > 100) per100[k] = null;
  }

  const basis = ["per100", "perServing", "unknown"].includes(String(r.basis))
    ? (r.basis as "per100" | "perServing" | "unknown")
    : "unknown";

  const serving = n(r.serving_grams);

  return {
    found:
      r.found === true &&
      // "found" with nothing readable in it is not found, whatever the model
      // claims. The caller branches on this to decide whether to show the
      // blank form or the prefilled one.
      Object.values(per100).some((v) => v !== null),
    name: s(r.name),
    brand: s(r.brand),
    serving_grams: serving !== null && serving > 0 && serving < 2000 ? serving : null,
    per100,
    basis,
    notes: s(r.notes),
  };
}
