import trl from "./trl";
import cmj from "./cmj";
import mdz from "./mdz";
import spg from "./spg";

export type { SupplierProduct, SupplierId, Material, ItemType } from "./schema";
export { SUPPLIER_INFO } from "./schema";

import type { SupplierProduct, SupplierId, ItemType } from "./schema";

export const ALL_PRODUCTS: SupplierProduct[] = [...trl, ...cmj, ...mdz, ...spg];

export const PRODUCTS_BY_SUPPLIER: Record<SupplierId, SupplierProduct[]> = {
  trl, cmj, mdz, spg,
};

// ── Color swatch utilities ────────────────────────────────────────────────────

export interface ColorSwatch {
  colorName: string;
  colorHex: string;
  material: string;
  itemTypes: ItemType[];
  skus: string[];
  supplierId: SupplierId;
}

/** Returns deduplicated color swatches for one supplier, optionally filtered by item type. */
export function getSupplierSwatches(
  supplierId: SupplierId,
  itemType?: ItemType,
): ColorSwatch[] {
  const products = PRODUCTS_BY_SUPPLIER[supplierId];
  const map = new Map<string, ColorSwatch>();

  for (const p of products) {
    if (itemType && p.type !== itemType) continue;
    const hex = p.colorHex ?? "#808080";
    const key = `${hex}::${p.material}`;

    const existing = map.get(key);
    if (existing) {
      if (!existing.itemTypes.includes(p.type)) existing.itemTypes.push(p.type);
      existing.skus.push(p.sku);
    } else {
      map.set(key, {
        colorName: p.colorName ?? "Unknown",
        colorHex: hex,
        material: p.material,
        itemTypes: [p.type],
        skus: [p.sku],
        supplierId,
      });
    }
  }

  return Array.from(map.values());
}

/** Returns every unique colorHex available across all suppliers for the given item type. */
export function getAllSupplierColors(itemType?: ItemType): string[] {
  const seen = new Set<string>();
  for (const p of ALL_PRODUCTS) {
    if (itemType && p.type !== itemType) continue;
    if (p.colorHex) seen.add(p.colorHex.toLowerCase());
  }
  return Array.from(seen);
}
