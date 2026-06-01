export type SupplierId = "trl" | "cmj" | "mdz" | "spg";
export type ItemType = "ring" | "scale";
export type Material =
  | "aluminum"
  | "anodized_aluminum"
  | "stainless_steel"
  | "sterling_silver"
  | "argentium"
  | "copper"
  | "bronze"
  | "brass"
  | "niobium"
  | "titanium"
  | "gold_filled"
  | "other";

export interface SupplierProduct {
  sku: string;
  supplierId: SupplierId;
  name: string;
  type: ItemType;
  // Ring geometry (mm)
  innerDiameterMm?: number;
  wireDiameterMm?: number;
  // Scale geometry (mm)
  widthMm?: number;
  heightMm?: number;
  holeIdMm?: number;
  material: Material;
  colorName?: string;       // human label e.g. "Bright Aluminum"
  colorHex?: string;        // approximate display hex
  priceUsd: number;
  unitQty: number;          // rings or scales per pack
  url: string;
  affiliateUrl?: string;
  inStock?: boolean;
  lastUpdated: string;      // ISO date — when price/stock was verified
}

// Supplier display names and URLs were stripped 2026-06-01. The catalogs
// themselves are still loaded internally (so ring-size matching keeps
// working) but no specific supplier is named or linked in the UI.
// Generic labels (Catalog A/B/C/D) are kept here in case any straggler
// reference renders the name field — but no live UI path should render it.
export const SUPPLIER_INFO: Record<SupplierId, { name: string; url: string; color: string }> = {
  trl: { name: "Catalog A", url: "", color: "#c2410c" },
  cmj: { name: "Catalog B", url: "", color: "#1d4ed8" },
  mdz: { name: "Catalog C", url: "", color: "#047857" },
  spg: { name: "Catalog D", url: "", color: "#7c3aed" },
};
