import { useQuery } from "@tanstack/react-query";
import { listAssets, type Asset } from "@/api/assets";

export function useZonesList() {
  const { data, isLoading, error } = useQuery<Asset[]>({
    queryKey: ["assets", "list", { type: "zone" }],
    queryFn: () => listAssets({ type: "zone" }),
  });

  return {
    zones: data ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : "error") : null,
  };
}
