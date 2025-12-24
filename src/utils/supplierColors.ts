// src/utils/supplierColors.ts
export const SUPPLIER_COLOR_MAP: Record<string, Record<string, string>> = {
  "The Ring Lord": {
    "Bright Aluminum": "#C0C0C0",
    "Anodized Blue": "#2E6AE6",
    "Anodized Red": "#D52A2A",
    "Anodized Green": "#00A878",
    "Black Stainless": "#111111",
    Bronze: "#B8860B",
    Copper: "#B87333",
    Brass: "#D4AF37",
    Rubber: "#444444",
    Silver: "#C9C9C9",
    Gold: "#FFD700",
  },
  "Chainmail Joe": {
    "Bright Aluminum": "#C0C0C0",
    "Anodized Blue": "#3B7DD8",
    "Anodized Red": "#E34242",
    "Anodized Green": "#3DBF6F",
    Black: "#101010",
    Silver: "#CCCCCC",
  },
  MetalDesignz: {
    "Bright Aluminum": "#BFC3C5",
    "Anodized Purple": "#9B5DE5",
    "Anodized Teal": "#3AB5B0",
    Copper: "#B87333",
    Bronze: "#CD7F32",
    Gold: "#FFD700",
  },
};

// ---------- Helper ----------
export function getSupplierColorHex(
  supplier: string,
  color: string,
): string | null {
  if (!supplier || !color) return null;
  const s = SUPPLIER_COLOR_MAP[supplier];
  if (!s) return null;

  const normalized = color.trim().toLowerCase();
  const foundKey = Object.keys(s).find(
    (key) => key.toLowerCase() === normalized,
  );

  return foundKey ? s[foundKey] : null;
}
