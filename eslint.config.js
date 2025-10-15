// eslint.config.js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // 🧹 Global ignores (replaces .eslintignore)
  globalIgnores([
    "node_modules",
    "dist",
    "build",
    "vite.config.ts",
    "eslint.config.js",
    "src/utils/scraper.ts",
    "src/types",
  ]),

  // Base JS rules
  js.configs.recommended,

  // TypeScript + React rules
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      parser,
      globals: {
  ...globals.browser,
  ...globals.node,
},
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // ✅ TypeScript recommended rules
      ...tseslint.configs.recommended.rules,

      // ✅ React-specific rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": "warn",

      // ✅ TS refinements
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "off", // optional — silence until typed
    },
  },
]);