// netlify/functions/fetchSuppliers.ts
/* eslint-disable no-console */

// -----------------------------------------------------------------------------
// Deep supplier scraper for Chainmaille Designer
// - Suppliers: Chainmail Joe, The Ring Lord, MetalDesignz
// - Extracts: material, color, wire gauge/diameter, inner diameter (ID), AR, availability, URLs
// - Concurrency-limited, with 1h file cache in /tmp
// -----------------------------------------------------------------------------

// NOTE: This function avoids @netlify/functions types to keep dependencies minimal.
// You can optionally `npm i -D @netlify/functions` and type `handler` if you like.

// ------- Deps (install in project root) -------
// npm i cheerio p-limit
// (Node 20+ has global fetch; Netlify runtime uses Node 20 here.)

import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { createHash } from "crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type SupplierKey = "Chainmail Joe" | "The Ring Lord" | "MetalDesignz";

type RingVariant = {
  wireGauge?: string;
  wireDiameter?: string; // e.g., "1.6 mm" or "0.064 in"
  ringID?: string;       // e.g., '1/4"' or "6.35 mm"
  aspectRatio?: string;  // "AR 4.0"
  available: boolean;
  url: string;
  sku?: string;
};

type ColorEntry = {
  color: string;
  rings: RingVariant[];
};

type MaterialEntry = {
  name: string;
  colors: ColorEntry[];
};

type SupplierResult = {
  supplier: SupplierKey;
  materials: MaterialEntry[];
};

type Output = {
  cached: boolean;
  timestamp: number;
  suppliers: SupplierResult[];
};

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const TMP = process.env.TMPDIR || "/tmp";
const CACHE_DIR = join(TMP, "chainmaille-cache");
const CONCURRENCY = 4; // deep-page fetches at once

// Source roots
const SITES = {
  "Chainmail Joe": {
    roots: [
      "https://chainmailjoe.com/collections/anodized-aluminum-rings",
      "https://chainmailjoe.com/collections/bright-aluminum-rings",
      "https://chainmailjoe.com/anodized-aluminum-rings-by-the-ounce/",
      "https://chainmailjoe.com/bright-aluminum-rings-by-the-ounce/",
      "https://chainmailjoe.com/anodized-aluminum-rings-bulk/",
      "https://chainmailjoe.com/bright-aluminum-rings-bulk/",
    ],
    host: "chainmailjoe.com",
  },
  "The Ring Lord": {
    roots: [
      "https://theringlord.com/rings/",
      "https://theringlord.com/rings/anodized-aluminum/",
      "https://theringlord.com/rings/stainless-steel/",
      "https://theringlord.com/rings/brass/",
      "https://theringlord.com/rings/copper/",
      "https://theringlord.com/rings/bronze/",
      "https://theringlord.com/rings/bright-aluminum/",
      "https://theringlord.com/rings/titanium/",
      "https://theringlord.com/rings/niobium/",
      "https://theringlord.com/rings/black-stainless/",
      "https://theringlord.com/rings/rubber/",
      "https://theringlord.com/rings/silver/",
      "https://theringlord.com/rings/carbon-steel/",
      "https://theringlord.com/rings/nickel-silver/",
      "https://theringlord.com/rings/galvanized-steel/",
      "https://theringlord.com/rings/engineered-plastic/",
      "https://theringlord.com/rings/plated/",
      "https://theringlord.com/rings/enameled-copper/",
      "https://theringlord.com/shop-now/specials/rings/",
      "https://theringlord.com/shop-now/clearance/rings/",
    ],
    host: "theringlord.com",
  },
  "MetalDesignz": {
    roots: [
      "https://www.metaldesignz.com/shop/219",
      "https://www.metaldesignz.com/",
      // Their navigation can change; we’ll discover product links dynamically.
    ],
    host: "www.metaldesignz.com",
  },
} as const;

// Known color words we’ll match in titles/options
const KNOWN_COLORS = [
  "Black", "Blue", "Green", "Red", "Purple", "Pink", "Gold", "Silver", "Bronze", "Brown",
  "Copper", "Yellow", "Orange", "Teal", "Turquoise", "Magenta", "Fuchsia", "Rainbow",
  "Natural", "Bright", "Matte", "Gunmetal", "Champagne", "Rose Gold", "Ice", "Jet",
  "Clear", "White", "Grey", "Gray", "Brass", "Niobium", "Titanium", "Stainless"
];

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hash(str: string) {
  return createHash("sha1").update(str).digest("hex");
}

function readCache(key: string): Output | null {
  try {
    if (!existsSync(CACHE_DIR)) return null;
    const file = join(CACHE_DIR, `${key}.json`);
    if (!existsSync(file)) return null;
    const raw = readFileSync(file, "utf-8");
    const obj = JSON.parse(raw) as Output;
    const age = Date.now() - obj.timestamp;
    if (age > CACHE_TTL_MS) return null;
    return obj;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: Output) {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    const file = join(CACHE_DIR, `${key}.json`);
    writeFileSync(file, JSON.stringify(data), "utf-8");
  } catch (e) {
    console.warn("Cache write failed:", e);
  }
}

async function fetchHTML(url: string, retries = 2): Promise<string> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; ChainmailleDesignerBot/1.0; +https://example.com/bot)",
          "accept": "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return text;
    } catch (err) {
      if (i === retries) throw err;
      await sleep(500 * (i + 1));
    }
  }
  // should never reach
  return "";
}

// Normalize a color guess from a given text chunk
function pickColorFrom(text: string): string | null {
  const t = text.toLowerCase();
  let found: string | null = null;
  for (const color of KNOWN_COLORS) {
    if (t.includes(color.toLowerCase())) {
      found = color;
      break;
    }
  }
  return found;
}

// Extract ring spec strings from any text (title, option text, tables)
function extractSpecs(text: string): Partial<RingVariant> {
  // We’ll gather a few candidates then return normalized strings
  // Patterns
  const gGauge =
    /\b(\d{1,2}\s?(?:awg|swg|g|ga|gage|gauge))\b/i;
  const gWireMM =
    /\b(\d+(?:\.\d+)?)\s?mm\b/i;
  const gWireIN =
    /\b(\d+(?:\.\d+)?)\s?(?:in|inch|")\b/i;
  const gIDMM =
    /\b(\d+(?:\.\d+)?)\s?mm\s*ID\b/i;
  const gIDIN =
    /\b(\d+(?:\.\d+)?)\s?(?:in|inch|")\s*ID\b/i;
  const gAR =
    /\bAR\s*(?:[:≈=])\s*(\d+(?:\.\d+)?)\b/i;

  const out: Partial<RingVariant> = {};
  const t = text.replace(/\s+/g, " ");

  // Gauge
  const mGauge = t.match(gGauge);
  if (mGauge) out.wireGauge = mGauge[1].toUpperCase().replace(/\s+/g, "");

  // Wire diameter
  const mWmm = t.match(gWireMM);
  const mWin = t.match(gWireIN);
  if (mWmm) out.wireDiameter = `${mWmm[1]} mm`;
  else if (mWin) out.wireDiameter = `${mWin[1]} in`;

  // ID
  const mIDmm = t.match(gIDMM);
  const mIDin = t.match(gIDIN);
  if (mIDmm) out.ringID = `${mIDmm[1]} mm`;
  else if (mIDin) out.ringID = `${mIDin[1]} in`;

  // AR
  const mAR = t.match(gAR);
  if (mAR) out.aspectRatio = `AR ${mAR[1]}`;

  return out;
}

// Merge ring variant data
function mergeVariant(a: RingVariant, b: Partial<RingVariant>): RingVariant {
  return {
    wireGauge: b.wireGauge || a.wireGauge,
    wireDiameter: b.wireDiameter || a.wireDiameter,
    ringID: b.ringID || a.ringID,
    aspectRatio: b.aspectRatio || a.aspectRatio,
    available: b.available ?? a.available,
    url: a.url,
    sku: b.sku || a.sku,
  };
}

function ensureMaterial(
  acc: SupplierResult,
  materialName: string
): MaterialEntry {
  let m = acc.materials.find((x) => x.name.toLowerCase() === materialName.toLowerCase());
  if (!m) {
    m = { name: materialName, colors: [] };
    acc.materials.push(m);
  }
  return m;
}

function ensureColor(me: MaterialEntry, colorName: string): ColorEntry {
  const cname = colorName || "Natural";
  let c = me.colors.find((x) => x.color.toLowerCase() === cname.toLowerCase());
  if (!c) {
    c = { color: cname, rings: [] };
    me.colors.push(c);
  }
  return c;
}

function dedupeRings(rings: RingVariant[]): RingVariant[] {
  const seen = new Map<string, RingVariant>();
  for (const r of rings) {
    const key = [
      (r.wireGauge || "").toLowerCase(),
      (r.wireDiameter || "").toLowerCase(),
      (r.ringID || "").toLowerCase(),
      (r.aspectRatio || "").toLowerCase(),
      r.url,
    ].join("|");
    if (!seen.has(key)) seen.set(key, r);
  }
  return Array.from(seen.values());
}

// -----------------------------------------------------------------------------
// Supplier parsers
// -----------------------------------------------------------------------------

// -------- Chainmail Joe --------
// Shopify-like structure: collections -> product cards -> product pages
async function scrapeChainmailJoe(): Promise<SupplierResult> {
  const sup: SupplierResult = { supplier: "Chainmail Joe", materials: [] };
  const limit = pLimit(CONCURRENCY);

  const productLinks = new Set<string>();

  // Step 1: crawl roots and collect product links
  for (const url of SITES["Chainmail Joe"].roots) {
    try {
      const html = await fetchHTML(url);
      const $ = cheerio.load(html);
      $("a[href*='/products/']").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        const full = href.startsWith("http") ? href : `https://chainmailjoe.com${href}`;
        productLinks.add(full.split("?")[0]);
      });
    } catch (e) {
      console.warn("[Chainmail Joe] root failed:", url, e);
    }
  }

  const tasks = Array.from(productLinks).map((plink) =>
    limit(async () => {
      try {
        const html = await fetchHTML(plink);
        const $ = cheerio.load(html);

        const title = ($("h1.product-title").first().text() ||
          $("h1.product__title").first().text() ||
          $("title").text() ||
          "").trim();

        // Guess material from collection breadcrumbs or title
        let materialGuess =
          $(".breadcrumb a")
            .toArray()
            .map((a) => $(a).text().trim())
            .find((t) => /anodized|bright|aluminum|stainless|steel|niobium|titanium|copper|brass|bronze/i.test(t)) ||
          (title.match(/(anodized aluminum|bright aluminum|aluminum|stainless|niobium|titanium|copper|brass|bronze)/i)?.[1] ?? "Anodized Aluminum");

        materialGuess = materialGuess.replace(/rings?/i, "").trim();
        if (/bright aluminum/i.test(materialGuess)) materialGuess = "Bright Aluminum";
        if (/anodized/i.test(materialGuess) && !/aluminum/i.test(materialGuess)) materialGuess = "Anodized Aluminum";

        // Variants/options: Shopify often uses variant titles in selects or swatches
        const allText =
          $("body").text() +
          " " +
          $("table").text() +
          " " +
          $(".product__info-wrapper").text();

        const material = ensureMaterial(sup, materialGuess);

        // Try to detect color in swatches or option labels
        let colorGuess: string | null = null;
        $("[class*=swatch], .product__swatches [data-swatch]").each((_, el) => {
          const t = $(el).text().trim();
          const c = pickColorFrom(t);
          if (c) colorGuess = c;
        });
        if (!colorGuess) colorGuess = pickColorFrom(title) || "Natural";

        const colorEntry = ensureColor(material, colorGuess);

        // Each distinct spec line we can find becomes a variant
        const lines = allText.split(/[\r\n]+/).map((x) => x.trim()).filter(Boolean);
        const variants: RingVariant[] = [];

        for (const line of lines) {
          const spec = extractSpecs(line);
          // Keep only lines that had any spec-ish info
          if (spec.wireGauge || spec.wireDiameter || spec.ringID || spec.aspectRatio) {
            variants.push({
              ...spec,
              available: !/out\s*of\s*stock|sold\s*out/i.test(allText),
              url: plink,
            });
          }
        }

        // If nothing matched, fallback to a single variant with availability only
        if (variants.length === 0) {
          variants.push({
            available: !/out\s*of\s*stock|sold\s*out/i.test(allText),
            url: plink,
          });
        }

        colorEntry.rings.push(...variants);
        colorEntry.rings = dedupeRings(colorEntry.rings);
      } catch (e) {
        console.warn("[Chainmail Joe] product fail:", plink, e);
      }
    })
  );

  await Promise.all(tasks);
  return sup;
}

// -------- The Ring Lord --------
// Category pages -> product tiles -> product pages with many variant tables
async function scrapeTheRingLord(): Promise<SupplierResult> {
  const sup: SupplierResult = { supplier: "The Ring Lord", materials: [] };
  const limit = pLimit(CONCURRENCY);

  const productLinks = new Set<string>();

  // Step 1: roots -> product links
  for (const url of SITES["The Ring Lord"].roots) {
    try {
      const html = await fetchHTML(url);
      const $ = cheerio.load(html);
      // Product tiles
      $("a").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        if (/\/rings\/.+\/(?!$)/i.test(href) || /product/i.test(href)) {
          const full = href.startsWith("http") ? href : `https://theringlord.com${href}`;
          // Filter obvious category duplicates
          if (/\/rings\/?$/.test(full)) return;
          productLinks.add(full.split("?")[0]);
        }
      });
    } catch (e) {
      console.warn("[TRL] root fail:", url, e);
    }
  }

  const tasks = Array.from(productLinks).map((plink) =>
    limit(async () => {
      try {
        const html = await fetchHTML(plink);
        const $ = cheerio.load(html);

        const title = ($("h1").first().text() || $("title").text() || "").trim();

        // Material from breadcrumbs or title
        let materialGuess =
          $(".breadcrumbs a, nav.breadcrumbs a")
            .toArray()
            .map((a) => $(a).text().trim())
            .find((t) => /anodized|bright|aluminum|stainless|steel|niobium|titanium|copper|brass|bronze|rubber|silver|carbon|nickel|galvanized|black stainless|engineered plastic|plated|enameled/i.test(t)) ||
          (title.match(/(anodized aluminum|bright aluminum|stainless steel|niobium|titanium|copper|brass|bronze|rubber|silver|carbon steel|nickel silver|galvanized steel|black stainless|engineered plastic|plated|enameled copper)/i)?.[1] ?? "Rings");

        // Normalize
        materialGuess = materialGuess
          .replace(/rings?/i, "")
          .replace(/machine cut|saw cut/gi, "")
          .trim()
          || "Rings";

        const material = ensureMaterial(sup, materialGuess);

        // Availability
        const allText = $("body").text();
        const available = !/out\s*of\s*stock|sold\s*out/i.test(allText);

        // Look for spec tables & option lists
        const variants: RingVariant[] = [];

        // Parse possible spec tables
        $("table").each((_, tbl) => {
          const t = $(tbl).text();
          const lines = t.split(/[\r\n]+/).map((x) => x.trim()).filter(Boolean);
          for (const line of lines) {
            const spec = extractSpecs(line);
            if (spec.wireGauge || spec.wireDiameter || spec.ringID || spec.aspectRatio) {
              variants.push({
                ...spec,
                available,
                url: plink,
              });
            }
          }
        });

        // Parse options/selects
        $("option").each((_, opt) => {
          const txt = $(opt).text().trim();
          const spec = extractSpecs(txt);
          if (spec.wireGauge || spec.wireDiameter || spec.ringID || spec.aspectRatio) {
            variants.push({
              ...spec,
              available,
              url: plink,
            });
          }
        });

        // Color guess (title or any option text)
        let colorGuess = pickColorFrom(title);
        if (!colorGuess) {
          $("option").each((_, opt) => {
            const c = pickColorFrom($(opt).text());
            if (c && !colorGuess) colorGuess = c;
          });
        }
        colorGuess = colorGuess || "Natural";

        const colorEntry = ensureColor(material, colorGuess);
        if (variants.length === 0) {
          // fallback bare variant
          colorEntry.rings.push({ available, url: plink });
        } else {
          colorEntry.rings.push(...variants);
        }
        colorEntry.rings = dedupeRings(colorEntry.rings);
      } catch (e) {
        console.warn("[TRL] product fail:", plink, e);
      }
    })
  );

  await Promise.all(tasks);
  return sup;
}

// -------- MetalDesignz --------
// They have a custom storefront; we’ll look for product cards and parse pages similarly.
async function scrapeMetalDesignz(): Promise<SupplierResult> {
  const sup: SupplierResult = { supplier: "MetalDesignz", materials: [] };
  const limit = pLimit(CONCURRENCY);

  const discoverPages = new Set<string>(SITES.MetalDesignz.roots);

  // Discover more catalog/collection pages from the homepage
  try {
    const homeHTML = await fetchHTML("https://www.metaldesignz.com/");
    const $ = cheerio.load(homeHTML);
    $("a[href]").each((_, a) => {
      const href = $(a).attr("href");
      if (!href) return;
      if (/shop|ring|rings|collection|category/i.test(href)) {
        const full = href.startsWith("http") ? href : `https://www.metaldesignz.com${href}`;
        discoverPages.add(full.split("?")[0]);
      }
    });
  } catch (e) {
    console.warn("[MetalDesignz] homepage discovery failed", e);
  }

  const productLinks = new Set<string>();
  for (const url of discoverPages) {
    try {
      const html = await fetchHTML(url);
      const $ = cheerio.load(html);
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        if (/product/i.test(href) || /rings\/\d+/i.test(href)) {
          const full = href.startsWith("http") ? href : `https://www.metaldesignz.com${href}`;
          productLinks.add(full.split("?")[0]);
        }
      });
    } catch (e) {
      // benign
    }
  }

  const tasks = Array.from(productLinks).map((plink) =>
    limit(async () => {
      try {
        const html = await fetchHTML(plink);
        const $ = cheerio.load(html);

        const title = ($("h1").first().text() || $("title").text() || "").trim();

        // material guess from breadcrumbs or title
        let materialGuess =
          $(".breadcrumb a, nav.breadcrumbs a")
            .toArray()
            .map((a) => $(a).text().trim())
            .find((t) => /anodized|bright|aluminum|stainless|steel|niobium|titanium|copper|brass|bronze/i.test(t)) ||
          (title.match(/(anodized aluminum|bright aluminum|stainless steel|niobium|titanium|copper|brass|bronze)/i)?.[1] ?? "Rings");

        materialGuess = materialGuess.replace(/rings?/i, "").trim() || "Rings";
        if (/bright aluminum/i.test(materialGuess)) materialGuess = "Bright Aluminum";
        if (/anodized/i.test(materialGuess) && !/aluminum/i.test(materialGuess)) materialGuess = "Anodized Aluminum";

        const material = ensureMaterial(sup, materialGuess);

        const allText =
          $("body").text() + " " + $("table").text() + " " + $(".product, .product-details").text();

        const available = !/out\s*of\s*stock|sold\s*out/i.test(allText);

        // color guess
        let colorGuess = pickColorFrom(title);
        if (!colorGuess) {
          $("option, .swatch, [class*=color]").each((_, el) => {
            const t = $(el).text().trim();
            const c = pickColorFrom(t);
            if (c && !colorGuess) colorGuess = c;
          });
        }
        colorGuess = colorGuess || "Natural";

        const colorEntry = ensureColor(material, colorGuess);

        const variants: RingVariant[] = [];

        // scan tables/lines for specs
        $("table").each((_, tbl) => {
          const t = $(tbl).text();
          const lines = t.split(/[\r\n]+/).map((x) => x.trim()).filter(Boolean);
          for (const line of lines) {
            const spec = extractSpecs(line);
            if (spec.wireGauge || spec.wireDiameter || spec.ringID || spec.aspectRatio) {
              variants.push({
                ...spec,
                available,
                url: plink,
              });
            }
          }
        });

        $("option").each((_, opt) => {
          const txt = $(opt).text().trim();
          const spec = extractSpecs(txt);
          if (spec.wireGauge || spec.wireDiameter || spec.ringID || spec.aspectRatio) {
            variants.push({
              ...spec,
              available,
              url: plink,
            });
          }
        });

        if (variants.length === 0) {
          variants.push({ available, url: plink });
        }

        colorEntry.rings.push(...variants);
        colorEntry.rings = dedupeRings(colorEntry.rings);
      } catch (e) {
        console.warn("[MetalDesignz] product fail:", plink, e);
      }
    })
  );

  await Promise.all(tasks);
  return sup;
}

// -----------------------------------------------------------------------------
// Main handler
// -----------------------------------------------------------------------------

export const handler = async (event: any) => {
  try {
    // Allow cache bypass with ?fresh=1
    const forceFresh = event?.queryStringParameters?.fresh === "1";

    const cacheKey = hash("fetchSuppliers:v2");
    if (!forceFresh) {
      const cached = readCache(cacheKey);
      if (cached) {
        return {
          statusCode: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
          body: JSON.stringify(cached),
        };
      }
    }

    // Scrape in parallel (lightly)
    const [joe, trl, mdz] = await Promise.all([
      scrapeChainmailJoe(),
      scrapeTheRingLord(),
      scrapeMetalDesignz(),
    ]);

    // Clean up/normalize: dedupe colors/rings per material
    for (const sup of [joe, trl, mdz]) {
      for (const mat of sup.materials) {
        // merge duplicate color buckets with same name
        const byColor = new Map<string, ColorEntry>();
        for (const c of mat.colors) {
          const key = c.color.toLowerCase();
          if (!byColor.has(key)) {
            byColor.set(key, { color: c.color, rings: [] });
          }
          const bucket = byColor.get(key)!;
          bucket.rings.push(...c.rings);
        }
        mat.colors = Array.from(byColor.values()).map((c) => ({
          color: c.color,
          rings: dedupeRings(c.rings),
        }));
      }
      // sort materials for consistency
      sup.materials.sort((a, b) => a.name.localeCompare(b.name));
    }

    const out: Output = {
      cached: false,
      timestamp: Date.now(),
      suppliers: [joe, trl, mdz],
    };

    writeCache(cacheKey, out);

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
      body: JSON.stringify(out),
    };
  } catch (err: any) {
    console.error("fetchSuppliers error:", err?.stack || err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ok: false, error: String(err?.message || err) }),
    };
  }
};