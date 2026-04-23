import { useMemo } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAsset, getAssetTreeWithDevices } from "@/api/assets";
import type { Asset, AssetTreeNode } from "@/api/assets";
import type { DevicesFilter } from "@/api/devices";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { usePermissions } from "@/contexts/AuthContext";
import { useDevicesList } from "@/hooks/useDevicesList";
import { CommandWizard } from "./CommandWizard";
import { flattenAssetTree } from "./types";

const STEP_KEYS = [
  "commands.new.subtitle.target",
  "commands.new.subtitle.command",
  "commands.new.subtitle.review",
] as const;

export default function NewCommandPage() {
  const { t } = useTranslation("devices");
  const can = usePermissions();
  const navigate = useNavigate();
  const { deviceId, assetId } = useParams<{
    deviceId?: string;
    assetId?: string;
  }>();

  // The entry route dictates the wizard's target:
  //   /devices/:deviceId/commands/new → pinned to that device
  //   /assets/:assetId/commands/new   → pinned to that asset (membership is
  //                                     re-evaluated on each dispatch)
  //   /devices/commands/new           → user picks in step 1
  const predefinedTarget: DevicesFilter | undefined = useMemo(() => {
    if (deviceId) return { ids: [deviceId] };
    if (assetId) return { assetId };
    return undefined;
  }, [deviceId, assetId]);

  const { devices, loading: devicesLoading } = useDevicesList();

  const { data: assetTree = [], isLoading: assetTreeLoading } = useQuery<
    AssetTreeNode[]
  >({
    queryKey: ["assets", "tree-with-devices"],
    queryFn: getAssetTreeWithDevices,
  });

  const assetsList = useMemo(() => flattenAssetTree(assetTree), [assetTree]);

  const { data: lockedAsset } = useQuery<Asset>({
    queryKey: ["assets", assetId],
    queryFn: () => getAsset(assetId!),
    enabled: !!assetId,
  });

  const backHref = deviceId
    ? `/devices/${deviceId}/history/commands`
    : assetId
      ? `/assets/${assetId}`
      : "/devices/commands";

  const backResource = assetId ? t("assets:title") : t("commands.title");

  if (!can("devices:write")) {
    return <ErrorFallback title={t("common:errors.default")} />;
  }

  const blocked = devicesLoading || (!!assetId && assetTreeLoading);

  if (blocked) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("commands.new.title")}
        resourceName={backResource}
        resourceNameLinksBack
        backTo={backHref}
      />
      <StepSubtitle predefined={!!predefinedTarget} />
      <CommandWizard
        devices={devices}
        assetTree={assetTree}
        assetsList={assetsList}
        predefinedTarget={predefinedTarget}
        onCancel={() => navigate(-1)}
        onDispatched={(result) => {
          if (result.kind === "batch") {
            toast.success(t("commands.new.feedback.batchDispatched"));
            navigate(`/devices/commands?batch_id=${result.batchId}`);
          } else {
            toast.success(t("commands.new.feedback.dispatched"));
            const listUrl = deviceId
              ? `/devices/${encodeURIComponent(deviceId)}/history/commands`
              : "/devices/commands";
            navigate(listUrl);
          }
        }}
        onSaved={(template) => {
          toast.success(t("commands.new.save.savedFeedback"));
          navigate(`/devices/commands/templates/${template.id}`);
        }}
      />
      {assetId && lockedAsset && (
        <p className="text-xs text-muted-foreground">
          <Link to={`/assets/${lockedAsset.id}`} className="hover:underline">
            {lockedAsset.name}
          </Link>
        </p>
      )}
    </section>
  );
}

function StepSubtitle({ predefined }: { predefined: boolean }) {
  const { t } = useTranslation("devices");
  const [searchParams] = useSearchParams();
  const raw = searchParams.get("step");
  const parsed = raw ? parseInt(raw, 10) - 1 : predefined ? 1 : 0;
  const clamped = Math.max(0, Math.min(2, isNaN(parsed) ? 0 : parsed));
  return (
    <p className="-mt-2 text-sm text-muted-foreground">
      {t(STEP_KEYS[clamped])}
    </p>
  );
}
