// netlify/functions/check-supplier-colors.ts
// Scrapes a user-supplied URL for color information (hex codes and named
// chainmail-relevant color words). Returns a deduplicated list of swatches
// so the Freeform "Check available colors" panel can show whatever's there
// — or surface a clean error if the page can't be read.
//
// CORS is the reason this lives server-side: a typical chainmail supplier
// site won't allow cross-origin fetches from chainmaildesigner.com, so a
// browser-side fetch would fail. The function loads the page server-side,
// pulls hex strings out, and ships them back as JSON.
//
// The matcher is intentionally simple — chainmail catalogs typically render
// each colored ring as a swatch with the color name nearby in alt/title
// text. We pull every #RRGGBB / #RGB occurrence in the HTML plus any
// adjacent text-node that looks like a color name; the merger keeps the
// first name we see for a given hex and discards bare hexes if no name was
// nearby. If nothing matches the user gets a clean "no colors detected"
// message; the front end keeps the user's default palette active.

export const handler = async (event: any) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, message: "Method not allowed" });
  }

  let url: string;
  try {
    const body = JSON.parse(event.body || "{}");
    url = String(body.url ?? "").trim();
  } catch {
    return jsonResponse(400, { ok: false, message: "Body must be JSON with a url field." });
  }
  if (!url) {
    return jsonResponse(400, { ok: false, message: "No URL provided." });
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return jsonResponse(400, { ok: false, message: "That URL is malformed." });
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return jsonResponse(400, { ok: false, message: "Only http(s) URLs are supported." });
  }
  // Defense: refuse to fetch internal / loopback hosts. The Netlify Lambda
  // runtime shouldn't be able to reach internal AWS endpoints either, but
  // an explicit check is cheap insurance.
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host.startsWith("169.254.")
  ) {
    return jsonResponse(400, { ok: false, message: "That host is not reachable from the server." });
  }

  let html: string;
  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(parsed.toString(), {
      method: "GET",
      headers: {
        // Identify ourselves so the supplier can block us if they want.
        "user-agent": "ChainmailStudio-color-check/1.0 (+https://chainmaildesigner.com)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return jsonResponse(200, {
        ok: false,
        message: `That site returned ${res.status}. Your default palette is unchanged.`,
      });
    }
    const ct = res.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/.test(ct)) {
      return jsonResponse(200, {
        ok: false,
        message: "That URL didn't serve an HTML page. Your default palette is unchanged.",
      });
    }
    // Cap the response we read to ~2 MB so a hostile page can't blow our
    // Lambda memory. 2 MB of HTML is far more than any color catalog page.
    const reader = res.body?.getReader();
    if (!reader) {
      html = await res.text();
    } else {
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          total += value.length;
          if (total > 2 * 1024 * 1024) {
            // Stop reading; we have plenty.
            try { await reader.cancel(); } catch { /* ignore */ }
            break;
          }
        }
      }
      html = new TextDecoder("utf-8").decode(concatChunks(chunks));
    }
  } catch (err: any) {
    return jsonResponse(200, {
      ok: false,
      message:
        err?.name === "AbortError"
          ? "That site took too long to respond. Your default palette is unchanged."
          : `Couldn't reach that site (${err?.message ?? "network error"}). Your default palette is unchanged.`,
    });
  }

  const swatches = extractSwatches(html);
  return jsonResponse(200, {
    ok: true,
    count: swatches.length,
    swatches,
  });
};

// The native app (origin capacitor:// or https://localhost) calls this
// cross-origin, and the POST+JSON request triggers a CORS preflight. "*" is safe:
// this only reads a public URL the user typed and returns colors.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      ...CORS,
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML scanning
// ─────────────────────────────────────────────────────────────────────────────

interface ScrapedSwatch {
  colorHex: string;            // #rrggbb (lowercase)
  colorName: string;           // best-effort label
  source?: "ring" | "scale" | "both";
}

// Hex code matcher — matches both #RRGGBB and #RGB (we expand the latter).
const HEX_RE = /#([0-9a-f]{3}|[0-9a-f]{6})\b/gi;

// Word-list of color names commonly used in chainmail supplier catalogs.
// We treat any short text near a hex code containing one of these as the
// candidate name for that swatch. Not exhaustive — best-effort.
const COLOR_NAME_WORDS = [
  "anodized", "bright", "matte", "satin", "polished", "brushed", "natural",
  "champagne", "rose", "rainbow", "pearl", "burnished",
  "aluminum", "aluminium", "stainless", "steel", "copper", "brass", "bronze",
  "sterling", "silver", "gold", "niobium", "titanium", "argentium",
  "red", "orange", "yellow", "green", "blue", "indigo", "violet", "purple",
  "pink", "magenta", "cyan", "teal", "turquoise", "lime", "olive", "navy",
  "black", "white", "gray", "grey", "charcoal",
  "rust", "burgundy", "maroon", "wine",
  "ring", "scale", "ringer",
];
const NAME_RE = new RegExp(`\\b(${COLOR_NAME_WORDS.join("|")})\\b`, "gi");

// ─── Color name → hex fallback ───────────────────────────────────────────────
// Supplier sites typically use product PHOTOS for color swatches, not inline
// hex codes — so HEX_RE alone returns nothing useful on homepages and most
// catalog pages. As a fallback, we scan the page text for color names and
// emit a swatch with a standard hex value when one matches. This is generic
// (no supplier specifics) and covers the colors that appear across nearly
// every chainmail supplier's anodized aluminum, niobium, and base-metal
// lines. Multiline regexes match either "Blue" or "Anodized Aluminum Blue"
// — the longest-name match wins for the swatch label.
const COLOR_NAME_HEX_TABLE: Array<{
  /** Regex against page text (case-insensitive). The longest-matching name
   *  takes the swatch label; the hex below is the canonical color value. */
  re: RegExp;
  hex: string;
  label: string;
  source?: "ring" | "scale" | "both";
}> = [
  // ── Anodized aluminum (the rainbow line every chainmail shop carries) ──
  { re: /\banodized\s+(?:aluminum\s+)?(?:jet\s+)?black\b/i,   hex: "#1a1a1a", label: "Anodized Black" },
  { re: /\banodized\s+(?:aluminum\s+)?(?:royal\s+|sky\s+)?blue\b/i, hex: "#1d4ed8", label: "Anodized Blue" },
  { re: /\banodized\s+(?:aluminum\s+)?(?:red|crimson)\b/i,    hex: "#dc2626", label: "Anodized Red" },
  { re: /\banodized\s+(?:aluminum\s+)?green\b/i,              hex: "#16a34a", label: "Anodized Green" },
  { re: /\banodized\s+(?:aluminum\s+)?(?:yellow|gold)\b/i,    hex: "#facc15", label: "Anodized Gold" },
  { re: /\banodized\s+(?:aluminum\s+)?(?:purple|violet)\b/i,  hex: "#7c3aed", label: "Anodized Purple" },
  { re: /\banodized\s+(?:aluminum\s+)?(?:pink|magenta)\b/i,   hex: "#ec4899", label: "Anodized Pink" },
  { re: /\banodized\s+(?:aluminum\s+)?orange\b/i,             hex: "#f97316", label: "Anodized Orange" },
  { re: /\banodized\s+(?:aluminum\s+)?(?:turquoise|teal|cyan)\b/i, hex: "#0ea5e9", label: "Anodized Turquoise" },
  { re: /\banodized\s+(?:aluminum\s+)?lime\b/i,               hex: "#84cc16", label: "Anodized Lime" },
  { re: /\banodized\s+(?:aluminum\s+)?bronze\b/i,             hex: "#a16207", label: "Anodized Bronze" },
  { re: /\banodized\s+(?:aluminum\s+)?champagne\b/i,          hex: "#e5d4a8", label: "Anodized Champagne" },
  { re: /\banodized\s+(?:aluminum\s+)?(?:burnt\s+)?(?:rust|burgundy)\b/i, hex: "#a52a2a", label: "Anodized Burgundy" },
  { re: /\banodized\s+(?:aluminum\s+)?rainbow\b/i,            hex: "#8b5cf6", label: "Anodized Rainbow" },

  // ── Bare metal materials ─────────────────────────────────────────────
  { re: /\bbright\s+aluminum\b/i,                             hex: "#c0c0c0", label: "Bright Aluminum" },
  { re: /\bmatte\s+aluminum\b/i,                              hex: "#a8a8a8", label: "Matte Aluminum" },
  { re: /\b(?:bare|raw)\s+aluminum\b/i,                       hex: "#b8b8b8", label: "Bare Aluminum" },
  { re: /\bstainless(?:\s+steel)?\b/i,                        hex: "#9aa0a6", label: "Stainless Steel" },
  { re: /\bsterling(?:\s+silver)?\b/i,                        hex: "#c9c9c9", label: "Sterling Silver" },
  { re: /\bargentium\b/i,                                     hex: "#d3d3d3", label: "Argentium" },
  { re: /\bcopper\b/i,                                        hex: "#b87333", label: "Copper" },
  { re: /\bbrass\b/i,                                         hex: "#d4af37", label: "Brass" },
  { re: /\bbronze\b/i,                                        hex: "#cd7f32", label: "Bronze" },
  { re: /\bniobium\s+(?:blue)\b/i,                            hex: "#3b82f6", label: "Niobium Blue" },
  { re: /\bniobium\s+(?:purple|violet)\b/i,                   hex: "#a855f7", label: "Niobium Purple" },
  { re: /\bniobium\s+(?:green|teal)\b/i,                      hex: "#10b981", label: "Niobium Green" },
  { re: /\bniobium\s+(?:gold|yellow)\b/i,                     hex: "#eab308", label: "Niobium Gold" },
  { re: /\bniobium\b/i,                                       hex: "#6b7280", label: "Niobium" },
  { re: /\btitanium\b/i,                                      hex: "#878787", label: "Titanium" },
  { re: /\bgold[-\s]?filled\b/i,                              hex: "#d4af37", label: "Gold Filled" },
];

// Bare color names — used ONLY when the page is clearly an anodized line
// (most supplier catalogs list colors as plain variant names like "Blue" /
// "Red" in dropdowns, not as "Anodized Blue"). Gated on the page mentioning
// "anodized" so we don't pick up random marketing copy. Mirrors the anodized
// hexes above.
const BARE_ANODIZED_COLORS: Array<{ re: RegExp; hex: string; label: string }> = [
  { re: /\bblack\b/i,                          hex: "#1a1a1a", label: "Anodized Black" },
  { re: /\b(?:royal\s+|sky\s+|ice\s+)?blue\b/i, hex: "#1d4ed8", label: "Anodized Blue" },
  { re: /\b(?:red|crimson|scarlet)\b/i,        hex: "#dc2626", label: "Anodized Red" },
  { re: /\b(?:green|emerald)\b/i,              hex: "#16a34a", label: "Anodized Green" },
  { re: /\b(?:gold|yellow)\b/i,                hex: "#facc15", label: "Anodized Gold" },
  { re: /\b(?:purple|violet)\b/i,              hex: "#7c3aed", label: "Anodized Purple" },
  { re: /\b(?:pink|magenta|fuchsia)\b/i,       hex: "#ec4899", label: "Anodized Pink" },
  { re: /\borange\b/i,                         hex: "#f97316", label: "Anodized Orange" },
  { re: /\b(?:turquoise|teal|aqua|cyan)\b/i,   hex: "#0ea5e9", label: "Anodized Turquoise" },
  { re: /\blime\b/i,                           hex: "#84cc16", label: "Anodized Lime" },
  { re: /\bchampagne\b/i,                      hex: "#e5d4a8", label: "Anodized Champagne" },
  { re: /\b(?:burgundy|wine|maroon)\b/i,       hex: "#7f1d1d", label: "Anodized Burgundy" },
  { re: /\bseafoam\b/i,                        hex: "#5eead4", label: "Anodized Seafoam" },
  { re: /\bbrown\b/i,                          hex: "#92400e", label: "Anodized Brown" },
  { re: /\bgun\s?metal\b/i,                    hex: "#2a2e35", label: "Gunmetal" },
];

function findColorWords(text: string): Array<{ hex: string; label: string; source?: "ring"|"scale"|"both"; nearText?: string }> {
  const hits: Array<{ hex: string; label: string; source?: "ring"|"scale"|"both"; nearText?: string }> = [];
  const seen = new Set<string>();
  for (const entry of COLOR_NAME_HEX_TABLE) {
    const re = new RegExp(entry.re.source, "gi"); // fresh regex w/ global flag for exec loop
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (seen.has(entry.hex)) break;
      seen.add(entry.hex);
      const start = Math.max(0, m.index - 80);
      const end = Math.min(text.length, m.index + 80);
      const near = text.slice(start, end).replace(/\s+/g, " ");
      hits.push({
        hex: entry.hex,
        label: entry.label,
        source: entry.source ?? detectItemType(near),
        nearText: near,
      });
      break; // first hit per entry is enough
    }
  }
  return hits;
}

function expandShortHex(h: string): string {
  // #abc → #aabbcc
  if (h.length === 4) {
    return ("#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]).toLowerCase();
  }
  return h.toLowerCase();
}

function isProbablyChromeShade(hex: string): boolean {
  // Pages have endless framework greys (#fff, #000, #f3f4f6, #e5e7eb…).
  // We filter pure-white/black/near-neutral-grey because they're almost
  // never an interesting product color.
  const v = hex.slice(1);
  if (v === "ffffff" || v === "000000") return true;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  // Greys with saturation < 5% and high lightness — probably chrome.
  if (sat < 0.05 && max > 200) return true;
  return false;
}

function detectItemType(context: string): "ring" | "scale" | "both" | undefined {
  const hasRing = /ring/i.test(context);
  const hasScale = /scale/i.test(context);
  if (hasRing && hasScale) return "both";
  if (hasRing) return "ring";
  if (hasScale) return "scale";
  return undefined;
}

function extractSwatches(html: string): ScrapedSwatch[] {
  // Strip script/style nodes — they're full of CSS color noise.
  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Plain-text view used for color-name detection (alt text, title attrs,
  // visible copy). Lets us catch supplier sites that show colors as product
  // photos instead of inline hex codes (most of them).
  const textOnly = cleaned.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // Find every hex code and grab the surrounding ~120 chars for naming.
  const found = new Map<string, ScrapedSwatch>();
  let m: RegExpExecArray | null;
  HEX_RE.lastIndex = 0;
  while ((m = HEX_RE.exec(cleaned)) !== null) {
    const hex = expandShortHex(m[0]);
    if (isProbablyChromeShade(hex)) continue;

    const start = Math.max(0, m.index - 120);
    const end = Math.min(cleaned.length, m.index + 120);
    const context = cleaned.slice(start, end).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    let name = "";
    NAME_RE.lastIndex = 0;
    const words: string[] = [];
    let nm: RegExpExecArray | null;
    while ((nm = NAME_RE.exec(context)) !== null) {
      const w = nm[1];
      if (!words.find((x) => x.toLowerCase() === w.toLowerCase())) {
        words.push(w);
      }
      if (words.length >= 3) break;
    }
    if (words.length) {
      name = titleCase(words.join(" "));
    }

    const itemType = detectItemType(context);
    const existing = found.get(hex);
    if (!existing) {
      found.set(hex, {
        colorHex: hex,
        colorName: name || "Unnamed",
        source: itemType,
      });
    } else {
      if (!existing.colorName || existing.colorName === "Unnamed") {
        if (name) existing.colorName = name;
      }
      if (itemType && existing.source !== "both") {
        if (!existing.source) existing.source = itemType;
        else if (existing.source !== itemType) existing.source = "both";
      }
    }
    if (found.size > 80) break; // sanity cap
  }

  // Discard hexes with NO color-related name nearby AND no ring/scale
  // context — they're probably just framework brand colors leaked from
  // somewhere generic.
  const final: ScrapedSwatch[] = [];
  for (const s of found.values()) {
    if (s.colorName === "Unnamed" && !s.source) continue;
    final.push(s);
  }

  // Name-based fallback: scan the page text for color names (e.g.
  // "Anodized Aluminum Blue", "Bright Aluminum", "Copper") and emit a
  // swatch with a standard hex value for each match. This is what makes
  // searching supplier homepages and category pages useful — most of
  // them never expose color hexes in the HTML, only product photos.
  const nameHits = findColorWords(textOnly);
  const existingHexes = new Set(final.map((s) => s.colorHex.toLowerCase()));
  for (const hit of nameHits) {
    if (existingHexes.has(hit.hex.toLowerCase())) continue;
    existingHexes.add(hit.hex.toLowerCase());
    final.push({
      colorHex: hit.hex,
      colorName: hit.label,
      source: hit.source,
    });
  }

  // Bare-color fallback for anodized catalogs: when the page sells anodized
  // rings but lists colors as plain variant names ("Blue", "Red", …), the
  // strict "Anodized <color>" regexes above miss them. Pick those up here.
  if (/\banodized\b/i.test(textOnly)) {
    for (const c of BARE_ANODIZED_COLORS) {
      if (existingHexes.has(c.hex.toLowerCase())) continue;
      if (c.re.test(textOnly)) {
        existingHexes.add(c.hex.toLowerCase());
        final.push({ colorHex: c.hex, colorName: c.label, source: "ring" });
      }
    }
  }

  return final;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
