import { useAuth } from "@/contexts/AuthContext";

/**
 * Map of UI-facing flag identifiers to the snake_case names emitted by the
 * backend (which strips `GRIDONE_FEATURE_` from the env var and lowercases
 * the remainder). Adding a flag = adding one entry here.
 */
const FLAG_BACKEND_NAMES = {
  buildingHomepage: "building_homepage",
  uiSandbox: "ui_sandbox",
  dashboards: "dashboards",
} as const;

export type FeatureFlag = keyof typeof FLAG_BACKEND_NAMES;

export function useFeatureEnabled(flag: FeatureFlag): boolean {
  const { health } = useAuth();
  return health.flags.includes(FLAG_BACKEND_NAMES[flag]);
}
