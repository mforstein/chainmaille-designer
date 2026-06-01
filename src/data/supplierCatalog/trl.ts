// Catalog A — curated catalog
// Last verified: 2026-04-27
// Source: supplier-a.example — update prices quarterly
import type { SupplierProduct, Material } from "./schema";

const LAST = "2026-04-27";
const BASE = "https://supplier-a.example/cart/shopdisplayproducts.asp";

// ── Anodized Aluminum color palette ──────────────────────────────────────────
const AA_COLORS: { colorName: string; colorHex: string }[] = [
  { colorName: "Bright Aluminum",  colorHex: "#d4d4d4" },
  { colorName: "Black",            colorHex: "#1a1a1a" },
  { colorName: "Dark Grey",        colorHex: "#4a4a4a" },
  { colorName: "Red",              colorHex: "#c0231a" },
  { colorName: "Orange",           colorHex: "#e55d1a" },
  { colorName: "Gold",             colorHex: "#d4a017" },
  { colorName: "Yellow",           colorHex: "#e8d44d" },
  { colorName: "Chartreuse",       colorHex: "#8ac420" },
  { colorName: "Lime",             colorHex: "#7bc143" },
  { colorName: "Green",            colorHex: "#2d8a3e" },
  { colorName: "Teal",             colorHex: "#1a8a7a" },
  { colorName: "Ice Blue",         colorHex: "#72b8d4" },
  { colorName: "Sky Blue",         colorHex: "#4ba3d4" },
  { colorName: "Royal Blue",       colorHex: "#2255c4" },
  { colorName: "Dark Blue",        colorHex: "#1a3090" },
  { colorName: "Violet",           colorHex: "#5c2291" },
  { colorName: "Purple",           colorHex: "#7b2fbe" },
  { colorName: "Fuchsia",          colorHex: "#c41a8a" },
  { colorName: "Hot Pink",         colorHex: "#e0185a" },
  { colorName: "Pink",             colorHex: "#e87090" },
  { colorName: "Rose Gold",        colorHex: "#c9937a" },
  { colorName: "Copper",           colorHex: "#b87333" },
];

// ── Niobium color palette ─────────────────────────────────────────────────────
const NB_COLORS: { colorName: string; colorHex: string }[] = [
  { colorName: "Niobium Blue",     colorHex: "#4060c0" },
  { colorName: "Niobium Purple",   colorHex: "#7040b0" },
  { colorName: "Niobium Green",    colorHex: "#307040" },
  { colorName: "Niobium Red",      colorHex: "#b03020" },
  { colorName: "Niobium Teal",     colorHex: "#208080" },
  { colorName: "Niobium Gold",     colorHex: "#c8a832" },
];

function aaRing(
  i: number,
  { colorName, colorHex }: { colorName: string; colorHex: string },
  gauge: number, idMm: number, wdMm: number,
  price: number, qty: number,
): SupplierProduct {
  const tag = colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase();
  return {
    sku: `TRL-AA-${gauge}-${String(idMm).replace(".", "")}${tag}`,
    supplierId: "trl",
    name: `AA ${colorName} ${gauge}G ${idMm}mm`,
    type: "ring",
    innerDiameterMm: idMm,
    wireDiameterMm: wdMm,
    material: "anodized_aluminum",
    colorName,
    colorHex,
    priceUsd: price,
    unitQty: qty,
    url: `${BASE}?id=${100 + i}`,
    inStock: true,
    lastUpdated: LAST,
  };
}

function aaScale(
  i: number,
  { colorName, colorHex }: { colorName: string; colorHex: string },
  sizeName: string, wMm: number, hMm: number, holeId: number,
  price: number, qty: number,
): SupplierProduct {
  const tag = colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase();
  const sCode = sizeName.slice(0, 2).toUpperCase();
  return {
    sku: `TRL-SC-${sCode}-${tag}`,
    supplierId: "trl",
    name: `AA ${colorName} Scale — ${sizeName}`,
    type: "scale",
    widthMm: wMm,
    heightMm: hMm,
    holeIdMm: holeId,
    material: "anodized_aluminum",
    colorName,
    colorHex,
    priceUsd: price,
    unitQty: qty,
    url: `${BASE}?id=${200 + i}`,
    inStock: true,
    lastUpdated: LAST,
  };
}

// 16G 5.0mm — most common for scale maille
const rings16g = AA_COLORS.map((c, i) =>
  aaRing(i, c, 16, 5.0, 1.6, 4.99, 100)
);

// 16G 6.0mm
const rings16g6 = AA_COLORS.map((c, i) =>
  aaRing(500 + i, c, 16, 6.0, 1.6, 5.49, 100)
);

// 16G 8.0mm
const rings16g8 = AA_COLORS.map((c, i) =>
  aaRing(550 + i, c, 16, 8.0, 1.6, 5.99, 75)
);

// 18G 3.5mm — small accent rings
const rings18g = AA_COLORS.slice(0, 8).map((c, i) =>
  aaRing(100 + i, c, 18, 3.5, 1.2, 3.99, 200)
);

// 18G 4.5mm
const rings18g45 = AA_COLORS.map((c, i) =>
  aaRing(400 + i, c, 18, 4.5, 1.2, 4.49, 150)
);

// 18G 6.0mm
const rings18g6 = AA_COLORS.map((c, i) =>
  aaRing(450 + i, c, 18, 6.0, 1.2, 4.99, 100)
);

// 18G 7.94mm (5/16") — freeform designer default size
const rings18g794 = AA_COLORS.map((c, i) =>
  aaRing(600 + i, c, 18, 7.94, 1.2, 5.49, 100)
);

// 18G 9.0mm
const rings18g9 = AA_COLORS.map((c, i) =>
  aaRing(650 + i, c, 18, 9.0, 1.2, 5.99, 75)
);

// 20G 3.5mm — fine detail
const rings20g = AA_COLORS.map((c, i) =>
  aaRing(700 + i, c, 20, 3.5, 0.8, 3.49, 250)
);

// Niobium rings 20G 4.0mm
const nbRings = NB_COLORS.map((c, i) => ({
  sku: `TRL-NB-20-40${c.colorName.replace(/\s+/g, "").slice(0, 4).toUpperCase()}`,
  supplierId: "trl" as const,
  name: `Niobium ${c.colorName} 20G 4.0mm`,
  type: "ring" as const,
  innerDiameterMm: 4.0,
  wireDiameterMm: 0.9,
  material: "niobium" as Material,
  colorName: c.colorName,
  colorHex: c.colorHex,
  priceUsd: 8.99,
  unitQty: 50,
  url: `${BASE}?id=${300 + i}`,
  inStock: true,
  lastUpdated: LAST,
}));

// Stainless steel 16G 5.0mm
const stainlessRing: SupplierProduct = {
  sku: "TRL-SS-16-50",
  supplierId: "trl",
  name: "Stainless Steel 16G 5.0mm",
  type: "ring",
  innerDiameterMm: 5.0,
  wireDiameterMm: 1.6,
  material: "stainless_steel",
  colorName: "Stainless Steel",
  colorHex: "#a8a29e",
  priceUsd: 5.49,
  unitQty: 100,
  url: `${BASE}?id=350`,
  inStock: true,
  lastUpdated: LAST,
};

// Sterling silver 20G 4.0mm
const sterlingRing: SupplierProduct = {
  sku: "TRL-SV-20-40",
  supplierId: "trl",
  name: "Sterling Silver 20G 4.0mm",
  type: "ring",
  innerDiameterMm: 4.0,
  wireDiameterMm: 0.9,
  material: "sterling_silver",
  colorName: "Sterling Silver",
  colorHex: "#c0c0c0",
  priceUsd: 14.99,
  unitQty: 50,
  url: `${BASE}?id=351`,
  inStock: true,
  lastUpdated: LAST,
};

// Copper 18G 4.5mm
const copperRing: SupplierProduct = {
  sku: "TRL-CU-18-45",
  supplierId: "trl",
  name: "Copper 18G 4.5mm",
  type: "ring",
  innerDiameterMm: 4.5,
  wireDiameterMm: 1.2,
  material: "copper",
  colorName: "Copper",
  colorHex: "#b87333",
  priceUsd: 6.99,
  unitQty: 100,
  url: `${BASE}?id=352`,
  inStock: true,
  lastUpdated: LAST,
};

// Small scales (10.3 × 18mm) — full color range
const smallScales = AA_COLORS.map((c, i) =>
  aaScale(i, c, "Small", 10.3, 18.0, 3.0, 5.99, 100)
);

// Large scales (12.5 × 24mm) — popular colors only
const largeScales = AA_COLORS.slice(0, 12).map((c, i) =>
  aaScale(100 + i, c, "Large", 12.5, 24.0, 3.0, 7.99, 100)
);

const trl: SupplierProduct[] = [
  ...rings16g,
  ...rings16g6,
  ...rings16g8,
  ...rings18g,
  ...rings18g45,
  ...rings18g6,
  ...rings18g794,
  ...rings18g9,
  ...rings20g,
  ...nbRings,
  stainlessRing,
  sterlingRing,
  copperRing,
  ...smallScales,
  ...largeScales,
];

export default trl;
