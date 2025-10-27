import fs from "fs";

const inputFile = `${process.env.HOME}/wovenrainbows_backup.json`;
const outputFile = "./public/wovenrainbows_listings_featured.json";

const data = JSON.parse(fs.readFileSync(inputFile, "utf8"));

// take first 25 listings
const featured = {
  items: data.items ? data.items.slice(0, 25) : data.slice(0, 25)
};

fs.writeFileSync(outputFile, JSON.stringify(featured, null, 2));

console.log(`✅ Created featured listings file with ${featured.items.length} items.`);
console.log(`💾 Saved to ${outputFile}`);