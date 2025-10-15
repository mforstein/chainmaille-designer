// src/data/color.ts
export interface SupplierColor {
  supplier: string;
  colors: string[];
}

export const SupplierColors: SupplierColor[] = [
  {
    supplier: "The Ring Lord",
    colors: ["Natural", "Anodized Blue", "Anodized Red", "Anodized Green"]
  },
  {
    supplier: "Chainmail Joe",
    colors: ["Natural", "Anodized Green", "Anodized Purple"]
  }
];