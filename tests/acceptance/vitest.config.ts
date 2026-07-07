import { defineConfig } from "vitest/config";

// One vitest project per feature directory under suites/, so suites can be
// selected individually (`vitest run --project auth`) and later run in
// parallel CI jobs. globalSetup runs once for the whole run and provides the
// seeded device IDs to the suites.
export default defineConfig({
  test: {
    // In CI, print the full per-test transcript and annotate failures on the
    // PR (::error workflow commands); keep the compact output locally.
    reporters: process.env.GITHUB_ACTIONS
      ? ["verbose", "github-actions"]
      : ["default"],
    globalSetup: ["./setup/globalSetup.ts"],
    projects: [
      {
        test: {
          name: "auth",
          include: ["suites/auth/**/*.spec.ts"],
        },
      },
      {
        test: {
          name: "devices",
          include: ["suites/devices/**/*.spec.ts"],
        },
      },
    ],
  },
});
