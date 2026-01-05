// src/lib/colorCalibration.ts
// Lightweight localStorage-backed per-color calibration + optional named profiles.
// This module intentionally exports BOTH the simple API (applyCalibrationHex, load/save calibration)
// and the profile API used by RingRendererInstanced (loadProfiles, getActiveProfile, etc).

export type CalibrationEntry = {
  gain: [number, number, number]; // multiply after gamma
  gamma: [number, number, number]; // exponent applied to normalized channel
};

export type CalibrationTable = Record<string, CalibrationEntry>;

export type CalibrationProfile = {
  id: string;
  name: string;
  table: CalibrationTable;
  createdAt?: number;
  updatedAt?: number;
};

const LS_ACTIVE_TABLE_KEY = "chainmail.colorCalibration.active.v1";
const LS_PROFILES_KEY = "chainmail.colorCalibration.profiles.v1";
const LS_ACTIVE_PROFILE_ID_KEY = "chainmail.colorCalibration.activeProfileId.v1";

const UPDATED_EVENT = "chainmail.colorCalibration.updated";

/** Consumers can listen for this event to refresh render colors */
export function calibrationUpdatedEventName() {
  return UPDATED_EVENT;
}

function clamp01(x: number) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function hex2(n: number) {
  return n.toString(16).padStart(2, "0");
}

function parseHex(hex: string): { r: number; g: number; b: number; a: number; hasA: boolean } | null {
  const h = (hex || "").trim();

  // #rgb
  const m3 = /^#([0-9a-fA-F]{3})$/.exec(h);
  if (m3) {
    const r = parseInt(m3[1][0] + m3[1][0], 16);
    const g = parseInt(m3[1][1] + m3[1][1], 16);
    const b = parseInt(m3[1][2] + m3[1][2], 16);
    return { r, g, b, a: 255, hasA: false };
  }

  // #rrggbb
  const m6 = /^#([0-9a-fA-F]{6})$/.exec(h);
  if (m6) {
    const r = parseInt(m6[1].slice(0, 2), 16);
    const g = parseInt(m6[1].slice(2, 4), 16);
    const b = parseInt(m6[1].slice(4, 6), 16);
    return { r, g, b, a: 255, hasA: false };
  }

  // #rrggbbaa
  const m8 = /^#([0-9a-fA-F]{8})$/.exec(h);
  if (m8) {
    const r = parseInt(m8[1].slice(0, 2), 16);
    const g = parseInt(m8[1].slice(2, 4), 16);
    const b = parseInt(m8[1].slice(4, 6), 16);
    const a = parseInt(m8[1].slice(6, 8), 16);
    return { r, g, b, a, hasA: true };
  }

  return null;
}

function toHex(r: number, g: number, b: number, a?: number) {
  const rr = Math.max(0, Math.min(255, Math.round(r)));
  const gg = Math.max(0, Math.min(255, Math.round(g)));
  const bb = Math.max(0, Math.min(255, Math.round(b)));
  if (typeof a === "number") {
    const aa = Math.max(0, Math.min(255, Math.round(a)));
    return `#${hex2(rr)}${hex2(gg)}${hex2(bb)}${hex2(aa)}`;
  }
  return `#${hex2(rr)}${hex2(gg)}${hex2(bb)}`;
}

function normalizeHex6(hex: string): string {
  const p = parseHex(hex);
  if (!p) return "#ffffff";
  return toHex(p.r, p.g, p.b);
}

/**
 * Apply explicit gain/gamma to an input hex (utility expected by ColorCalibrationTest).
 * - Preserves alpha if provided (#rrggbbaa)
 * - Gain and gamma are per-channel arrays
 */
export function applyGainGammaToHex(
  inputHex: string,
  gain: [number, number, number] = [1, 1, 1],
  gamma: [number, number, number] = [1, 1, 1],
): string {
  const p = parseHex(inputHex);
  if (!p) return "#ffffff";

  const inR = p.r / 255;
  const inG = p.g / 255;
  const inB = p.b / 255;

  const [gr, gg, gb] = gain ?? [1, 1, 1];
  const [cr, cg, cb] = gamma ?? [1, 1, 1];

  // out = (in ^ gamma) * gain
  const outR = clamp01(Math.pow(clamp01(inR), cr) * gr);
  const outG = clamp01(Math.pow(clamp01(inG), cg) * gg);
  const outB = clamp01(Math.pow(clamp01(inB), cb) * gb);

  const rr = outR * 255;
  const gg2 = outG * 255;
  const bb = outB * 255;

  return p.hasA ? toHex(rr, gg2, bb, p.a) : toHex(rr, gg2, bb);
}

/** Load the legacy single active calibration table (if present). */
export function loadActiveCalibration(): CalibrationTable | null {
  // Prefer active profile table if set
  const prof = getActiveProfile();
  if (prof?.table) return prof.table;

  try {
    const raw = localStorage.getItem(LS_ACTIVE_TABLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as CalibrationTable;
  } catch {
    return null;
  }
}

/**
 * Save + broadcast update (legacy API).
 * If you’re using profiles, prefer saveProfiles()+setActiveProfile().
 */
export function saveAndApplyCalibration(table: CalibrationTable | null) {
  try {
    if (!table) localStorage.removeItem(LS_ACTIVE_TABLE_KEY);
    else localStorage.setItem(LS_ACTIVE_TABLE_KEY, JSON.stringify(table));
  } catch {
    // ignore storage failures
  }

  try {
    window.dispatchEvent(new Event(UPDATED_EVENT));
  } catch {
    // ignore
  }
}

/**
 * Clear active calibration selection (expected by ColorCalibrationTest).
 * - Removes legacy active table
 * - Clears active profile id
 * - Keeps saved profiles intact (no data loss)
 */
export function clearCalibration() {
  try {
    localStorage.removeItem(LS_ACTIVE_TABLE_KEY);
    localStorage.removeItem(LS_ACTIVE_PROFILE_ID_KEY);
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new Event(UPDATED_EVENT));
  } catch {
    // ignore
  }
}

/** Profile API (used by RingRendererInstanced.tsx) */
export function loadProfiles(): CalibrationProfile[] {
  try {
    const raw = localStorage.getItem(LS_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p === "object")
      .map((p: any) => ({
        id: String(p.id ?? ""),
        name: String(p.name ?? "Calibration"),
        table: (p.table && typeof p.table === "object" ? (p.table as CalibrationTable) : {}) as CalibrationTable,
        createdAt: typeof p.createdAt === "number" ? p.createdAt : undefined,
        updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : undefined,
      }))
      .filter((p) => !!p.id);
  } catch {
    return [];
  }
}

export function saveProfiles(profiles: CalibrationProfile[]) {
  try {
    localStorage.setItem(LS_PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new Event(UPDATED_EVENT));
  } catch {
    // ignore
  }
}

export function setActiveProfile(profileId: string | null) {
  try {
    if (!profileId) localStorage.removeItem(LS_ACTIVE_PROFILE_ID_KEY);
    else localStorage.setItem(LS_ACTIVE_PROFILE_ID_KEY, profileId);
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new Event(UPDATED_EVENT));
  } catch {
    // ignore
  }
}

export function getActiveProfile(): CalibrationProfile | null {
  try {
    const id = localStorage.getItem(LS_ACTIVE_PROFILE_ID_KEY);
    if (!id) return null;
    const profiles = loadProfiles();
    return profiles.find((p) => p.id === id) ?? null;
  } catch {
    return null;
  }
}

/**
 * Apply calibration to a hex color.
 * - Looks up by normalized #rrggbb key
 * - Preserves alpha if input is #rrggbbaa
 * - If no calibration exists, returns normalized #rrggbb (or preserves alpha if present)
 */
export function applyCalibrationHex(inputHex: string): string {
  const p = parseHex(inputHex);
  if (!p) return "#ffffff";

  const table = loadActiveCalibration();
  if (!table) {
    return p.hasA ? toHex(p.r, p.g, p.b, p.a) : toHex(p.r, p.g, p.b);
  }

  const key = normalizeHex6(toHex(p.r, p.g, p.b));
  const entry = table[key];
  if (!entry) {
    return p.hasA ? toHex(p.r, p.g, p.b, p.a) : key;
  }

  return applyGainGammaToHex(
    p.hasA ? toHex(p.r, p.g, p.b, p.a) : toHex(p.r, p.g, p.b),
    entry.gain ?? [1, 1, 1],
    entry.gamma ?? [1, 1, 1],
  );
}

/**
 * RingRendererInstanced helper.
 * Some render paths may call this for very large counts; we provide a fast cached wrapper.
 * Accepts an optional second arg (count) to be compatible with either call style.
 */
const correctedCache = new Map<string, string>();
export function getCorrectedHexForLargeCount(inputHex: string, _count?: number): string {
  const key = inputHex || "#ffffff";
  const hit = correctedCache.get(key);
  if (hit) return hit;
  const out = applyCalibrationHex(key);
  correctedCache.set(key, out);
  return out;
}