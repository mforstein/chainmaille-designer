// src/utils/supplierColors.ts
// Specific-supplier color tables removed 2026-06-01 — no live import paths
// reference SUPPLIER_COLOR_MAP or getSupplierColorHex. Kept as an empty stub
// so any stale .bck import paths don't blow up if accidentally re-enabled.
// Scheduled for full deletion in Wave 5.
export const SUPPLIER_COLOR_MAP: Record<string, Record<string, string>> = {};

export function getSupplierColorHex(
  _supplier: string,
  _color: string,
): string | null {
  return null;
}
