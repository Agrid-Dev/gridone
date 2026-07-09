import {
  useMutation,
  useQuery,
  useQueryClient,
  UseMutationResult,
  UseQueryResult,
} from "@tanstack/react-query";
import type { BuildingProfile } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

const PROFILE_KEY = ["building-profile"];

export function useBuildingProfile(): UseQueryResult<BuildingProfile> {
  const client = useGridoneClient();
  return useQuery({
    queryKey: PROFILE_KEY,
    queryFn: () => client.assets.getBuildingProfile(),
    staleTime: 5 * 60 * 1000,
  });
}

/** A profile is "configured" once it carries a name — the primary identity. */
export function isProfileConfigured(
  profile: BuildingProfile | undefined,
): boolean {
  return !!profile?.name;
}

type EditBuildingProfile = {
  schema: UseQueryResult<Record<string, unknown>>;
  profile: UseQueryResult<BuildingProfile>;
  save: UseMutationResult<BuildingProfile, Error, Record<string, unknown>>;
};

export function useEditBuildingProfile(): EditBuildingProfile {
  const client = useGridoneClient();
  const queryClient = useQueryClient();

  const schema = useQuery({
    queryKey: [...PROFILE_KEY, "schema"],
    queryFn: () => client.assets.getBuildingProfileSchema(),
    staleTime: 5 * 60 * 1000,
  });

  const profile = useBuildingProfile();

  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      client.assets.setBuildingProfile(values as BuildingProfile),
    onSuccess: (saved) => {
      queryClient.setQueryData(PROFILE_KEY, saved);
    },
  });

  return { schema, profile, save };
}
