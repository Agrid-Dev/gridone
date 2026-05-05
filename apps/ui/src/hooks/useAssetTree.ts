import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  flattenAssetTree,
  flattenAssetTreeById,
  getAssetTreeWithDevices,
  type Asset,
  type AssetTreeNode,
} from "@/api/assets";

/** Single source of truth for the asset tree + its derived shapes. Wraps
 *  the ``getAssetTreeWithDevices`` query (with its canonical query key) and
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
  const { data: assetTree = [], isLoading } = useQuery<AssetTreeNode[]>({
    queryKey: ["assets", "tree-with-devices"],
    queryFn: getAssetTreeWithDevices,
  });

  const assetsList = useMemo(() => flattenAssetTree(assetTree), [assetTree]);
  const assetsById = useMemo(
    () => flattenAssetTreeById(assetTree),
    [assetTree],
  );

  return { assetTree, assetsList, assetsById, isLoading };
}
