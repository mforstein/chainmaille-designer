// =====================================
// File: src/types.ts
// =====================================
export type SupplierId = "cmj" | "trl" | "mdz";
export type Unit = "mm" | "in";

export type ColorMode = "solid" | "checker";

export interface Params {
  rows: number;
  cols: number;
  innerDiameter: number; // mm
  wireDiameter: number;  // mm
  overlapX: number;      // 0..1 visual overlap scalar
  overlapY: number;      // 0..1 visual overlap scalar
  colorMode: ColorMode;
  ringColor: string;     // default ring metal color hex
  altColor: string;      // "checker" alt color
  bgColor: string;       // background grid color
  supplier: SupplierId;
  ringSpec: string;      // friendly label
  unit: Unit;
}

export interface PaletteEntry {
  hex: string;
  name?: string;
}
export interface RingSpec {
  id: string;
  label: string; // e.g. "1/4\" 16swg AR≈4.0"
  innerDiameterMM: number;
  wireDiameterMM: number;
  material?: "aluminum" | "steel" | "titanium" | "copper" | "brass" | "other";
  density_g_cm3?: number; // override density by material
}
export interface Supplier {
  id: SupplierId;
  name: string;
  palettes: PaletteEntry[];
  ringSpecs: RingSpec[];
}

export type PaintMap = Map<string, string | null>;

export const keyAt = (r: number, c: number) => `${r},${c}`;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const mmToIn = (mm: number) => mm / 25.4;
export const inToMm = (inch: number) => inch * 25.4;
