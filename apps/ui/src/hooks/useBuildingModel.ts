import { useQuery, type QueryClient } from "@tanstack/react-query";
import { isNotFound, type BuildingModel } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/** Poll cadence while a conversion is running server-side. */
const PROCESSING_POLL_MS = 2_000;

export function buildingModelKey(assetId: string) {
  return ["assets", assetId, "model"] as const;
}

export function invalidateBuildingModel(
  queryClient: QueryClient,
  assetId: string,
) {
  return queryClient.invalidateQueries({ queryKey: buildingModelKey(assetId) });
}

/**
 * 3D model attached to a building asset; `null` when none is uploaded.
 * Polls while the server-side conversion is in `processing` status.
 */
export function useBuildingModel(assetId: string | undefined) {
  const client = useGridoneClient();
  const query = useQuery<BuildingModel | null>({
    queryKey: buildingModelKey(assetId ?? ""),
    enabled: !!assetId,
    queryFn: async () => {
      try {
        return await client.assets.getModel(assetId!);
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }
    },
    refetchInterval: (q) =>
      q.state.data?.status === "processing" ? PROCESSING_POLL_MS : false,
  });
  return {
    model: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
