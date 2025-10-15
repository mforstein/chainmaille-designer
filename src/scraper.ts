// scripts/scraper.ts
import fs from "fs";
import path from "path";
import { suppliers } from "../src/data/suppliers";
import { SupplierColors } from "../src/data/color";

// placeholder scrapers (replace later)
async function scrapeTheRingLord() {
  return [
    { id: 1, color: "Anodized Blue" },
    { id: 2, color: "Natural" },
  ];
}

async function scrapeChainmailJoe() {
  return [
    { id: 1, color: "Anodized Green" },
    { id: 2, color: "Anodized Purple" },
  ];
}

export async function scrapeSuppliers() {
  const updatedSuppliers = { ...suppliers };
  const updatedColors: Record<string, Set<string>> = {};

  // Scrape The Ring Lord
  const trlRings = await scrapeTheRingLord();
  updatedSuppliers["The Ring Lord"] = trlRings;
  updatedColors["The Ring Lord"] = new Set(trlRings.map(r => r.color));

  // Scrape Chainmail Joe
  const cmjRings = await scrapeChainmailJoe();
  updatedSuppliers["Chainmail Joe"] = cmjRings;
  updatedColors["Chainmail Joe"] = new Set(cmjRings.map(r => r.color));

  // Write suppliers.ts
  fs.writeFileSync(
    path.join(__dirname, "../src/data/suppliers.ts"),
    "export const suppliers = " + JSON.stringify(updatedSuppliers, null, 2) + ";"
  );

  // Write color.ts
  const colorData = Object.entries(updatedColors).map(([supplier, colors]) => ({
    supplier,
    colors: Array.from(colors)
  }));
  fs.writeFileSync(
    path.join(__dirname, "../src/data/color.ts"),
    "export const SupplierColors = " + JSON.stringify(colorData, null, 2) + ";"
  );

  return updatedSuppliers;
}

// If called directly from CLI
if (require.main === module) {
  scrapeSuppliers().then(() => console.log("✅ Supplier data updated."));
}