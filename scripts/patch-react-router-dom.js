// scripts/patch-react-router-dom.js
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const file = "node_modules/react-router-dom/dist/index.mjs";

if (!existsSync(file)) {
  console.log("⚠️  react-router-dom index.mjs not found — skipping patch.");
  process.exit(0);
}

try {
  let src = readFileSync(file, "utf8");

  // Replace incorrect imports
  src = src.replace(/"react-router\/dom"/g, '"react-router"');

  // Remove unnecessary HydratedRouter and RouterProvider lines
  src = src.replace(/.*HydratedRouter.*\n?/g, "");
  src = src.replace(/.*RouterProvider.*\n?/g, "");

  writeFileSync(file, src);
  console.log("✅ Patched react-router-dom for Linux builds.");
} catch (err) {
  console.error("❌ Failed to patch react-router-dom:", err);
  process.exit(1);
}