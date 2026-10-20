// Imports USDA FoodData Central branded foods into Supabase `products`.
//
// USDA data is US Government public domain - no licence contamination,
// unlike Open Food Facts (ODbL share-alike).
//
// Usage:
//   1. Download "Branded foods" CSV from https://fdc.nal.usda.gov/download-datasets
//   2. Unzip it. You need branded_food.csv and food_nutrient.csv
//   3. SUPABASE_URL=... SERVICE_KEY=... node scripts/import-usda.mjs ./FoodData_Central_csv
//
// SERVICE_KEY is the service_role key (Settings > API). It bypasses RLS,
// which this needs: rows are inserted with no owner.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const DIR = process.argv[2];
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SERVICE_KEY;
if (!DIR || !URL || !KEY) {
  console.error("usage: SUPABASE_URL=.. SERVICE_KEY=.. node import-usda.mjs <csv-dir>");
  process.exit(1);
}

// USDA nutrient ids. Energy has two: 1008 is kcal, 1062 is kJ. We want kcal.
const N = { 1008: "calories_100g", 1003: "protein_100g", 1005: "carbs_100g", 1004: "fat_100g" };

function* parseCsv(line) {
  // USDA quotes fields containing commas, and escapes quotes by doubling.
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { yield cur; cur = ""; }
    else cur += c;
  }
  yield cur;
}

async function rows(file, onRow) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, file)) });
  let head = null, n = 0;
  for await (const line of rl) {
    const cells = [...parseCsv(line)];
    if (!head) { head = cells; continue; }
    const o = {};
    head.forEach((h, i) => (o[h] = cells[i]));
    onRow(o);
    if (++n % 200000 === 0) console.log(`  ${file}: ${n} rows`);
  }
  return n;
}

// --- pass 1: nutrition, keyed by fdc_id -------------------------------------
console.log("reading food_nutrient.csv (this is the big one, ~2GB)...");
const nutr = new Map();
await rows("food_nutrient.csv", (r) => {
  const key = N[r.nutrient_id];
  if (!key) return;                     // 99% of rows are nutrients we don't use
  const v = parseFloat(r.amount);
  if (!Number.isFinite(v)) return;
  let e = nutr.get(r.fdc_id);
  if (!e) nutr.set(r.fdc_id, (e = {}));
  e[key] = v;
});
console.log(`  ${nutr.size} foods have nutrition`);

// --- pass 2: products, deduped by barcode -----------------------------------
console.log("reading branded_food.csv...");
const byCode = new Map();
await rows("branded_food.csv", (r) => {
  const code = (r.gtin_upc || "").trim().replace(/\D/g, "");
  if (!code || code.length < 8) return;
  const n = nutr.get(r.fdc_id);
  if (!n || !Number.isFinite(n.calories_100g)) return;   // no calories = useless

  // Several FDC entries share one barcode (relabels over the years).
  // Keep the newest: available_date is the publication date.
  const prev = byCode.get(code);
  if (prev && prev.date >= (r.available_date || "")) return;

  const serving = parseFloat(r.serving_size);
  byCode.set(code, {
    date: r.available_date || "",
    row: {
      barcode: code,
      name: (r.description || "").slice(0, 200),
      brand: (r.brand_owner || r.brand_name || "").slice(0, 120) || null,
      calories_100g: n.calories_100g,
      protein_100g: n.protein_100g ?? 0,
      carbs_100g: n.carbs_100g ?? 0,
      fat_100g: n.fat_100g ?? 0,
      // serving_size_unit is "g" or "ml" for most, "GRM"/"MLT" for some.
      serving_grams: Number.isFinite(serving) && serving > 0 ? serving : null,
      serving_label: r.household_serving_fulltext || null,
      source: "usda",
      confirmations: 0,
    },
  });
});
console.log(`  ${byCode.size} unique barcodes`);

// --- upload -----------------------------------------------------------------
const all = [...byCode.values()].map((v) => v.row);
const CHUNK = 1000;
let done = 0;
for (let i = 0; i < all.length; i += CHUNK) {
  const res = await fetch(`${URL}/rest/v1/products?on_conflict=barcode`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      // Don't clobber rows a real user typed; theirs is the better data.
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(all.slice(i, i + CHUNK)),
  });
  if (!res.ok) { console.error(`chunk ${i} failed:`, res.status, await res.text()); process.exit(1); }
  done += CHUNK;
  if (done % 20000 === 0) console.log(`  uploaded ${Math.min(done, all.length)}/${all.length}`);
}
console.log(`done: ${all.length} products`);
