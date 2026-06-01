// Catalog D — curated catalog
// Last verified: 2026-04-27
// Source: supplier-d.example — boutique supplier, emphasis on metals + specialty colors
import type { SupplierProduct, Material } from "./schema";

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
  { colorName: "Gold",             colorHex: "#d4a017" },
  { colorName: "Teal",             colorHex: "#1a8a7a" },
];

// Anodized aluminum rings 16G 5.0mm
const aaRings: SupplierProduct[] = AA_COLORS.map((c, i) => ({
  sku: `SPG-AA-16-50-${c.colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase()}`,
  supplierId: "spg",
  name: `AA ${c.colorName} 16G 5.0mm`,
  type: "ring",
  innerDiameterMm: 5.0,
  wireDiameterMm: 1.6,
  material: "anodized_aluminum",
  colorName: c.colorName,
  colorHex: c.colorHex,
  priceUsd: 4.75,
  unitQty: 100,
  url: `https://supplier-d.example/rings?i=${i}`,
  inStock: true,
  lastUpdated: LAST,
}));

// Premium metal rings — SPG specialty
const metalRings: SupplierProduct[] = [
  {
    sku: "SPG-BR-16-50",
    supplierId: "spg",
    name: "Brass 16G 5.0mm",
    type: "ring",
    innerDiameterMm: 5.0,
    wireDiameterMm: 1.6,
    material: "brass",
    colorName: "Brass",
    colorHex: "#b5a642",
    priceUsd: 7.99,
    unitQty: 100,
    url: "https://supplier-d.example/rings?material=brass",
    inStock: true,
    lastUpdated: LAST,
  },
  {
    sku: "SPG-BZ-16-50",
    supplierId: "spg",
    name: "Bronze 16G 5.0mm",
    type: "ring",
    innerDiameterMm: 5.0,
    wireDiameterMm: 1.6,
    material: "bronze",
    colorName: "Bronze",
    colorHex: "#cd7f32",
    priceUsd: 8.49,
    unitQty: 100,
    url: "https://supplier-d.example/rings?material=bronze",
    inStock: true,
    lastUpdated: LAST,
  },
  {
    sku: "SPG-CU-16-50",
    supplierId: "spg",
    name: "Copper 16G 5.0mm",
    type: "ring",
    innerDiameterMm: 5.0,
    wireDiameterMm: 1.6,
    material: "copper",
    colorName: "Copper",
    colorHex: "#b87333",
    priceUsd: 7.49,
    unitQty: 100,
    url: "https://supplier-d.example/rings?material=copper",
    inStock: true,
    lastUpdated: LAST,
  },
  {
    sku: "SPG-SS-16-50",
    supplierId: "spg",
    name: "Stainless Steel 16G 5.0mm",
    type: "ring",
    innerDiameterMm: 5.0,
    wireDiameterMm: 1.6,
    material: "stainless_steel",
    colorName: "Stainless Steel",
    colorHex: "#a8a29e",
    priceUsd: 5.99,
    unitQty: 100,
    url: "https://supplier-d.example/rings?material=stainless",
    inStock: true,
    lastUpdated: LAST,
  },
];

// Anodized aluminum rings 18G 7.94mm (5/16") — freeform default size
const aaRings18g794: SupplierProduct[] = AA_COLORS.map((c, i) => ({
  sku: `SPG-AA-18-794-${c.colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase()}`,
  supplierId: "spg",
  name: `AA ${c.colorName} 18G 7.94mm`,
  type: "ring",
  innerDiameterMm: 7.94,
  wireDiameterMm: 1.2,
  material: "anodized_aluminum",
  colorName: c.colorName,
  colorHex: c.colorHex,
  priceUsd: 5.49,
  unitQty: 100,
  url: `https://supplier-d.example/rings?i=${100 + i}`,
  inStock: true,
  lastUpdated: LAST,
}));

// Anodized aluminum rings 16G 6.0mm
const aaRings16g6: SupplierProduct[] = AA_COLORS.map((c, i) => ({
  sku: `SPG-AA-16-60-${c.colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase()}`,
  supplierId: "spg",
  name: `AA ${c.colorName} 16G 6.0mm`,
  type: "ring",
  innerDiameterMm: 6.0,
  wireDiameterMm: 1.6,
  material: "anodized_aluminum",
  colorName: c.colorName,
  colorHex: c.colorHex,
  priceUsd: 5.25,
  unitQty: 100,
  url: `https://supplier-d.example/rings?i=${200 + i}`,
  inStock: true,
  lastUpdated: LAST,
}));

// Dragon scales — AA colors + metal finishes
const scales: SupplierProduct[] = AA_COLORS.map((c, i) => ({
  sku: `SPG-SC-MD-${c.colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase()}`,
  supplierId: "spg",
  name: `Dragon Scale ${c.colorName} — Medium`,
  type: "scale",
  widthMm: 11.0,
  heightMm: 20.0,
  holeIdMm: 3.0,
  material: "anodized_aluminum",
  colorName: c.colorName,
  colorHex: c.colorHex,
  priceUsd: 5.99,
  unitQty: 100,
  url: `https://supplier-d.example/scales?i=${i}`,
  inStock: true,
  lastUpdated: LAST,
}));

const metalScales: Array<SupplierProduct & { material: Material }> = [
  {
    sku: "SPG-SC-MD-BR",
    supplierId: "spg",
    name: "Dragon Scale Brass — Medium",
    type: "scale",
    widthMm: 11.0,
    heightMm: 20.0,
    holeIdMm: 3.0,
    material: "brass",
    colorName: "Brass",
    colorHex: "#b5a642",
    priceUsd: 9.99,
    unitQty: 50,
    url: "https://supplier-d.example/scales?material=brass",
    inStock: true,
    lastUpdated: LAST,
  },
  {
    sku: "SPG-SC-MD-BZ",
    supplierId: "spg",
    name: "Dragon Scale Bronze — Medium",
    type: "scale",
    widthMm: 11.0,
    heightMm: 20.0,
    holeIdMm: 3.0,
    material: "bronze",
    colorName: "Bronze",
    colorHex: "#cd7f32",
    priceUsd: 10.49,
    unitQty: 50,
    url: "https://supplier-d.example/scales?material=bronze",
    inStock: true,
    lastUpdated: LAST,
  },
  {
    sku: "SPG-SC-MD-CU",
    supplierId: "spg",
    name: "Dragon Scale Copper — Medium",
    type: "scale",
    widthMm: 11.0,
    heightMm: 20.0,
    holeIdMm: 3.0,
    material: "copper",
    colorName: "Copper",
    colorHex: "#b87333",
    priceUsd: 9.49,
    unitQty: 50,
    url: "https://supplier-d.example/scales?material=copper",
    inStock: true,
    lastUpdated: LAST,
  },
];

const spg: SupplierProduct[] = [...aaRings, ...aaRings16g6, ...aaRings18g794, ...metalRings, ...scales, ...metalScales];

export default spg;
