// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),

      // keep your explicit aliases if you want them
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "react-router": path.resolve(__dirname, "node_modules/react-router"),
      "react-router-dom": path.resolve(__dirname, "node_modules/react-router-dom"),
    },
    dedupe: ["react", "react-dom", "react-router", "react-router-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-router", "react-router-dom"],
    exclude: ["react-router/dom"], // prevents invalid import
  },
});