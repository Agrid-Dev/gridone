import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { getBuildingProfile, BuildingProfile } from "@/api/assets";

export function useBuildingProfile(): UseQueryResult<BuildingProfile> {
  return useQuery({
    queryKey: ["building-profile"],
    queryFn: getBuildingProfile,
    staleTime: 5 * 60 * 1000,
  });
}

/** A profile is "configured" once it carries a name — the primary identity. */
export function isProfileConfigured(
  profile: BuildingProfile | undefined,
): boolean {
  return !!profile?.name;
}
