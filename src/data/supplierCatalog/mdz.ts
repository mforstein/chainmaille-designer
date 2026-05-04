// Metal Designz — curated catalog
// Last verified: 2026-04-27
// Source: metaldesignz.com — focus on scales and anodized aluminum
import type { SupplierProduct } from "./schema";

const LAST = "2026-04-27";

const AA_COLORS: { colorName: string; colorHex: string }[] = [
  { colorName: "Bright Aluminum",  colorHex: "#d4d4d4" },
  { colorName: "Black",            colorHex: "#1a1a1a" },
  { colorName: "Red",              colorHex: "#c0231a" },
  { colorName: "Orange",           colorHex: "#e55d1a" },
  { colorName: "Yellow",           colorHex: "#e8d44d" },
  { colorName: "Green",            colorHex: "#2d8a3e" },
  { colorName: "Blue",             colorHex: "#2255c4" },
  { colorName: "Purple",           colorHex: "#7b2fbe" },
  { colorName: "Pink",             colorHex: "#e87090" },
  { colorName: "Copper",           colorHex: "#b87333" },
  { colorName: "Gold",             colorHex: "#d4a017" },
  { colorName: "Teal",             colorHex: "#1a8a7a" },
];

const rings: SupplierProduct[] = AA_COLORS.map((c, i) => ({
  sku: `MDZ-AA-16-50-${c.colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase()}`,
  supplierId: "mdz",
  name: `AA ${c.colorName} 16G 5.0mm`,
  type: "ring",
  innerDiameterMm: 5.0,
  wireDiameterMm: 1.6,
  material: "anodized_aluminum",
  colorName: c.colorName,
  colorHex: c.colorHex,
  priceUsd: 4.25,
  unitQty: 100,
  url: `https://metaldesignz.com/rings?i=${i}`,
  inStock: true,
  lastUpdated: LAST,
}));

const rings18g794: SupplierProduct[] = AA_COLORS.map((c, i) => ({
  sku: `MDZ-AA-18-794-${c.colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase()}`,
  supplierId: "mdz",
  name: `AA ${c.colorName} 18G 7.94mm`,
  type: "ring",
  innerDiameterMm: 7.94,
  wireDiameterMm: 1.2,
  material: "anodized_aluminum",
  colorName: c.colorName,
  colorHex: c.colorHex,
  priceUsd: 5.25,
  unitQty: 100,
  url: `https://metaldesignz.com/rings?i=${100 + i}`,
  inStock: true,
  lastUpdated: LAST,
}));

const rings16g6: SupplierProduct[] = AA_COLORS.map((c, i) => ({
  sku: `MDZ-AA-16-60-${c.colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase()}`,
  supplierId: "mdz",
  name: `AA ${c.colorName} 16G 6.0mm`,
  type: "ring",
  innerDiameterMm: 6.0,
  wireDiameterMm: 1.6,
  material: "anodized_aluminum",
  colorName: c.colorName,
  colorHex: c.colorHex,
  priceUsd: 5.00,
  unitQty: 100,
  url: `https://metaldesignz.com/rings?i=${200 + i}`,
  inStock: true,
  lastUpdated: LAST,
}));

// Teardrop scales (MDZ specialty) — full color range
const teardropScales: SupplierProduct[] = AA_COLORS.map((c, i) => ({
  sku: `MDZ-SC-TRP-${c.colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase()}`,
  supplierId: "mdz",
  name: `Teardrop Scale ${c.colorName}`,
  type: "scale",
  widthMm: 10.3,
  heightMm: 27.6,
  holeIdMm: 7.9,
  material: "anodized_aluminum",
  colorName: c.colorName,
  colorHex: c.colorHex,
  priceUsd: 6.49,
  unitQty: 100,
  url: `https://metaldesignz.com/scales?i=${i}`,
  inStock: true,
  lastUpdated: LAST,
}));

// Stainless scale
const ssScale: SupplierProduct = {
  sku: "MDZ-SC-TRP-SS",
  supplierId: "mdz",
  name: "Teardrop Scale Stainless Steel",
  type: "scale",
  widthMm: 10.3,
  heightMm: 27.6,
  holeIdMm: 7.9,
  material: "stainless_steel",
  colorName: "Stainless Steel",
  colorHex: "#a8a29e",
  priceUsd: 8.99,
  unitQty: 100,
  url: "https://metaldesignz.com/scales?material=stainless",
  inStock: true,
  lastUpdated: LAST,
};

const mdz: SupplierProduct[] = [...rings, ...rings16g6, ...rings18g794, ...teardropScales, ssScale];

export default mdz;
