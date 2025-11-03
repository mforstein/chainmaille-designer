import fs from "fs";

const pricesFile = "../public/wovenrainbows_listings_featured.json"; // has prices
const imagesFile = "../public/wovenrainbows_listings_featured.old.json"; // has images
const outputFile = "../public/wovenrainbows_listings_featured_merged.json";

const prices = JSON.parse(fs.readFileSync(pricesFile, "utf8"));
const images = JSON.parse(fs.readFileSync(imagesFile, "utf8"));

// Extract arrays (handle if nested under { items: [...] })
const priceItems = Array.isArray(prices.items) ? prices.items : prices;
const imageItems = Array.isArray(images.items) ? images.items : images;

// Merge based on index
const merged = priceItems.map((p, i) => ({
  ...p,
  image_url: imageItems[i]?.image_url || p.image_url,
}));

fs.writeFileSync(outputFile, JSON.stringify({ items: merged }, null, 2));
console.log(`✅ Merged ${merged.length} listings to ${outputFile}`);