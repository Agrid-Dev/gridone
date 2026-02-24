import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { getAssetTreeWithDevices, updateAsset, createAsset, reorderChildren } from "@/api/assets";
import type { AssetTreeNode } from "@/api/assets";
import { AssetTree } from "./components/AssetTree";

export default function AssetsList() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const {
    data: tree = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery<AssetTreeNode[]>({
    queryKey: ["assets", "tree"],
    queryFn: getAssetTreeWithDevices,
  });

  const moveMutation = useMutation({
    mutationFn: ({
      assetId,
      newParentId,
    }: {
      assetId: string;
      newParentId: string;
    }) => updateAsset(assetId, { parentId: newParentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("assets.moved"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createChildMutation = useMutation({
    mutationFn: ({
      parentId,
      name,
      type,
    }: {
      parentId: string;
      name: string;
      type: string;
    }) => createAsset({ name, type, parentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("assets.created"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const renameMutation = useMutation({
    mutationFn: ({
      assetId,
      newName,
    }: {
      assetId: string;
      newName: string;
    }) => updateAsset(assetId, { name: newName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("assets.renamed"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleMove = (assetId: string, newParentId: string) => {
    moveMutation.mutate({ assetId, newParentId });
  };

  const handleCreateChild = (parentId: string, name: string, type: string) => {
    createChildMutation.mutate({ parentId, name, type });
  };

  const reorderMutation = useMutation({
    mutationFn: ({
      parentId,
      orderedIds,
    }: {
      parentId: string;
      orderedIds: string[];
    }) => reorderChildren(parentId, orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleRename = (assetId: string, newName: string) => {
    renameMutation.mutate({ assetId, newName });
  };

  const handleReorder = (parentId: string, orderedIds: string[]) => {
    reorderMutation.mutate({ parentId, orderedIds });
  };

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("assets.subtitle")}
        resourceName={t("assets.title")}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading || isFetching}
            >
              <RefreshCw />
              {isFetching ? t("common.refreshing") : t("common.refresh")}
            </Button>
            <Button asChild>
              <Link to="/assets/new">
                <Plus />
                {t("assets.create")}
              </Link>
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : tree.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <AssetTree
            tree={tree}
            onMove={handleMove}
            onCreateChild={handleCreateChild}
            onRename={handleRename}
            onReorder={handleReorder}
          />
        </div>
      ) : (
        <ResourceEmpty resourceName={t("assets.singular").toLowerCase()} />
      )}
    </section>
  );
}
