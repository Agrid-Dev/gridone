import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { usePermissions } from "@/contexts/AuthContext";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { useAssetSelection } from "@/hooks/useAssetSelection";
import { useSetAssetsUsage } from "@/hooks/useSetAssetsUsage";
import type { AssetTreeNode } from "@/lib/assets";
import { AssetTree } from "./components/AssetTree";

export default function AssetsList() {
  const { t } = useTranslation("assets");
  const client = useGridoneClient();
  const can = usePermissions();
  const canEdit = can("assets:write");
  const selection = useAssetSelection();
  const setUsage = useSetAssetsUsage({ onSuccess: selection.clear });

  const { data: tree = [], isLoading } = useQuery<AssetTreeNode[]>({
    queryKey: ["assets", "tree-with-devices"],
    queryFn: () =>
      client.assets.getTreeWithDevices() as Promise<AssetTreeNode[]>,
  });

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("title")}
        caption={t("overview.subtitle")}
        flush
        actions={
          <>
            {canEdit && (
              <Button asChild size="sm">
                <Link to="/assets/new?type=zone">
                  <Plus />
                  {t("create")}
                </Link>
              </Button>
            )}
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <Skeleton className="h-10 w-64" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : tree.length > 0 ? (
        <AssetTree
          tree={tree}
          canEdit={canEdit}
          selection={selection}
          onSetUsage={(assetIds, usage) => setUsage.mutate({ assetIds, usage })}
          isSettingUsage={setUsage.isPending}
        />
      ) : (
        <ResourceEmpty resourceName={t("singular").toLowerCase()} />
      )}
    </section>
  );
}
