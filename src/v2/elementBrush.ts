// ============================================================================
// src/v2/elementBrush.ts  —  VERSION TWO DEVELOPMENT (isolated; not on main)
// ----------------------------------------------------------------------------
// Per-element shape & size as BRUSH ATTRIBUTES.
//
// Today a Freeform design carries ONE global ring size and ONE global scale
// shape/size; every placed element re-renders from `activeScaleSettings` /
// `safeParams`. V2 makes shape and size behave exactly like color already does:
// part of the brush, stamped per cell, remembered per element. That single
// change unlocks "multiple ring sizes and scale shapes in one piece" AND makes
// same-lattice weave variants feel seamless.
//
// This module is pure data + helpers (no React, no DOM) so it can be unit-tested
// and adopted incrementally by FreeformChainmail2D.tsx. See docs/v2-development.md
// for the exact integration points.
// ============================================================================

import type { BuiltinScaleShape } from "../lib/customScaleShapes";

// ───────────────────────── Ring sizes ──────────────────────────────────────
export interface RingSize {
  id: string; // stable key persisted in saves
  label: string; // human label for the picker / BOM
  innerDiameterMm: number; // ID
  wireDiameterMm: number; // wire thickness
}

// Starter palette of AR-sane European-4-in-1 combinations. Extend freely; the
// IDs are what get persisted, so don't renumber existing ones.
export const RING_SIZES: RingSize[] = [
  { id: "r-18-4.8", label: "18 SWG · 4.8 mm ID", innerDiameterMm: 4.76, wireDiameterMm: 1.2 },
  { id: "r-16-6.0", label: "16 SWG · 6.0 mm ID", innerDiameterMm: 6.0, wireDiameterMm: 1.6 },
  { id: "r-16-6.4", label: "16 SWG · 6.4 mm ID", innerDiameterMm: 6.35, wireDiameterMm: 1.6 },
  { id: "r-14-8.0", label: "14 SWG · 8.0 mm ID", innerDiameterMm: 8.0, wireDiameterMm: 2.0 },
];

export const DEFAULT_RING_SIZE_ID = "r-16-6.4";

export function ringSizeById(id: string | undefined | null): RingSize | undefined {
  return id ? RING_SIZES.find((s) => s.id === id) : undefined;
}

// ───────────────────────── Scale sizes ─────────────────────────────────────
export interface ScaleSize {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  holeIdMm: number;
  dropMm: number;
}

// "Standard" matches today's Tuner/Freeform defaults exactly, so an existing
// design that adopts this size id renders pixel-identically.
export const SCALE_SIZES: ScaleSize[] = [
  { id: "s-small", label: "Small", widthMm: 9.0, heightMm: 17.0, holeIdMm: 4.76, dropMm: 8.0 },
  { id: "s-std", label: "Standard", widthMm: 12.5, heightMm: 23.5, holeIdMm: 6.35, dropMm: 11.0 },
  { id: "s-large", label: "Large", widthMm: 16.0, heightMm: 30.0, holeIdMm: 7.94, dropMm: 14.0 },
];

export const DEFAULT_SCALE_SIZE_ID = "s-std";

export function scaleSizeById(id: string | undefined | null): ScaleSize | undefined {
  return id ? SCALE_SIZES.find((s) => s.id === id) : undefined;
}

// A scale shape is a builtin name or a "custom:<uuid>" id — same domain as the
// existing `ScaleShape` type in FreeformChainmail2D, kept compatible on purpose.
export type ScaleShapeId = BuiltinScaleShape | (string & {});

// ───────────────────────── The active brush ────────────────────────────────
// Mirrors how `activeColor` works today, plus shape/size. The UI sets these;
// painting stamps them onto each touched cell (see RingCellMeta / ScaleCellMeta).
export interface ElementBrush {
  colorHex: string;
  ringSizeId: string;
  scaleSizeId: string;
  scaleShapeId: ScaleShapeId;
}

export const DEFAULT_BRUSH: ElementBrush = {
  colorHex: "#4dd0e1",
  ringSizeId: DEFAULT_RING_SIZE_ID,
  scaleSizeId: DEFAULT_SCALE_SIZE_ID,
  scaleShapeId: "leaf",
};

// ───────────────────── Per-cell metadata (overrides only) ───────────────────
// Stored in maps PARALLEL to the existing color maps, keyed by the same cell key
// ("row,col" for scales, "row-col" for rings). A field being ABSENT means "use
// the design's global default", so:
//   • old saves (no meta map) behave exactly like today, and
//   • cells painted before V2 keep rendering from the global settings.
// We only persist a cell's meta when it differs from the active default, keeping
// the payload small and migrations free.
export interface RingCellMeta {
  sizeId?: string;
}
export interface ScaleCellMeta {
  sizeId?: string;
  shapeId?: ScaleShapeId;
}

export type RingMetaMap = Map<string, RingCellMeta>;
export type ScaleMetaMap = Map<string, ScaleCellMeta>;

// ───────────────────── Resolvers: per-cell → else global ────────────────────
export function resolveRingSize(meta: RingCellMeta | undefined, fallback: RingSize): RingSize {
  return ringSizeById(meta?.sizeId) ?? fallback;
}
export function resolveScaleSize(meta: ScaleCellMeta | undefined, fallback: ScaleSize): ScaleSize {
  return scaleSizeById(meta?.sizeId) ?? fallback;
}
export function resolveScaleShape(
  meta: ScaleCellMeta | undefined,
  fallback: ScaleShapeId,
): ScaleShapeId {
  return meta?.shapeId ?? fallback;
}

// Build the meta a paint stroke should store for a cell. Returns `undefined`
// when the brush matches the design defaults, so callers can `delete` the key
// instead of storing a redundant override (keeps maps sparse).
export function ringMetaForBrush(
  brush: ElementBrush,
  defaultRingSizeId: string,
): RingCellMeta | undefined {
  return brush.ringSizeId === defaultRingSizeId ? undefined : { sizeId: brush.ringSizeId };
}
export function scaleMetaForBrush(
  brush: ElementBrush,
  defaultScaleSizeId: string,
  defaultScaleShapeId: ScaleShapeId,
): ScaleCellMeta | undefined {
  const meta: ScaleCellMeta = {};
  if (brush.scaleSizeId !== defaultScaleSizeId) meta.sizeId = brush.scaleSizeId;
  if (brush.scaleShapeId !== defaultScaleShapeId) meta.shapeId = brush.scaleShapeId;
  return meta.sizeId === undefined && meta.shapeId === undefined ? undefined : meta;
}

// ───────────────────── BOM bucketing for mixed designs ──────────────────────
// Extends today's color-only counting (FreeformChainmail2D `byColor`) so the
// parts list stays correct when a design mixes sizes/shapes: group by the full
// (size [, shape], color) tuple.
export interface RingBomRow {
  sizeId: string;
  sizeLabel: string;
  colorHex: string;
  count: number;
}
export interface ScaleBomRow {
  sizeId: string;
  sizeLabel: string;
  shapeId: string;
  colorHex: string;
  count: number;
}

export function bucketRingBom(cells: Iterable<{ colorHex: string; sizeId: string }>): RingBomRow[] {
  const acc = new Map<string, RingBomRow>();
  for (const c of cells) {
    const key = `${c.sizeId}|${c.colorHex}`;
    const row = acc.get(key);
    if (row) row.count++;
    else
      acc.set(key, {
        sizeId: c.sizeId,
        sizeLabel: ringSizeById(c.sizeId)?.label ?? c.sizeId,
        colorHex: c.colorHex,
        count: 1,
      });
  }
  return [...acc.values()].sort((a, b) => b.count - a.count);
}

export function bucketScaleBom(
  cells: Iterable<{ colorHex: string; sizeId: string; shapeId: string }>,
): ScaleBomRow[] {
  const acc = new Map<string, ScaleBomRow>();
  for (const c of cells) {
    const key = `${c.sizeId}|${c.shapeId}|${c.colorHex}`;
    const row = acc.get(key);
    if (row) row.count++;
    else
      acc.set(key, {
        sizeId: c.sizeId,
        sizeLabel: scaleSizeById(c.sizeId)?.label ?? c.sizeId,
        shapeId: c.shapeId,
        colorHex: c.colorHex,
        count: 1,
      });
  }
  return [...acc.values()].sort((a, b) => b.count - a.count);
}
