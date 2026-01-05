// src/utils/colorCalibration.ts
// Compatibility layer:
// - Re-exports the new lib API
// - Adds the older Gain/Gamma helpers used by ColorCalibrationTest.tsx

import type { CalibrationTable, CalibrationProfile } from "../lib/colorCalibration";
import {
  applyCalibrationHex,
  calibrationUpdatedEventName,
  getActiveProfile as libGetActiveProfile,
  getCorrectedHexForLargeCount as libGetCorrectedHexForLargeCount,
  loadActiveCalibration as loadActiveCalibrationTable,
  loadProfiles,
  saveAndApplyCalibration as saveAndApplyCalibrationTable,
  saveProfiles,
  setActiveProfile,
} from "../lib/colorCalibration";

// --------- Re-exports (stable API surface) ----------
export {
  applyCalibrationHex,
  calibrationUpdatedEventName,
  loadProfiles,
  saveProfiles,
  setActiveProfile,
};
export type ColorCalibrationProfile = CalibrationProfile;


// --------- Compatibility wrappers (older call signatures) ----------

/**
 * Some older code passes `getActiveProfile(loadProfiles())`.
 * The new lib API may not require any args, so we accept (and ignore) the optional parameter.
 */
export function getActiveProfile(_profiles?: unknown): ColorCalibrationProfile | null {
  try {
    return (libGetActiveProfile as any)();
  } catch {
    return null;
  }
}

/**
 * Older renderers called:
 *   getCorrectedHexForLargeCount(hex, count, threshold, profile)
 * The new lib API typically only needs (hex, count?) and reads profile/threshold internally.
 */
export function getCorrectedHexForLargeCount(
  hex: string,
  count?: number,
  _threshold?: number,
  _profile?: ColorCalibrationProfile | null,
): string {
  try {
    return (libGetCorrectedHexForLargeCount as any)(hex, count);
  } catch {
    // safe fallback: still apply basic calibration if available
    try {
      return applyCalibrationHex(hex);
    } catch {
      return hex;
    }
  }
}

// --------- Legacy (ColorCalibrationTest) types ----------
export type GainGammaEntry = { hex: string; gain: number; gamma: number };
export type GainGammaPayload = { entries: GainGammaEntry[] };

// --------- small helpers ----------
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

  const m3 = /^#([0-9a-fA-F]{3})$/.exec(h);
  if (m3) {
    const r = parseInt(m3[1][0] + m3[1][0], 16);
    const g = parseInt(m3[1][1] + m3[1][1], 16);
    const b = parseInt(m3[1][2] + m3[1][2], 16);
    return { r, g, b, a: 255, hasA: false };
  }

  const m6 = /^#([0-9a-fA-F]{6})$/.exec(h);
  if (m6) {
    const r = parseInt(m6[1].slice(0, 2), 16);
    const g = parseInt(m6[1].slice(2, 4), 16);
    const b = parseInt(m6[1].slice(4, 6), 16);
    return { r, g, b, a: 255, hasA: false };
  }

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

// --------- Legacy API that ColorCalibrationTest expects ----------

/**
 * Apply a uniform gain/gamma to a hex color.
 * out = (in ^ gamma) * gain  (per channel)
 * Preserves alpha if input is #rrggbbaa
 */
export function applyGainGammaToHex(inputHex: string, gain: number, gamma: number): string {
  const p = parseHex(inputHex);
  if (!p) return "#ffffff";

  const inR = p.r / 255;
  const inG = p.g / 255;
  const inB = p.b / 255;

  const outR = clamp01(Math.pow(clamp01(inR), gamma) * gain) * 255;
  const outG = clamp01(Math.pow(clamp01(inG), gamma) * gain) * 255;
  const outB = clamp01(Math.pow(clamp01(inB), gamma) * gain) * 255;

  return p.hasA ? toHex(outR, outG, outB, p.a) : toHex(outR, outG, outB);
}

function tableFromEntries(entries: GainGammaEntry[]): CalibrationTable {
  const t: CalibrationTable = {};
  for (const e of entries) {
    const hex = normalizeHex6(e.hex);
    const g = Number.isFinite(e.gain) ? e.gain : 1;
    const ga = Number.isFinite(e.gamma) ? e.gamma : 1;
    // lib expects per-channel tuples
    t[hex] = { gain: [g, g, g], gamma: [ga, ga, ga] };
  }
  return t;
}

function entriesFromTable(table: CalibrationTable): GainGammaEntry[] {
  return Object.entries(table).map(([hex, entry]) => {
    const gAny: any = (entry as any)?.gain;
    const gaAny: any = (entry as any)?.gamma;

    // handle both tuple + legacy scalar safely
    const gain = Array.isArray(gAny) ? Number(gAny[0] ?? 1) : Number(gAny ?? 1);
    const gamma = Array.isArray(gaAny) ? Number(gaAny[0] ?? 1) : Number(gaAny ?? 1);

    return { hex: normalizeHex6(hex), gain, gamma };
  });
}

/**
 * Legacy save: accepts:
 *  - GainGammaEntry[]
 *  - { entries: GainGammaEntry[] }
 *  - CalibrationTable
 */
export function saveAndApplyCalibration(
  input: GainGammaEntry[] | GainGammaPayload | CalibrationTable | null,
  _alsoApply?: boolean,
) {
  if (!input) {
    saveAndApplyCalibrationTable(null);
    return;
  }

  if (Array.isArray(input)) {
    saveAndApplyCalibrationTable(tableFromEntries(input));
    return;
  }

  if ((input as any)?.entries && Array.isArray((input as any).entries)) {
    saveAndApplyCalibrationTable(tableFromEntries((input as any).entries));
    return;
  }

  // assume it's already a table; coerce scalar gain/gamma to tuples to avoid “not iterable” errors
  const raw = input as any;
  const out: CalibrationTable = {};
  for (const [hex, entry] of Object.entries(raw)) {
    const g = (entry as any)?.gain;
    const ga = (entry as any)?.gamma;

    const gainTuple: [number, number, number] = Array.isArray(g)
      ? [Number(g[0] ?? 1), Number(g[1] ?? 1), Number(g[2] ?? 1)]
      : [Number(g ?? 1), Number(g ?? 1), Number(g ?? 1)];

    const gammaTuple: [number, number, number] = Array.isArray(ga)
      ? [Number(ga[0] ?? 1), Number(ga[1] ?? 1), Number(ga[2] ?? 1)]
      : [Number(ga ?? 1), Number(ga ?? 1), Number(ga ?? 1)];

    out[normalizeHex6(hex)] = { gain: gainTuple, gamma: gammaTuple };
  }

  saveAndApplyCalibrationTable(out);
}

/**
 * Legacy load: returns { entries: [...] } for ColorCalibrationTest
 */
export function loadActiveCalibration(): GainGammaPayload | null {
  const table = loadActiveCalibrationTable();
  if (!table) return null;
  return { entries: entriesFromTable(table) };
}

/**
 * Legacy clear used by the test UI
 */
export function clearCalibration() {
  try {
    localStorage.removeItem("chainmail.colorCalibration.active.v1");
    localStorage.removeItem("chainmail.colorCalibration.profiles.v1");
    localStorage.removeItem("chainmail.colorCalibration.activeProfileId.v1");
  } catch {}

  try {
    window.dispatchEvent(new Event(calibrationUpdatedEventName()));
  } catch {}
}
