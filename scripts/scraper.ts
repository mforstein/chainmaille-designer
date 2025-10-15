// scripts/scraper.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { suppliers } from "../src/data/suppliers.ts";
import { SupplierColors } from "../src/data/color.ts";

// Convert ESM URL to directory path (__dirname equivalent)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dummy scrape functions for example
async function scrapeTheRingLord() {
  return [
    { name: "6mm Bright Aluminum", color: "Natural" },
    { name: "6mm Blue Anodized", color: "Anodized Blue" },
  ];
}

async function scrapeChainmailJoe() {
  return [
    { name: "6mm Green Anodized", color: "Anodized Green" },
    { name: "6mm Purple Anodized", color: "Anodized Purple" },
  ];
}

export async function scrapeSuppliers() {
  // clone suppliers object
  const updatedSuppliers = { ...suppliers };
  const updatedColors: Record<string, Set<string>> = {};

  // Example: scrape The Ring Lord
  const trlRings = await scrapeTheRingLord();
  updatedSuppliers["The Ring Lord"] = trlRings;
  updatedColors["The Ring Lord"] = new Set(trlRings.map((r) => r.color));

  // Example: scrape Chainmail Joe
  const cmjRings = await scrapeChainmailJoe();
  updatedSuppliers["Chainmail Joe"] = cmjRings;
  updatedColors["Chainmail Joe"] = new Set(cmjRings.map((r) => r.color));

  // Write suppliers.ts
  fs.writeFileSync(
    path.join(__dirname, "../src/data/suppliers.ts"),
    "export const suppliers = " +
      JSON.stringify(updatedSuppliers, null, 2) +
      ";\n"
  );

  // Write color.ts
  const colorData = Object.entries(updatedColors).map(([supplier, colors]) => ({
    supplier,
    colors: Array.from(colors),
  }));
  fs.writeFileSync(
    path.join(__dirname, "../src/data/color.ts"),
    "export const SupplierColors = " +
      JSON.stringify(colorData, null, 2) +
      ";\n"
  );

  console.log("✅ Supplier data updated.");
  return updatedSuppliers;
}

// Auto-run if invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeSuppliers();
}