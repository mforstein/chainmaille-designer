import fs from "fs";
import path from "path";
import https from "https";

const inputPath = "./public/wovenrainbows_listings_featured.json";
const outputDir = "./public/images/etsy";
const outputJson = "./public/wovenrainbows_listings_featured_local.json";

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const listings = JSON.parse(fs.readFileSync(inputPath, "utf8"));

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(`Failed to download ${url}: ${res.statusCode}`);
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
}

(async () => {
  for (const listing of listings) {
    if (!listing.image_url.startsWith("http")) continue;

    const filename = path.basename(new URL(listing.image_url).pathname);
    const dest = path.join(outputDir, filename);

    try {
      await download(listing.image_url, dest);
      listing.image_url = `/images/etsy/${filename}`;
      console.log(`✅ Saved ${filename}`);
    } catch (err) {
      console.warn(`⚠️ Skipped ${listing.title}: ${err}`);
    }
  }

  fs.writeFileSync(outputJson, JSON.stringify(listings, null, 2));
  console.log(`💾 Updated JSON saved to ${outputJson}`);
})();