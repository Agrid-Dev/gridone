export const featureFlags = {
  buildingHomepage: true,
} as const;

export const isFeatureEnabled = <K extends keyof typeof featureFlags>(
  flag: K,
): boolean => featureFlags[flag];
