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

export const SUPPLIER_INFO: Record<SupplierId, { name: string; url: string; color: string }> = {
  trl: { name: "The Ring Lord", url: "https://theringlord.com", color: "#c2410c" },
  cmj: { name: "Chainmail Joe",  url: "https://chainmailjoe.com",  color: "#1d4ed8" },
  mdz: { name: "Metal Designz",  url: "https://metaldesignz.com",  color: "#047857" },
  spg: { name: "Steampunk Garage", url: "https://steampunkgarage.com", color: "#7c3aed" },
};
