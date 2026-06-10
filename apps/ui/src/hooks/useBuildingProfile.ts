import {
  useMutation,
  useQuery,
  useQueryClient,
  UseMutationResult,
  UseQueryResult,
} from "@tanstack/react-query";
import {
  getBuildingProfile,
  getBuildingProfileSchema,
  setBuildingProfile,
  BuildingProfile,
} from "@/api/assets";

const PROFILE_KEY = ["building-profile"];

export function useBuildingProfile(): UseQueryResult<BuildingProfile> {
  return useQuery({
    queryKey: PROFILE_KEY,
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

type EditBuildingProfile = {
  schema: UseQueryResult<Record<string, unknown>>;
  profile: UseQueryResult<BuildingProfile>;
  save: UseMutationResult<BuildingProfile, Error, Record<string, unknown>>;
};

export function useEditBuildingProfile(): EditBuildingProfile {
  const queryClient = useQueryClient();

  const schema = useQuery({
    queryKey: [...PROFILE_KEY, "schema"],
    queryFn: getBuildingProfileSchema,
    staleTime: 5 * 60 * 1000,
  });

  const profile = useBuildingProfile();

  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) => setBuildingProfile(values),
    onSuccess: (saved) => {
      queryClient.setQueryData(PROFILE_KEY, saved);
    },
  });

  return { schema, profile, save };
}
