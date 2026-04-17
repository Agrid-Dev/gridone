import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { getAsset, getAssetTreeWithDevices } from "@/api/assets";
import type { Asset, AssetTreeNode } from "@/api/assets";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { usePermissions } from "@/contexts/AuthContext";
import { useDevicesList } from "@/hooks/useDevicesList";
import { CommandWizard } from "./CommandWizard";
import { flattenAssetTree, type WizardContext } from "./types";

const STEP_KEYS = [
  "commands.new.subtitle.target",
  "commands.new.subtitle.command",
  "commands.new.subtitle.review",
] as const;

type NewCommandPageProps = {
  context?: WizardContext;
};

export default function NewCommandPage({ context }: NewCommandPageProps) {
  const { t } = useTranslation("devices");
  const can = usePermissions();
  const { deviceId, assetId } = useParams<{
    deviceId?: string;
    assetId?: string;
  }>();

  const resolvedContext: WizardContext =
    context ?? (deviceId ? "device" : assetId ? "asset" : "open");

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
    enabled: resolvedContext === "asset" && !!assetId,
  });

  const backHref =
    resolvedContext === "device"
      ? `/devices/${deviceId}/history/commands`
      : resolvedContext === "asset"
        ? `/assets/${assetId}`
        : "/devices/history";

  const backResource =
    resolvedContext === "asset" ? t("assets:title") : t("commands.title");

  if (!can("devices:write")) {
    return <ErrorFallback title={t("common:errors.default")} />;
  }

  const blocked =
    devicesLoading || (resolvedContext === "asset" && assetTreeLoading);

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
      <StepSubtitle />
      <CommandWizard
        context={resolvedContext}
        devices={devices}
        assetTree={assetTree}
        assetsList={assetsList}
        lockedDeviceId={resolvedContext === "device" ? deviceId : undefined}
        lockedAssetId={resolvedContext === "asset" ? assetId : undefined}
      />
      {resolvedContext === "asset" && lockedAsset && (
        <p className="text-xs text-muted-foreground">
          <Link to={`/assets/${lockedAsset.id}`} className="hover:underline">
            {lockedAsset.name}
          </Link>
        </p>
      )}
    </section>
  );
}

function StepSubtitle() {
  const { t } = useTranslation("devices");
  const [searchParams] = useSearchParams();
  const raw = searchParams.get("step");
  const step = raw ? parseInt(raw, 10) - 1 : 0;
  const clamped = Math.max(0, Math.min(2, isNaN(step) ? 0 : step));
  return (
    <p className="-mt-2 text-sm text-muted-foreground">
      {t(STEP_KEYS[clamped])}
    </p>
  );
}
