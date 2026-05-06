// src/lib/supplierColors.ts
// Bridge between the fetchSuppliers Netlify function and the app's color palettes.
// Stores fetched data in localStorage; safe to call from any component.

const COLOR_NAME_TO_HEX: Record<string, string> = {
  "black":        "#1a1a1a",
  "blue":         "#2563eb",
  "cobalt":       "#1d4ed8",
  "navy":         "#1e3a5f",
  "royal blue":   "#1d4ed8",
  "sky blue":     "#38bdf8",
  "ice blue":     "#bae6fd",
  "green":        "#16a34a",
  "lime":         "#84cc16",
  "olive":        "#65a30d",
  "red":          "#dc2626",
  "crimson":      "#9f1239",
  "burgundy":     "#7f1d1d",
  "purple":       "#7c3aed",
  "violet":       "#8b5cf6",
  "lavender":     "#c4b5fd",
  "pink":         "#ec4899",
  "hot pink":     "#f9a8d4",
  "magenta":      "#d946ef",
  "fuchsia":      "#d946ef",
  "gold":         "#d97706",
  "yellow gold":  "#ca8a04",
  "yellow":       "#eab308",
  "orange":       "#f97316",
  "teal":         "#0d9488",
  "turquoise":    "#06b6d4",
  "aqua":         "#22d3ee",
  "silver":       "#9ca3af",
  "bronze":       "#b45309",
  "brown":        "#92400e",
  "copper":       "#b87333",
  "rainbow":      "#e040fb",
  "natural":      "#d4d4d4",
  "bright":       "#e5e7eb",
  "matte":        "#6b7280",
  "gunmetal":     "#374151",
  "dark":         "#374151",
  "champagne":    "#e8d5b7",
  "rose gold":    "#e8b4b8",
  "rose":         "#fb7185",
  "ice":          "#bfdbfe",
  "jet":          "#111827",
  "clear":        "#f3f4f6",
  "white":        "#f3f4f6",
  "grey":         "#6b7280",
  "gray":         "#6b7280",
  "brass":        "#d4a017",
  "niobium":      "#8b5cf6",
  "titanium":     "#94a3b8",
  "stainless":    "#cbd5e1",
  "aluminum":     "#d1d5db",
  "steel":        "#94a3b8",
  "galvanized":   "#9ca3af",
  "enameled":     "#f472b6",
  "rubber":       "#374151",
  "carbon":       "#1f2937",
  "nickel":       "#e2e8f0",
  "plated":       "#fcd34d",
};

const STORAGE_KEY = "supplierColors.v2";
const CACHE_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface SupplierColor {
  name: string;
  hex: string;
  material: string;
}

export interface SupplierColorData {
  timestamp: number;
  /** Per-supplier flat color list */
  bySupplier: Record<string, SupplierColor[]>;
  /** Colors specifically found on scale product pages */
  scaleColors: { name: string; hex: string; supplier: string }[];
}

export function colorNameToHex(name: string): string {
  const lower = (name || "").toLowerCase().trim();
  // exact match first
  if (COLOR_NAME_TO_HEX[lower]) return COLOR_NAME_TO_HEX[lower];
  // partial match
  for (const [key, hex] of Object.entries(COLOR_NAME_TO_HEX)) {
    if (lower.includes(key) || key.includes(lower)) return hex;
  }
  return "#6b7280";
}

export function getCachedSupplierColors(): SupplierColorData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: SupplierColorData = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Returns hex color list for a specific supplier, or all suppliers merged. */
export function getSupplierColorHexList(supplier?: string): string[] {
  const cached = getCachedSupplierColors();
  if (!cached) return [];
  const source = supplier
    ? (cached.bySupplier[supplier] || [])
    : Object.values(cached.bySupplier).flat();
  return [...new Set(source.map((c) => c.hex))];
}

/** Returns scale-specific hex colors, or all if no scale data available. */
export function getScaleColorHexList(): string[] {
  const cached = getCachedSupplierColors();
  if (!cached || !cached.scaleColors.length) return getSupplierColorHexList();
  return [...new Set(cached.scaleColors.map((c) => c.hex))];
}

function getFunctionBase(): string {
  try {
    const o = window.location.origin;
    if (o.startsWith("capacitor://") || o.includes("localhost")) {
      return "https://chainmaildesigner.com";
    }
  } catch {}
  return "";
}

/** Calls the Netlify fetchSuppliers function and caches the result. */
export async function refreshSupplierColors(forceFresh = false): Promise<SupplierColorData> {
  const url = `${getFunctionBase()}/.netlify/functions/fetchSuppliers${forceFresh ? "?fresh=1" : ""}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`Supplier fetch failed: HTTP ${res.status}`);
  const raw = await res.json();

  const bySupplier: SupplierColorData["bySupplier"] = {};
  const scaleColors: SupplierColorData["scaleColors"] = [];

  for (const sup of (raw.suppliers ?? [])) {
    const colors: SupplierColor[] = [];
    for (const mat of (sup.materials ?? [])) {
      const isScale = /scale/i.test(mat.name);
      for (const colorEntry of (mat.colors ?? [])) {
        const name: string = colorEntry.color || "Natural";
        const hex = colorNameToHex(name);
        if (!colors.find((c) => c.hex === hex)) {
          colors.push({ name, hex, material: mat.name });
        }
        if (isScale || (colorEntry.rings ?? []).some((r: any) => /scale/i.test(r.url || ""))) {
          if (!scaleColors.find((s) => s.hex === hex && s.supplier === sup.supplier)) {
            scaleColors.push({ name, hex, supplier: sup.supplier });
          }
        }
      }
    }
    bySupplier[sup.supplier] = colors;
  }

  const data: SupplierColorData = { timestamp: Date.now(), bySupplier, scaleColors };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  return data;
}
