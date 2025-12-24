// ======================================================
// src/BOM/adapters/designerAdapter.ts
// ======================================================
//
// PURPOSE
// -------
// Post-processes canonical BOMRing[] data produced by
// Designer / Freeform / Erin2D adapters.
//
// This file MUST NOT:
// - mutate rendering state
// - depend on RingRenderer internals
// - change geometry or paint semantics
//
// It ONLY enriches BOM data for:
// - supplier catalogs
// - SKU mapping
// - color numbering
// - print / export layers
//
// ======================================================

import { BOMRing, SupplierId } from "../../App";

/**
 * Extended BOM line used for printing / export
 */
export interface BOMLineExtended {
  supplier: SupplierId;
  colorHex: string;
  colorIndex: number; // 1..N (for numbered prints)
  sku: string; // supplier-specific SKU (shimmed)
  ringCount: number;
  innerDiameter: number;
  wireDiameter: number;
  material?: string;
}

/**
 * Output of the adapter
 */
export interface BOMAdapterResult {
  totalRings: number;
  uniqueColors: number;
  lines: BOMLineExtended[];
  colorMap: Map<string, number>; // colorHex → index
}

/**
 * SAFE SHIM:
 * Until real supplier catalogs are wired, we derive
 * a deterministic SKU from supplier + color.
 */
function deriveSku(supplier: SupplierId, colorHex: string): string {
  const hex = colorHex.replace("#", "").toUpperCase();
  return `${supplier.toUpperCase()}-${hex}`;
}

/**
 * Main adapter
 */
export function adaptDesignerBOM(rings: BOMRing[]): BOMAdapterResult {
  if (!Array.isArray(rings) || rings.length === 0) {
    return {
      totalRings: 0,
      uniqueColors: 0,
      lines: [],
      colorMap: new Map(),
    };
  }

  // Assign stable color numbers (1..N)
  const colorMap = new Map<string, number>();
  let colorCounter = 1;

  for (const r of rings) {
    if (!colorMap.has(r.colorHex)) {
      colorMap.set(r.colorHex, colorCounter++);
    }
  }

  // Aggregate lines
  const lineMap = new Map<string, BOMLineExtended>();

  for (const r of rings) {
    const colorIndex = colorMap.get(r.colorHex)!;
    const sku = deriveSku(r.supplier, r.colorHex);

    const key = [
      r.supplier,
      r.colorHex,
      r.innerDiameter,
      r.wireDiameter,
      r.material ?? "Unknown",
    ].join("|");

    if (!lineMap.has(key)) {
      lineMap.set(key, {
        supplier: r.supplier,
        colorHex: r.colorHex,
        colorIndex,
        sku,
        ringCount: 0,
        innerDiameter: r.innerDiameter,
        wireDiameter: r.wireDiameter,
        material: r.material,
      });
    }

    lineMap.get(key)!.ringCount += 1;
  }

  return {
    totalRings: rings.length,
    uniqueColors: colorMap.size,
    lines: Array.from(lineMap.values()).sort(
      (a, b) => a.colorIndex - b.colorIndex,
    ),
    colorMap,
  };
}
