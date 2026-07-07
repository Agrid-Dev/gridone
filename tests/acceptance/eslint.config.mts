import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    files: ["**/*.{ts,mts}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "no-unused-vars": "off",
      // handled by tsc (knows lib types like RequestInit)
      "no-undef": "off",
      "no-console": "warn",
    },
  },
  eslintConfigPrettier,
  globalIgnores(["node_modules"]),
]);
