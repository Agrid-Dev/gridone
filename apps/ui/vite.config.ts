import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
  resolve: {
    alias: {
      // eslint-disable-next-line no-undef
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    server: {
      deps: {
        inline: [/@react-spring/, /@visx/],
      },
    },
  },
});
