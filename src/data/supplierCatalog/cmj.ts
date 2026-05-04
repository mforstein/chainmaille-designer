// Chainmail Joe — curated catalog
// Last verified: 2026-04-27
// Source: chainmailjoe.com
import type { SupplierProduct } from "./schema";

const LAST = "2026-04-27";

const AA_COLORS: { colorName: string; colorHex: string }[] = [
  { colorName: "Bright Aluminum",  colorHex: "#d4d4d4" },
  { colorName: "Black",            colorHex: "#1a1a1a" },
  { colorName: "Red",              colorHex: "#c0231a" },
  { colorName: "Orange",           colorHex: "#e55d1a" },
  { colorName: "Yellow",           colorHex: "#e8d44d" },
  { colorName: "Green",            colorHex: "#2d8a3e" },
  { colorName: "Teal",             colorHex: "#1a8a7a" },
  { colorName: "Blue",             colorHex: "#2255c4" },
  { colorName: "Purple",           colorHex: "#7b2fbe" },
  { colorName: "Magenta",          colorHex: "#c41a8a" },
  { colorName: "Pink",             colorHex: "#e87090" },
  { colorName: "Gold",             colorHex: "#d4a017" },
  { colorName: "Copper",           colorHex: "#b87333" },
  { colorName: "Dark Blue",        colorHex: "#1a3090" },
];

const rings: SupplierProduct[] = AA_COLORS.map((c, i) => ({
  sku: `CMJ-AA-16-50-${c.colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase()}`,
  supplierId: "cmj",
  name: `AA ${c.colorName} 16G 5.0mm`,
  type: "ring",
  innerDiameterMm: 5.0,
  wireDiameterMm: 1.6,
  material: "anodized_aluminum",
  colorName: c.colorName,
  colorHex: c.colorHex,
  priceUsd: 4.50,
  unitQty: 100,
  url: `https://chainmailjoe.com/rings?color=${i}`,
  inStock: true,
  lastUpdated: LAST,
}));

const rings18g: SupplierProduct[] = AA_COLORS.slice(0, 6).map((c, i) => ({
  sku: `CMJ-AA-18-35-${c.colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase()}`,
  supplierId: "cmj",
  name: `AA ${c.colorName} 18G 3.5mm`,
  type: "ring",
  innerDiameterMm: 3.5,
  wireDiameterMm: 1.2,
  material: "anodized_aluminum",
  colorName: c.colorName,
  colorHex: c.colorHex,
  priceUsd: 3.75,
  unitQty: 150,
  url: `https://chainmailjoe.com/rings?color=${100 + i}`,
  inStock: true,
  lastUpdated: LAST,
}));

const rings18g794: SupplierProduct[] = AA_COLORS.map((c, i) => ({
  sku: `CMJ-AA-18-794-${c.colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase()}`,
  supplierId: "cmj",
  name: `AA ${c.colorName} 18G 7.94mm`,
  type: "ring",
  innerDiameterMm: 7.94,
  wireDiameterMm: 1.2,
  material: "anodized_aluminum",
  colorName: c.colorName,
  colorHex: c.colorHex,
  priceUsd: 5.25,
  unitQty: 100,
  url: `https://chainmailjoe.com/rings?color=${200 + i}`,
  inStock: true,
  lastUpdated: LAST,
}));

const rings16g6: SupplierProduct[] = AA_COLORS.map((c, i) => ({
  sku: `CMJ-AA-16-60-${c.colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase()}`,
  supplierId: "cmj",
  name: `AA ${c.colorName} 16G 6.0mm`,
  type: "ring",
  innerDiameterMm: 6.0,
  wireDiameterMm: 1.6,
  material: "anodized_aluminum",
  colorName: c.colorName,
  colorHex: c.colorHex,
  priceUsd: 5.25,
  unitQty: 100,
  url: `https://chainmailjoe.com/rings?color=${300 + i}`,
  inStock: true,
  lastUpdated: LAST,
}));

// Stainless steel
const ssRing: SupplierProduct = {
  sku: "CMJ-SS-16-50",
  supplierId: "cmj",
  name: "Stainless Steel 16G 5.0mm",
  type: "ring",
  innerDiameterMm: 5.0,
  wireDiameterMm: 1.6,
  material: "stainless_steel",
  colorName: "Stainless Steel",
  colorHex: "#a8a29e",
  priceUsd: 5.25,
  unitQty: 100,
  url: "https://chainmailjoe.com/rings?material=stainless",
  inStock: true,
  lastUpdated: LAST,
};

// Dragon scales — same color range
const scales: SupplierProduct[] = AA_COLORS.map((c, i) => ({
  sku: `CMJ-SC-SM-${c.colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase()}`,
  supplierId: "cmj",
  name: `Dragon Scale ${c.colorName} — Small`,
  type: "scale",
  widthMm: 10.0,
  heightMm: 17.0,
  holeIdMm: 3.0,
  material: "anodized_aluminum",
  colorName: c.colorName,
  colorHex: c.colorHex,
  priceUsd: 5.50,
  unitQty: 100,
  url: `https://chainmailjoe.com/scales?color=${i}`,
  inStock: true,
  lastUpdated: LAST,
}));

const cmj: SupplierProduct[] = [...rings, ...rings16g6, ...rings18g, ...rings18g794, ssRing, ...scales];

export default cmj;
