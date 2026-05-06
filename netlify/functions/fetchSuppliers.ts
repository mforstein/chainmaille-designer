// netlify/functions/fetchSuppliers.ts
// Lightweight supplier color scraper — listing pages only, no deep-link crawl.
// Keeps total fetch budget under 20 requests so it completes within 10s.

import * as cheerio from "cheerio";
import { createHash } from "crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Color vocabulary
// ---------------------------------------------------------------------------

const KNOWN_COLORS = [
  "Black", "Blue", "Cobalt", "Navy", "Royal Blue", "Sky Blue",
  "Green", "Lime", "Olive", "Red", "Crimson", "Burgundy",
  "Purple", "Violet", "Lavender", "Pink", "Hot Pink", "Magenta", "Fuchsia",
  "Gold", "Yellow", "Orange", "Teal", "Turquoise", "Aqua",
  "Silver", "Bronze", "Brown", "Copper", "Rainbow", "Natural",
  "Bright", "Gunmetal", "Champagne", "Rose Gold", "Rose", "Ice",
  "Clear", "White", "Grey", "Gray", "Brass", "Niobium", "Titanium",
  "Stainless", "Aluminum", "Nickel", "Enameled", "Rubber",
];

const COLOR_TO_HEX: Record<string, string> = {
  "black": "#1a1a1a", "blue": "#2563eb", "cobalt": "#1d4ed8",
  "navy": "#1e3a5f", "royal blue": "#1d4ed8", "sky blue": "#38bdf8",
  "green": "#16a34a", "lime": "#84cc16", "olive": "#65a30d",
  "red": "#dc2626", "crimson": "#9f1239", "burgundy": "#7f1d1d",
  "purple": "#7c3aed", "violet": "#8b5cf6", "lavender": "#c4b5fd",
  "pink": "#ec4899", "hot pink": "#f9a8d4", "magenta": "#d946ef",
  "fuchsia": "#d946ef", "gold": "#d97706", "yellow": "#eab308",
  "orange": "#f97316", "teal": "#0d9488", "turquoise": "#06b6d4",
  "aqua": "#22d3ee", "silver": "#9ca3af", "bronze": "#b45309",
  "brown": "#92400e", "copper": "#b87333", "rainbow": "#e040fb",
  "natural": "#d4d4d4", "bright": "#e5e7eb", "gunmetal": "#374151",
  "champagne": "#e8d5b7", "rose gold": "#e8b4b8", "rose": "#fb7185",
  "ice": "#bfdbfe", "clear": "#f3f4f6", "white": "#f3f4f6",
  "grey": "#6b7280", "gray": "#6b7280", "brass": "#d4a017",
  "niobium": "#8b5cf6", "titanium": "#94a3b8", "stainless": "#cbd5e1",
  "aluminum": "#d1d5db", "nickel": "#e2e8f0", "enameled": "#f472b6",
  "rubber": "#374151",
};

function colorToHex(name: string): string {
  const l = name.toLowerCase().trim();
  if (COLOR_TO_HEX[l]) return COLOR_TO_HEX[l];
  for (const [k, v] of Object.entries(COLOR_TO_HEX)) {
    if (l.includes(k) || k.includes(l)) return v;
  }
  return "#6b7280";
}

function pickColorFrom(text: string): string | null {
  const t = text.toLowerCase();
  for (const c of KNOWN_COLORS) {
    if (t.includes(c.toLowerCase())) return c;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const TMP = process.env.TMPDIR || "/tmp";
const CACHE_DIR = join(TMP, "chainmaille-cache");

interface CachedOutput {
  timestamp: number;
  suppliers: SupplierResult[];
}

function readCache(key: string): CachedOutput | null {
  try {
    if (!existsSync(CACHE_DIR)) return null;
    const file = join(CACHE_DIR, `${key}.json`);
    if (!existsSync(file)) return null;
    const obj: CachedOutput = JSON.parse(readFileSync(file, "utf-8"));
    if (Date.now() - obj.timestamp > CACHE_TTL_MS) return null;
    return obj;
  } catch { return null; }
}

function writeCache(key: string, data: CachedOutput) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(data), "utf-8");
  } catch { /* benign */ }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ColorEntry { color: string; hex: string; material: string; rings: any[] }
interface MaterialEntry { name: string; colors: ColorEntry[] }
interface SupplierResult { supplier: string; materials: MaterialEntry[] }

// ---------------------------------------------------------------------------
// Listing-page scraper (no deep links)
// ---------------------------------------------------------------------------

const FETCH_OPTS = {
  headers: {
    "user-agent": "Mozilla/5.0 (compatible; ChainmailleDesignerBot/1.1; colors-only)",
    "accept": "text/html,application/xhtml+xml",
  },
  signal: AbortSignal.timeout(6_000),
};

async function fetchColors(url: string, materialName: string): Promise<ColorEntry[]> {
  try {
    const res = await fetch(url, FETCH_OPTS);
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);

    const seen = new Set<string>();
    const entries: ColorEntry[] = [];

    // Scan product card titles, headings, and link text for color words
    const selectors = [
      "h1", "h2", "h3", "h4",
      ".product-title", ".product__title", ".card__heading",
      ".grid-product__title", ".product-card__title",
      "a.product-card", ".product-item__title",
      ".product-list-item__name", ".product-name",
    ];

    $(selectors.join(", ")).each((_, el) => {
      const text = $(el).text().trim();
      const color = pickColorFrom(text);
      if (color && !seen.has(color.toLowerCase())) {
        seen.add(color.toLowerCase());
        entries.push({ color, hex: colorToHex(color), material: materialName, rings: [] });
      }
    });

    // Also scan alt tags and data attributes for color hints
    $("[data-color], [data-swatch-label], [aria-label]").each((_, el) => {
      const text = ($(el).attr("data-color") || $(el).attr("data-swatch-label") || $(el).attr("aria-label") || "").trim();
      const color = pickColorFrom(text);
      if (color && !seen.has(color.toLowerCase())) {
        seen.add(color.toLowerCase());
        entries.push({ color, hex: colorToHex(color), material: materialName, rings: [] });
      }
    });

    return entries;
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Supplier configs — listing URLs only, no product-page crawl
// ---------------------------------------------------------------------------

const SUPPLIERS: Array<{
  name: string;
  pages: Array<{ url: string; material: string }>;
}> = [
  {
    name: "The Ring Lord",
    pages: [
      { url: "https://theringlord.com/rings/anodized-aluminum/", material: "Anodized Aluminum" },
      { url: "https://theringlord.com/rings/bright-aluminum/", material: "Bright Aluminum" },
      { url: "https://theringlord.com/rings/niobium/", material: "Niobium" },
      { url: "https://theringlord.com/scales/", material: "Scales" },
    ],
  },
  {
    name: "Chainmail Joe",
    pages: [
      { url: "https://chainmailjoe.com/collections/anodized-aluminum-rings", material: "Anodized Aluminum" },
      { url: "https://chainmailjoe.com/collections/bright-aluminum-rings", material: "Bright Aluminum" },
      { url: "https://chainmailjoe.com/collections/scales", material: "Scales" },
    ],
  },
  {
    name: "MetalDesignz",
    pages: [
      { url: "https://www.metaldesignz.com/shop/219", material: "Rings" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Fallback static colors (returned when all fetches fail)
// ---------------------------------------------------------------------------

function staticFallback(): SupplierResult[] {
  const allColors = KNOWN_COLORS.map((name) => ({
    color: name,
    hex: colorToHex(name),
    material: "Mixed",
    rings: [],
  }));
  return [{
    supplier: "Colors (offline)",
    materials: [{ name: "All Materials", colors: allColors }],
  }];
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handler = async (event: any) => {
  const forceFresh = event?.queryStringParameters?.fresh === "1";
  const cacheKey = createHash("sha1").update("fetchSuppliers:v3").digest("hex");

  if (!forceFresh) {
    const cached = readCache(cacheKey);
    if (cached) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
        body: JSON.stringify({ cached: true, timestamp: cached.timestamp, suppliers: cached.suppliers }),
      };
    }
  }

  // Fetch all listing pages concurrently (each has a 6s individual timeout)
  const results: SupplierResult[] = [];
  const TOTAL_TIMEOUT = 8_000;
  const deadline = Date.now() + TOTAL_TIMEOUT;

  await Promise.all(
    SUPPLIERS.map(async (sup) => {
      const mat: Record<string, ColorEntry[]> = {};

      await Promise.all(
        sup.pages.map(async ({ url, material }) => {
          if (Date.now() > deadline) return;
          const entries = await fetchColors(url, material);
          if (!mat[material]) mat[material] = [];
          for (const e of entries) {
            if (!mat[material].some((x) => x.color === e.color)) {
              mat[material].push(e);
            }
          }
        })
      );

      const materials: MaterialEntry[] = Object.entries(mat).map(([name, colors]) => ({ name, colors }));
      if (materials.length > 0) {
        results.push({ supplier: sup.name, materials });
      }
    })
  );

  const suppliers = results.length > 0 ? results : staticFallback();
  const out: CachedOutput = { timestamp: Date.now(), suppliers };

  writeCache(cacheKey, out);

  return {
    statusCode: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
    body: JSON.stringify({ cached: false, ...out }),
  };
};
