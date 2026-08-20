import { useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Terminal } from "lucide-react";
import type { Asset, Device } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { usePermissions } from "@/contexts/AuthContext";
import { useDeviceAssetLink } from "@/hooks/useDeviceAssetLink";
import { useReorderSubzones } from "@/hooks/useReorderSubzones";
import { AssetEditWorkspace } from "./components/AssetEditWorkspace";
import { DeviceLinkDialog } from "./components/DeviceLinkDialog";

export default function AssetDetail() {
  const { t } = useTranslation("devices");
  const { assetId } = useParams<{ assetId: string }>();
  const client = useGridoneClient();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const can = usePermissions();

  const { data: asset, isLoading } = useQuery<Asset>({
    queryKey: ["assets", assetId],
    queryFn: () => client.assets.get(assetId!),
    enabled: !!assetId,
  });

  const { data: allAssets = [] } = useQuery<Asset[]>({
    queryKey: ["assets"],
    queryFn: () => client.assets.list(),
  });

  const { data: children = [] } = useQuery<Asset[]>({
    queryKey: ["assets", "children", assetId],
    queryFn: () => client.assets.list({ parent_id: assetId! }),
    enabled: !!assetId,
  });

  const { data: deviceIds = [] } = useQuery<string[]>({
    queryKey: ["assets", assetId, "devices"],
    queryFn: () => client.assets.listDevices(assetId!),
    enabled: !!assetId,
  });

  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: () => client.devices.list(),
    enabled: deviceIds.length > 0,
  });

  const reorderMutation = useReorderSubzones(assetId);
  const { unlink } = useDeviceAssetLink(assetId);

  if (isLoading || !asset) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-80" />
        <div className="flex items-center gap-4 border-b border-border pb-7">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-72 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const canWriteAssets = can("assets:write");
  const canWriteDevices = can("devices:write");

  return (
    <>
      <AssetEditWorkspace
        key={asset.id}
        mode="detail"
        asset={asset}
        allAssets={allAssets}
        childAssets={children}
        devices={devices}
        deviceIds={deviceIds}
        canWriteAssets={canWriteAssets}
        canWriteDevices={canWriteDevices}
        headerActions={
          canWriteDevices && deviceIds.length > 0 ? (
            <Button asChild className="h-11">
              <Link to={`/assets/${asset.id}/commands/new`}>
                <Terminal />
                {t("commands.newCommand")}
              </Link>
            </Button>
          ) : null
        }
        onLinkDevice={() => setLinkDialogOpen(true)}
        onUnlinkDevice={(deviceId) => unlink.mutate(deviceId)}
        onReorder={(orderedIds) => reorderMutation.mutate(orderedIds)}
      />
      <DeviceLinkDialog
        assetId={assetId!}
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        existingDeviceIds={deviceIds}
      />
    </>
  );
}
