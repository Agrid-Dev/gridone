import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  Asset,
  AssetUpdate as AssetUpdatePayload,
  Device,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { useDeviceAssetLink } from "@/hooks/useDeviceAssetLink";
import { useReorderSubzones } from "@/hooks/useReorderSubzones";
import type { AssetFormValues } from "./components/AssetForm";
import { AssetEditWorkspace } from "./components/AssetEditWorkspace";
import { DeviceLinkDialog } from "./components/DeviceLinkDialog";
import { usePermissions } from "@/contexts/AuthContext";

export default function AssetEdit() {
  const { t } = useTranslation("assets");
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  const mutation = useMutation({
    mutationFn: (data: AssetUpdatePayload) =>
      client.assets.update(assetId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("updated"));
      navigate(`/assets/${assetId}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reorderMutation = useReorderSubzones(assetId);
  const { unlink } = useDeviceAssetLink(assetId);

  const deleteMutation = useMutation({
    mutationFn: () => client.assets.delete(assetId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("deleted"));
      navigate("/assets");
    },
    onError: (err: Error) => toast.error(err.message),
  });

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

  const handleSubmit = (data: AssetFormValues) => {
    mutation.mutate({
      name: data.name,
      type: data.type,
      parent_id: data.parentId,
    });
  };

  return (
    <>
      <AssetEditWorkspace
        key={asset.id}
        asset={asset}
        allAssets={allAssets}
        childAssets={children}
        devices={devices}
        deviceIds={deviceIds}
        isPending={mutation.isPending}
        isDeleting={deleteMutation.isPending}
        canWriteAssets={can("assets:write")}
        canWriteDevices={can("devices:write")}
        onSubmit={handleSubmit}
        onDelete={() => deleteMutation.mutate()}
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
