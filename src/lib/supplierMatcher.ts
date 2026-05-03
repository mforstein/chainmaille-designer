import { ALL_PRODUCTS } from "../data/supplierCatalog";
import type { SupplierProduct, SupplierId } from "../data/supplierCatalog";

export interface BOMLineItem {
  type: "ring" | "scale";
  colorHex: string;
  innerDiameterMm?: number;
  wireDiameterMm?: number;
  widthMm?: number;
  heightMm?: number;
  quantity: number;
}

export interface MatchedLineItem {
  lineItem: BOMLineItem;
  product: SupplierProduct | null;
  packsNeeded: number;
  unitCost: number;
  totalCost: number;
  colorMatch: boolean;   // true when product colorHex is close to item colorHex
}

export interface CostSummary {
  supplierId: SupplierId;
  lines: MatchedLineItem[];
  subtotal: number;
  unmatchedCount: number;
}

const TOLERANCE_MM = 0.5;
const COLOR_MATCH_THRESHOLD = 60; // Euclidean RGB distance to count as "same color"

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function colorDistance(a: string | undefined, b: string | undefined): number {
  if (!a || !b) return Infinity;
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return Infinity;
  return Math.sqrt((ra[0] - rb[0]) ** 2 + (ra[1] - rb[1]) ** 2 + (ra[2] - rb[2]) ** 2);
}

function ringScore(product: SupplierProduct, item: BOMLineItem): number {
  if (product.type !== "ring") return Infinity;
  // Both geometry fields must be defined on both sides to produce a valid match
  if (
    item.innerDiameterMm == null || item.wireDiameterMm == null ||
    product.innerDiameterMm == null || product.wireDiameterMm == null
  ) return Infinity;

  const idDiff = Math.abs(product.innerDiameterMm - item.innerDiameterMm);
  const wdDiff = Math.abs(product.wireDiameterMm - item.wireDiameterMm);
  if (idDiff > TOLERANCE_MM || wdDiff > TOLERANCE_MM) return Infinity;
  return idDiff + wdDiff;
}

function scaleScore(product: SupplierProduct, item: BOMLineItem): number {
  if (product.type !== "scale") return Infinity;
  if (
    item.widthMm == null || item.heightMm == null ||
    product.widthMm == null || product.heightMm == null
  ) return Infinity;

  const wDiff = Math.abs(product.widthMm - item.widthMm);
  const hDiff = Math.abs(product.heightMm - item.heightMm);
  if (wDiff > TOLERANCE_MM * 2 || hDiff > TOLERANCE_MM * 2) return Infinity;
  return wDiff + hDiff;
}

export function matchItem(
  item: BOMLineItem,
  supplierId: SupplierId,
): SupplierProduct | null {
  const candidates = ALL_PRODUCTS.filter((p) => p.supplierId === supplierId);
  let best: SupplierProduct | null = null;
  let bestGeo = Infinity;
  let bestColor = Infinity;

  for (const p of candidates) {
    const geo = item.type === "ring" ? ringScore(p, item) : scaleScore(p, item);
    if (geo === Infinity) continue;

    const col = colorDistance(p.colorHex, item.colorHex);

    // Prefer geometry match first, break ties with color distance
    if (
      geo < bestGeo ||
      (geo === bestGeo && col < bestColor)
    ) {
      bestGeo = geo;
      bestColor = col;
      best = p;
    }
  }

  return best;
}

export function estimateCost(
  lineItems: BOMLineItem[],
  supplierId: SupplierId,
): CostSummary {
  const lines: MatchedLineItem[] = lineItems.map((item) => {
    const product = matchItem(item, supplierId);
    if (!product) {
      return {
        lineItem: item, product: null,
        packsNeeded: 0, unitCost: 0, totalCost: 0,
        colorMatch: false,
      };
    }
    const packsNeeded = Math.ceil(item.quantity / product.unitQty);
    const unitCost = product.priceUsd / product.unitQty;
    const totalCost = packsNeeded * product.priceUsd;
    const colorMatch = colorDistance(product.colorHex, item.colorHex) < COLOR_MATCH_THRESHOLD;
    return { lineItem: item, product, packsNeeded, unitCost, totalCost, colorMatch };
  });

  const subtotal = lines.reduce((s, l) => s + l.totalCost, 0);
  const unmatchedCount = lines.filter((l) => !l.product).length;

  return { supplierId, lines, subtotal, unmatchedCount };
}
