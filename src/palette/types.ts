import { SupplierId } from "../App";

export type ColorId = string; // `${supplierId}:${sku}`

export interface SupplierColor {
  supplierId: SupplierId;
  sku: string;
  hex: string;
  name: string;
  material?: string;
}
