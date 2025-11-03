// scripts/generateEtsyJson.js
import fs from "fs";
import path from "path";

const htmlPath = path.resolve("./public/WovenRainbowsByErin - Etsy.html");
const outputPath = path.resolve("./public/wovenrainbows_listings_featured.json");

console.log("📄 Reading:", htmlPath);
const html = fs.readFileSync(htmlPath, "utf8");

// Find ANY <script type="application/ld+json"> block that contains "ItemList"
const match = html.match(
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>(\s*\{[^<]*"@type":"ItemList"[^<]*\})\s*<\/script>/s
);

if (!match) {
  console.error("❌ Could not find Etsy ItemList JSON-LD in HTML.");
  // Write partial debug info for verification
  fs.writeFileSync("./debug_snippet.html", html.slice(0, 10000));
  console.log("🪶 Saved first 10KB of HTML to debug_snippet.html for inspection.");
  process.exit(1);
}

let listings = [];
try {
  const jsonString = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " "); // Normalize whitespace

  const data = JSON.parse(jsonString);

  if (Array.isArray(data.itemListElement)) {
    listings = data.itemListElement.map((entry) => {
      const product = entry.item || {};
      const offer = product.offers || {};
      return {
        title: product.name || "",
        price: offer.price || "",
        currency: offer.priceCurrency || "USD",
        url: product.url || "",
        image_url: product.image || "/images/etsy/default_avatar.png",
      };
    });
  }
} catch (err) {
  console.error("❌ JSON parsing failed:", err.message);
  process.exit(1);
}

if (!listings.length) {
  console.error("❌ No listings found after parsing.");
  process.exit(1);
}

console.log(`✅ Parsed ${listings.length} listings successfully.`);
fs.writeFileSync(outputPath, JSON.stringify(listings, null, 2));
console.log(`💾 Saved to ${outputPath}`);