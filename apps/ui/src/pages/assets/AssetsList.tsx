import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { getAssetTree, updateAsset } from "@/api/assets";
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
    queryFn: getAssetTree,
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

  const handleMove = (assetId: string, newParentId: string) => {
    moveMutation.mutate({ assetId, newParentId });
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
          <AssetTree tree={tree} onMove={handleMove} />
        </div>
      ) : (
        <ResourceEmpty resourceName={t("assets.title").toLowerCase()} />
      )}
    </section>
  );
}
