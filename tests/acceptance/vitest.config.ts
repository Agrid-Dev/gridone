import { defineConfig } from "vitest/config";

// One vitest project per feature directory under suites/, so suites can be
// selected individually (`vitest run --project auth`) and later run in
// parallel CI jobs. globalSetup runs once for the whole run and provides the
// seeded device IDs to the suites.
export default defineConfig({
  test: {
    // Acceptance tests wait on real timing (5s driver polls, push intervals);
    // pollUntil gives up at 30s with a descriptive error, so it — not
    // vitest's 5s unit-test default — should be what times out first.
    // Every project must carry `extends: true`, or it silently falls back to
    // that 5s default instead of inheriting this.
    testTimeout: 60_000,
    // In CI, print the full per-test transcript and annotate failures on the
    // PR (::error workflow commands); keep the compact output locally.
    reporters: process.env.GITHUB_ACTIONS
      ? ["verbose", "github-actions"]
      : ["default"],
    globalSetup: ["./setup/globalSetup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "auth",
          include: ["suites/auth/**/*.spec.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "devices",
          include: ["suites/devices/**/*.spec.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "transports",
          include: ["suites/transports/**/*.spec.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dashboards",
          include: ["suites/dashboards/**/*.spec.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "notifications",
          include: ["suites/notifications/**/*.spec.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "automations",
          include: ["suites/automations/**/*.spec.ts"],
        },
      },
    ],
  },
});
