import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Asset } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import {
  flattenAssetTree,
  flattenAssetTreeById,
  type AssetTreeNode,
} from "@/lib/assets";

/** Single source of truth for the asset tree + its derived shapes. Wraps
 *  the ``getTreeWithDevices`` query (with its canonical query key) and
 *  the two flatten helpers so callers can reach for the shape they need
 *  without reimplementing the walk in every page.
 *
 *  Returns the raw tree (for tree-shaped UIs), the flat name-sorted list
 *  (for asset selectors), and the id-keyed map (for asset-name lookups in
 *  presenters). All three views share the same query cache. */
export function useAssetTree(): {
  assetTree: AssetTreeNode[];
  assetsList: Asset[];
  assetsById: Record<string, Asset>;
  isLoading: boolean;
} {
  const client = useGridoneClient();
  const { data: assetTree = [], isLoading } = useQuery<AssetTreeNode[]>({
    queryKey: ["assets", "tree-with-devices"],
    queryFn: () =>
      client.assets.getTreeWithDevices() as Promise<AssetTreeNode[]>,
  });

  const assetsList = useMemo(() => flattenAssetTree(assetTree), [assetTree]);
  const assetsById = useMemo(
    () => flattenAssetTreeById(assetTree),
    [assetTree],
  );

  return { assetTree, assetsList, assetsById, isLoading };
}
