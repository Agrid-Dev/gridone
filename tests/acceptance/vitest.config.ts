import { defineConfig } from "vitest/config";

// One vitest project per feature directory under suites/, so suites can be
// selected individually (`vitest run --project auth`) and later run in
// parallel CI jobs.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "auth",
          include: ["suites/auth/**/*.spec.ts"],
        },
      },
    ],
  },
});
