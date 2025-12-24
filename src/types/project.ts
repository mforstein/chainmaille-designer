// ==============================================
// FILE: src/types/project.ts
// Shared canonical types used by Designer, Freeform, Erin2D, BOM & Export
// ==============================================
export type ToolType = "designer" | "freeform" | "erin2d";
export type SupplierId = "cmj" | "trl" | "mdz" | string;
export type ColorId = string; // `${supplierId}:${sku}`

export interface SupplierColor {
  supplierId: SupplierId;
  sku: string;
  hex: string;
  name: string;
  material?: string;
}

export interface PaletteAssignment {
  supplierIds: SupplierId[];
  paletteVersion?: string;
  colorMap: Record<ColorId, SupplierColor>;
  ringToColorId: Record<string, ColorId>; // ringKey->colorId
}

export interface ProjectMeta {
  id: string;
  tool: ToolType;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: { pngDataUrl: string; width: number; height: number };
}

export interface ExportRing {
  key: string; // "row,col"
  x_mm: number;
  y_mm: number;
  innerDiameter_mm: number;
  wireDiameter_mm: number;
  // display color (design-time paint)
  colorHex?: string;
}

export interface BOMLine {
  colorId: ColorId;
  supplierId: SupplierId;
  sku: string;
  name?: string;
  hex: string;
  ringCount: number;
  colorNumber: number; // assigned
}

export interface BOMSummary {
  totalRings: number;
  uniqueColors: number;
  suppliers: SupplierId[];
}

export interface BOMResult {
  lines: BOMLine[];
  summary: BOMSummary;
  colorIndex: Record<ColorId, number>; // ColorId -> number
}
