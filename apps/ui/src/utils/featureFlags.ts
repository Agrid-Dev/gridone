export const featureFlags = {
  buildingHomepage: import.meta.env.VITE_FEATURE_BUILDING_HOMEPAGE === "true",
} as const;

export const isFeatureEnabled = <K extends keyof typeof featureFlags>(
  flag: K,
): boolean => featureFlags[flag];
