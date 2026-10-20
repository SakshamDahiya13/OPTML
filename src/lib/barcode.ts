import { supabase } from "./supabase";
import type { ParsedItem, ParseResult } from "./db";

/**
 * Barcode → nutrition, via Open Food Facts.
 *
 * Chosen because it is the only free source with a real barcode endpoint:
 * USDA FoodData Central has branded foods but documents no UPC lookup, only
 * fetch-by-id and keyword search. No API key is needed here, just a
 * User-Agent, and reads are limited to ~15/min per user — fine for scanning,
 * which is a handful of lookups, not a stream.
 *
 * Coverage is crowd-sourced and strongest in Europe, so a US product may
 * genuinely not be there. Callers must handle null by falling back to the AI
 * parser rather than showing a dead end.
 */

const BASE = "https://world.openfoodfacts.org/api/v2/product";

// Only what we use — the full record is enormous and we pay for it in
// bandwidth on a phone.
const FIELDS = [
  "code",
  "product_name",
  "brands",
  "image_front_small_url",
  "nutriments",
  "serving_size",
  "serving_quantity",
  "quantity",
].join(",");

export type Nutrients100g = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type Product = {
  code: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  /** Per 100g or 100ml. Everything else is scaled from this. */
  per100: Nutrients100g;
  /** The label's own serving, when it states one. */
  serving: { label: string; grams: number } | null;
  /** Pack size, e.g. "500 g". Shown for recognition only. */
  packSize: string | null;
  /** True when this came from our own users rather than Open Food Facts. */
  contributed?: boolean;
  /** How many people have scanned it and saved without correcting it. */
  confirmations?: number;
};

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * A US product scans as 12-digit UPC-A, but Open Food Facts keys most records
 * by 13-digit EAN — the same number with a leading zero. Trying only what the
 * scanner returned misses a lot of American products for no reason.
 */
function candidates(raw: string): string[] {
  const code = raw.trim().replace(/\D/g, "");
  const out = [code];
  if (code.length === 12) out.push(`0${code}`);
  if (code.length === 13 && code.startsWith("0")) out.push(code.slice(1));
  return out;
}

/**
 * Why a lookup didn't produce a product.
 *
 * These were originally collapsed into a single null, which made a dead
 * network indistinguishable from a product that genuinely isn't listed — and
 * made "it says no data for everything" impossible to diagnose from the UI.
 */
export type LookupFailure =
  | { reason: "not_found"; code: string }
  | { reason: "no_nutrition"; code: string; name: string }
  | { reason: "rate_limited"; code: string }
  | { reason: "http"; code: string; status: number }
  | { reason: "network"; code: string; detail: string };

export type LookupResult =
  | { ok: true; product: Product }
  | ({ ok: false } & LookupFailure);

async function fetchOne(code: string): Promise<LookupResult> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${code}.json?fields=${FIELDS}`, {
      headers: {
        // Open Food Facts asks every client to identify itself.
        "User-Agent": "OPTML/1.0 (support@optml.app)",
        Accept: "application/json",
      },
    });
  } catch (e) {
    return {
      ok: false,
      reason: "network",
      code,
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  // v2 answers an unknown barcode with a bare 404 rather than a 200 carrying
  // status:0, which the older v0 endpoint did. Treating that as a server
  // error reports "the database is broken" for the ordinary, expected case of
  // a product nobody has added yet.
  if (res.status === 404) return { ok: false, reason: "not_found", code };

  // 429 is their per-IP cap (~15 product reads a minute); 503 is the global
  // one. Both are "wait", not "this product doesn't exist".
  if (res.status === 429 || res.status === 503) {
    return { ok: false, reason: "rate_limited", code };
  }

  if (!res.ok) return { ok: false, reason: "http", code, status: res.status };

  const body = await res.json().catch(() => null);
  if (!body) {
    return { ok: false, reason: "network", code, detail: "Response wasn't JSON." };
  }

  // v2 reports found as status 1; be lenient in case the shape shifts.
  const found = body.status === 1 || body.status === "success" || !!body.product;
  const p = body.product;
  if (!found || !p) return { ok: false, reason: "not_found", code };

  const n = p.nutriments ?? {};
  const calories =
    num(n["energy-kcal_100g"]) ??
    // Some records only carry kilojoules.
    (num(n["energy_100g"]) != null ? num(n["energy_100g"])! / 4.184 : null);

  const protein = num(n["proteins_100g"]);
  const carbs = num(n["carbohydrates_100g"]);
  const fat = num(n["fat_100g"]);

  // The product exists but carries no energy value — common for sparsely
  // filled regional entries. Worth telling the user apart from "not listed",
  // because they can contribute the data back.
  if (calories == null) {
    return {
      ok: false,
      reason: "no_nutrition",
      code,
      name: String(p.product_name ?? "").trim() || "that product",
    };
  }

  const servingGrams = num(p.serving_quantity);

  const product: Product = {
    code: String(p.code ?? code),
    name: String(p.product_name ?? "").trim() || "Unnamed product",
    brand: p.brands ? String(p.brands).split(",")[0].trim() : null,
    imageUrl: p.image_front_small_url ?? null,
    per100: {
      calories: Math.round(calories),
      protein_g: protein ?? 0,
      carbs_g: carbs ?? 0,
      fat_g: fat ?? 0,
    },
    serving:
      servingGrams && servingGrams > 0
        ? {
            label: String(p.serving_size ?? `${servingGrams} g`).trim(),
            grams: servingGrams,
          }
        : null,
    packSize: p.quantity ? String(p.quantity) : null,
  };

  return { ok: true, product };
}

/**
 * Try every plausible form of the scanned code, and report precisely why we
 * came back empty if none of them hit.
 *
 * The failure reported is the most informative one seen, not the last: a
 * product found without nutrition data tells the user far more than a
 * "not_found" on the zero-padded variant that was never going to match.
 */
/**
 * Products our own users have contributed.
 *
 * Checked before Open Food Facts for two reasons: it's a single indexed
 * lookup against a table we own, and a product someone typed off the actual
 * packet should beat a generic entry.
 *
 * Note we never copy Open Food Facts records INTO this table. Their data is
 * ODbL share-alike: merging it into our database would oblige us to publish
 * the whole combined thing as open data. Keeping the two sources separate
 * keeps that obligation off our own records.
 */
async function fromOurDatabase(code: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "barcode,name,brand,calories_100g,protein_100g,carbs_100g,fat_100g,serving_grams,serving_label,confirmations"
    )
    .eq("barcode", code)
    .maybeSingle();

  if (error || !data) return null;

  return {
    code: data.barcode,
    name: data.name,
    brand: data.brand,
    imageUrl: null,
    per100: {
      calories: Number(data.calories_100g),
      protein_g: Number(data.protein_100g ?? 0),
      carbs_g: Number(data.carbs_100g ?? 0),
      fat_g: Number(data.fat_100g ?? 0),
    },
    serving:
      data.serving_grams != null
        ? {
            label: data.serving_label ?? `${Math.round(Number(data.serving_grams))} g`,
            grams: Number(data.serving_grams),
          }
        : null,
    packSize: null,
    contributed: true,
    confirmations: Number(data.confirmations ?? 0),
  };
}

export async function lookupBarcode(raw: string): Promise<LookupResult> {
  const tried = candidates(raw);

  // Ours first — instant, and a packet someone actually read beats a guess.
  for (const code of tried) {
    const mine = await fromOurDatabase(code);
    if (mine) return { ok: true, product: mine };
  }

  let best: LookupResult | null = null;

  const rank: Record<LookupFailure["reason"], number> = {
    no_nutrition: 4,
    rate_limited: 3,
    http: 2,
    network: 2,
    not_found: 1,
  };

  for (const code of tried) {
    const result = await fetchOne(code);
    if (result.ok) return result;
    if (!best || rank[result.reason] > rank[(best as { reason: LookupFailure["reason"] }).reason]) {
      best = result;
    }
  }

  return best ?? { ok: false, reason: "not_found", code: raw };
}

/* --------------------------------------------------------- contributing */

export type NewProduct = {
  barcode: string;
  name: string;
  brand?: string | null;
  calories_100g: number;
  protein_100g?: number;
  carbs_100g?: number;
  fat_100g?: number;
  serving_grams?: number | null;
  serving_label?: string | null;
};

/**
 * Add a product nobody had scanned before.
 *
 * This is the only route to coverage we can afford. No API sells good Indian
 * packaged-food data at an independent developer's budget, and the apps that
 * have it built it the same way — one label at a time, over years.
 */
export async function saveProduct(p: NewProduct): Promise<Product> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("products")
    .insert({
      barcode: p.barcode,
      name: p.name.trim(),
      brand: p.brand?.trim() || null,
      calories_100g: p.calories_100g,
      protein_100g: p.protein_100g ?? 0,
      carbs_100g: p.carbs_100g ?? 0,
      fat_100g: p.fat_100g ?? 0,
      serving_grams: p.serving_grams ?? null,
      serving_label: p.serving_label ?? null,
      source: "user",
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    code: data.barcode,
    name: data.name,
    brand: data.brand,
    imageUrl: null,
    per100: {
      calories: Number(data.calories_100g),
      protein_g: Number(data.protein_100g),
      carbs_g: Number(data.carbs_100g),
      fat_g: Number(data.fat_100g),
    },
    serving:
      data.serving_grams != null
        ? {
            label: data.serving_label ?? `${Math.round(Number(data.serving_grams))} g`,
            grams: Number(data.serving_grams),
          }
        : null,
    packSize: null,
    contributed: true,
    confirmations: 0,
  };
}

/**
 * Saving a contributed product without editing it is a quiet vote that the
 * numbers are right — cheaper than moderation, and it lets the UI say how
 * many people have agreed. Best effort: never block a log on it.
 */
export async function confirmProduct(barcode: string): Promise<void> {
  const { error } = await supabase.rpc("confirm_product", { p_barcode: barcode });
  if (error) console.warn("confirm_product failed:", error.message);
}

/* ------------------------------------------------------------- portions */

export type Portion =
  | { kind: "serving"; label: string; grams: number }
  | { kind: "grams"; grams: number }
  | { kind: "estimate"; label: string; grams: number };

/**
 * Scale a product to a portion.
 *
 * The confidence split is the point of the whole feature: a weighed amount
 * off a printed label is arithmetic, so min and max collapse onto the value
 * and nothing is guessed. An eyeballed portion ("a bowl") puts the guess back
 * in — not in the nutrition, but in the grams — so it carries a range. That
 * range is deliberately asymmetric and wider below, because people
 * consistently underestimate how much they poured.
 */
export function scaleToPortion(product: Product, portion: Portion): ParsedItem {
  const g = Math.max(portion.grams, 0);
  const f = g / 100;
  const exact = portion.kind !== "estimate";

  const point = {
    calories: product.per100.calories * f,
    protein_g: product.per100.protein_g * f,
    carbs_g: product.per100.carbs_g * f,
    fat_g: product.per100.fat_g * f,
  };

  // ±35% on an eyeballed portion, skewed so the upper bound reaches further:
  // the common error is pouring more than you think, not less.
  const lo = exact ? 1 : 0.7;
  const hi = exact ? 1 : 1.45;

  const label =
    portion.kind === "grams"
      ? `${Math.round(g)}g`
      : portion.label;

  return {
    name: displayName(product),
    qty: Math.round(g),
    unit: "g",
    calories: point.calories,
    calories_min: point.calories * lo,
    calories_max: point.calories * hi,
    protein_g: point.protein_g,
    protein_min: point.protein_g * lo,
    protein_max: point.protein_g * hi,
    carbs_g: point.carbs_g,
    carbs_min: point.carbs_g * lo,
    carbs_max: point.carbs_g * hi,
    fat_g: point.fat_g,
    fat_min: point.fat_g * lo,
    fat_max: point.fat_g * hi,
    confidence: exact ? "high" : "medium",
    assumptions: {
      matched: `${product.name}${product.brand ? ` — ${product.brand}` : ""} (barcode ${product.code})`,
      portion: exact
        ? `${label} — scaled from the label's per-100g values`
        : `${label}, estimated at about ${Math.round(g)}g`,
      note: exact
        ? undefined
        : "Portion was estimated, not weighed — weigh it for exact numbers.",
    },
  };
}

/**
 * "Nutella, Ferrero" + "Nutella" must not become "Nutella Nutella".
 *
 * Open Food Facts stores the brand list and the product name independently,
 * and for own-brand products the brand is often repeated in the name. Joining
 * them blindly reads as a typo in the user's food log.
 */
function displayName(product: Product): string {
  const name = product.name.trim();
  const brand = product.brand?.trim();
  if (!brand) return name;

  const n = name.toLowerCase();
  const b = brand.toLowerCase();
  if (n.includes(b) || b.includes(n)) return name;
  return `${brand} ${name}`;
}

/** Wrap a scanned item so it can travel the same path as a chat-parsed meal. */
export function toParseResult(
  item: ParsedItem,
  label: string,
  code: string
): ParseResult {
  return {
    label,
    items: [item],
    raw_text: `Scanned barcode ${code}`,
    priors_used: 0,
  };
}
