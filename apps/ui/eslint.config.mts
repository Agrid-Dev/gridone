import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.browser },
    rules: {
      "react/react-in-jsx-scope": "off",
      "no-unused-vars": "off", // handled by tseslint
      "no-console": "warn",
    },
  },
  {
    // React-Three-Fiber declares custom JSX intrinsic elements with props that
    // eslint-plugin-react flags as unknown. Disable the rule inside the 3D
    // home page where R3F is used.
    files: ["src/pages/home/**/*.{ts,tsx}"],
    rules: {
      "react/no-unknown-property": "off",
    },
  },
  eslintConfigPrettier,
  globalIgnores(["dist", "tailwind.config.js", "vite.config.js"]),
]);
