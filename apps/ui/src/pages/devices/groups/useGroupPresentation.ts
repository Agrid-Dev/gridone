import { useQuery, skipToken } from "@tanstack/react-query";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { resolvePresentation } from "@/components/device-ui/resolvePresentation";
import { loadPresentationAssets } from "@/components/device-ui/assets";

export function useGroupPresentation(id: string) {
  const client = useGridoneClient();
  const query = useQuery({
    queryKey: ["group-presentation", id],
    queryFn: () => client.devices.groups.getPresentation(id),
    refetchInterval: 10_000,
  });
  const response = query.data;
  const resolution =
    response?.status === "available"
      ? resolvePresentation(response.document)
      : null;
  const document =
    resolution?.status === "available" ? resolution.document : null;
  const assets = useQuery({
    queryKey: ["presentation-assets", response?.revision],
    queryFn:
      document && response
        ? () =>
            loadPresentationAssets(document, (assetId) =>
              client.devices.groups.getPresentationAsset(
                id,
                response.revision,
                assetId,
              ),
            )
        : skipToken,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return {
    document,
    assets: assets.data,
    loading: query.isLoading || (!!document && assets.isLoading),
  };
}
