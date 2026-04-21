import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Terminal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { getAsset, listAssets, listAssetDevices } from "@/api/assets";
import type { Asset } from "@/api/assets";
import { listDevices, unlinkDeviceFromAsset } from "@/api/devices";
import { DeviceLinkDialog } from "./components/DeviceLinkDialog";
import { usePermissions } from "@/contexts/AuthContext";

export default function AssetDetail() {
  const { t } = useTranslation("assets");
  const { assetId } = useParams<{ assetId: string }>();
  const queryClient = useQueryClient();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const can = usePermissions();

  const { data: asset, isLoading } = useQuery<Asset>({
    queryKey: ["assets", assetId],
    queryFn: () => getAsset(assetId!),
    enabled: !!assetId,
  });

  const { data: parent } = useQuery<Asset>({
    queryKey: ["assets", asset?.parentId],
    queryFn: () => getAsset(asset!.parentId!),
    enabled: !!asset?.parentId,
  });

  const { data: children = [] } = useQuery<Asset[]>({
    queryKey: ["assets", "children", assetId],
    queryFn: () => listAssets({ parentId: assetId! }),
    enabled: !!assetId,
  });

  const { data: deviceIds = [] } = useQuery<string[]>({
    queryKey: ["assets", assetId, "devices"],
    queryFn: () => listAssetDevices(assetId!),
    enabled: !!assetId,
  });

  const { data: allDevices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: () => listDevices(),
    enabled: deviceIds.length > 0,
  });

  const deviceNameMap = useMemo(
    () => new Map(allDevices.map((d) => [d.id, d.name])),
    [allDevices],
  );

  const unlinkMutation = useMutation({
    mutationFn: (deviceId: string) => unlinkDeviceFromAsset(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["assets", assetId, "devices"],
      });
      toast.success(t("devices.unlinked"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !asset) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={asset.name}
        resourceName={t("title")}
        resourceNameLinksBack
        backTo="/assets"
        actions={
          <>
            {can("assets:write") && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/assets/${assetId}/edit`}>
                  <Pencil />
                  {t("common:common.update")}
                </Link>
              </Button>
            )}
            {can("devices:write") && deviceIds.length > 0 && (
              <Button asChild size="sm">
                <Link to={`/assets/${assetId}/commands/new`}>
                  <Terminal />
                  {t("devices:commands.newCommand")}
                </Link>
              </Button>
            )}
          </>
        }
      />

      {/* Info card */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">{t("fields.type")}</span>
            <div className="mt-1">
              <Badge variant="outline">
                {t(`types.${asset.type}`, { defaultValue: asset.type })}
              </Badge>
            </div>
          </div>
          {asset.parentId && (
            <div>
              <span className="text-muted-foreground">
                {t("fields.parent")}
              </span>
              <div className="mt-1">
                <Link
                  to={`/assets/${asset.parentId}`}
                  className="text-foreground underline underline-offset-2 hover:text-muted-foreground"
                >
                  {parent?.name ?? asset.parentId}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-foreground">
            {t("children")} ({children.length})
          </h3>
          {can("assets:write") && (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/assets/new?parentId=${assetId}`}>
                <Plus className="h-3.5 w-3.5" />
                {t("addChild")}
              </Link>
            </Button>
          )}
        </div>
        {children.length > 0 ? (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {children.map((child) => (
                  <tr key={child.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/assets/${child.id}`}
                        className="flex items-center gap-2 font-medium text-foreground"
                      >
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {child.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">
                        {t(`types.${child.type}`, {
                          defaultValue: child.type,
                        })}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noChildren")}</p>
        )}
      </div>

      {/* Linked devices */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-foreground">
            {t("devices.title")} ({deviceIds.length})
          </h3>
          {can("assets:write") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLinkDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("devices.link")}
            </Button>
          )}
        </div>
        {deviceIds.length > 0 ? (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {deviceIds.map((deviceId) => (
                  <tr key={deviceId} className="hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/devices/${deviceId}`}
                        className="font-medium text-foreground underline underline-offset-2"
                      >
                        {deviceNameMap.get(deviceId) || deviceId}
                      </Link>
                    </td>
                    {can("assets:write") && (
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:border-red-200"
                          onClick={() => unlinkMutation.mutate(deviceId)}
                          disabled={unlinkMutation.isPending}
                        >
                          {t("devices.unlink")}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("devices.noDevices")}
          </p>
        )}
      </div>

      <DeviceLinkDialog
        assetId={assetId!}
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        existingDeviceIds={deviceIds}
      />
    </section>
  );
}
