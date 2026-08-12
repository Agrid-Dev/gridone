import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Asset } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/** Persists a new sub-zone order for `assetId` (the parent zone).
 *
 *  The children query is patched optimistically — each child's `position`
 *  follows its index in the dropped order — and rolled back on error. Every
 *  assets-rooted query is refetched on settle so trees and floor rollups pick
 *  up the curated order. */
export function useReorderSubzones(assetId: string | undefined) {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const childrenKey = ["assets", "children", assetId];

  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      client.assets.reorderChildren(assetId!, { ordered_ids: orderedIds }),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: childrenKey });
      const previous = queryClient.getQueryData<Asset[]>(childrenKey);
      const rank = new Map(orderedIds.map((id, index) => [id, index]));
      queryClient.setQueryData<Asset[]>(childrenKey, (old = []) =>
        old.map((child) => ({
          ...child,
          position: rank.get(child.id) ?? child.position,
        })),
      );
      return { previous };
    },
    onError: (err: Error, _orderedIds, context) => {
      if (context?.previous) {
        queryClient.setQueryData(childrenKey, context.previous);
      }
      toast.error(err.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["assets"] }),
  });
}
