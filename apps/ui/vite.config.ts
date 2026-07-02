import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  // eslint-disable-next-line no-undef
  const env = loadEnv(mode, __dirname, "");
  // Auth is cookie-based, so the browser only attaches credentials to
  // same-origin requests. To develop against a remote deployment, set
  // VITE_DEV_PROXY_TARGET to its full API base URL and VITE_API_BASE_URL=/api:
  // the dev server proxies /api and cookies stay first-party.
  const proxyTarget = env.VITE_DEV_PROXY_TARGET;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: proxyTarget
        ? {
            "/api": {
              target: proxyTarget,
              changeOrigin: true,
              rewrite: (p: string) => p.replace(/^\/api/, ""),
              cookieDomainRewrite: "",
            },
          }
        : undefined,
    },
    build: {
      outDir: "dist",
      assetsDir: "_assets",
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
  };
});
