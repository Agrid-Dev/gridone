import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResourceHeader } from "@/components/ResourceHeader";
import {
  getAsset,
  listAssets,
  listAssetDevices,
  deleteAsset,
  unlinkDevice,
} from "@/api/assets";
import type { Asset } from "@/api/assets";
import { listDevices } from "@/api/devices";
import { DeviceLinkDialog } from "./components/DeviceLinkDialog";

export default function AssetDetail() {
  const { t } = useTranslation();
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

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
    queryFn: listDevices,
    enabled: deviceIds.length > 0,
  });

  const deviceNameMap = useMemo(
    () => new Map(allDevices.map((d) => [d.id, d.name])),
    [allDevices],
  );

  const deleteMutation = useMutation({
    mutationFn: () => deleteAsset(assetId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("assets.deleted"));
      navigate("/assets");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const unlinkMutation = useMutation({
    mutationFn: (deviceId: string) => unlinkDevice(assetId!, deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["assets", assetId, "devices"],
      });
      toast.success(t("assets.devices.unlinked"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !asset) {
    return (
      <div className="space-y-4">
        <div className="h-10 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white" />
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={asset.name}
        resourceName={t("assets.title")}
        resourceNameLinksBack
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/assets/${assetId}/edit`}>
                <Pencil />
                {t("common.update")}
              </Link>
            </Button>
            <Button
              variant="outline"
              className="text-red-600 hover:bg-red-50 hover:border-red-200"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              <Trash2 />
            </Button>
          </>
        }
      />

      {/* Info card */}
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">{t("assets.fields.type")}</span>
            <div className="mt-1">
              <Badge variant="outline">
                {t(`assets.types.${asset.type}`, { defaultValue: asset.type })}
              </Badge>
            </div>
          </div>
          {asset.parentId && (
            <div>
              <span className="text-slate-500">
                {t("assets.fields.parent")}
              </span>
              <div className="mt-1">
                <Link
                  to={`/assets/${asset.parentId}`}
                  className="text-slate-900 underline underline-offset-2 hover:text-slate-600"
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
          <h3 className="text-sm font-medium text-slate-900">
            {t("assets.children")} ({children.length})
          </h3>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/assets/new?parentId=${assetId}`}>
              <Plus className="h-3.5 w-3.5" />
              {t("assets.addChild")}
            </Link>
          </Button>
        </div>
        {children.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {children.map((child) => (
                  <tr key={child.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/assets/${child.id}`}
                        className="flex items-center gap-2 font-medium text-slate-900"
                      >
                        <Building2 className="h-4 w-4 text-slate-400" />
                        {child.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">
                        {t(`assets.types.${child.type}`, {
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
          <p className="text-sm text-slate-500">{t("assets.noChildren")}</p>
        )}
      </div>

      {/* Linked devices */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-900">
            {t("assets.devices.title")} ({deviceIds.length})
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLinkDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("assets.devices.link")}
          </Button>
        </div>
        {deviceIds.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {deviceIds.map((deviceId) => (
                  <tr key={deviceId} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/devices/${deviceId}`}
                        className="font-medium text-slate-900 underline underline-offset-2"
                      >
                        {deviceNameMap.get(deviceId) || deviceId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:bg-red-50 hover:border-red-200"
                        onClick={() => unlinkMutation.mutate(deviceId)}
                        disabled={unlinkMutation.isPending}
                      >
                        {t("assets.devices.unlink")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {t("assets.devices.noDevices")}
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
