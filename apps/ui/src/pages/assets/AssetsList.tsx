import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { usePermissions } from "@/contexts/AuthContext";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import type { AssetType } from "@gridone/sdk";
import type { AssetTreeNode } from "@/lib/assets";
import { AssetTree } from "./components/AssetTree";

export default function AssetsList() {
  const { t } = useTranslation("assets");
  const queryClient = useQueryClient();
  const client = useGridoneClient();
  const can = usePermissions();

  const { data: tree = [], isLoading } = useQuery<AssetTreeNode[]>({
    queryKey: ["assets", "tree"],
    queryFn: () =>
      client.assets.getTreeWithDevices() as Promise<AssetTreeNode[]>,
  });

  const moveMutation = useMutation({
    mutationFn: ({
      assetId,
      newParentId,
    }: {
      assetId: string;
      newParentId: string;
    }) => client.assets.update(assetId, { parent_id: newParentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("moved"));
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
    }) =>
      client.assets.create({
        name,
        type: type as AssetType,
        parent_id: parentId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("created"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const renameMutation = useMutation({
    mutationFn: ({ assetId, newName }: { assetId: string; newName: string }) =>
      client.assets.update(assetId, { name: newName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("renamed"));
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
    }) => client.assets.reorderChildren(parentId, { ordered_ids: orderedIds }),
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
        title={t("title")}
        actions={
          <>
            {can("assets:write") && (
              <Button asChild size="sm">
                <Link to="/assets/new">
                  <Plus />
                  {t("create")}
                </Link>
              </Button>
            )}
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : tree.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card p-4">
          <AssetTree
            tree={tree}
            onMove={handleMove}
            onCreateChild={handleCreateChild}
            onRename={handleRename}
            onReorder={handleReorder}
          />
        </div>
      ) : (
        <ResourceEmpty resourceName={t("singular").toLowerCase()} />
      )}
    </section>
  );
}
