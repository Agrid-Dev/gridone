import { useMemo } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAsset } from "@/api/assets";
import type { Asset, AssetTreeNode } from "@/api/assets";
import type { CommandTemplate } from "@/api/commands";
import type { Device, DevicesFilter } from "@/api/devices";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Controller } from "react-hook-form";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { usePermissions } from "@/contexts/AuthContext";
import { useAssetTree } from "@/hooks/useAssetTree";
import { useDevicesList } from "@/hooks/useDevicesList";
import { CommandWizard } from "./CommandWizard";
import {
  useCommandMutations,
  type DispatchResult,
} from "./useCommandMutations";
import { useCommandWizard } from "./useCommandWizard";

const STEP_KEYS = [
  "commands.new.subtitle.target",
  "commands.new.subtitle.command",
  "commands.new.subtitle.review",
] as const;

export default function NewCommandPage() {
  const { t } = useTranslation(["devices", "common", "assets"]);
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
  const { assetTree, assetsList, isLoading: assetTreeLoading } = useAssetTree();

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

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("commands.new.title")}
        resourceName={backResource}
        resourceNameLinksBack
        backTo={backHref}
      />
      <StepSubtitle predefined={!!predefinedTarget} />
      {blocked ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        <WizardCard
          devices={devices}
          assetTree={assetTree}
          assetsList={assetsList}
          predefinedTarget={predefinedTarget}
          deviceId={deviceId}
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
      )}
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

type WizardCardProps = {
  devices: Device[];
  assetTree: AssetTreeNode[];
  assetsList: Asset[];
  predefinedTarget?: DevicesFilter;
  deviceId?: string;
  onCancel: () => void;
  onDispatched: (result: DispatchResult) => void;
  onSaved: (template: CommandTemplate) => void;
};

/** Wraps the wizard + its dispatch / save mutations + the save-as-template
 *  panel. Owns both hooks so it can pass the form-progression state to the
 *  wizard component while the mutations consume the same state. */
function WizardCard({
  devices,
  assetTree,
  assetsList,
  predefinedTarget,
  onCancel,
  onDispatched,
  onSaved,
}: WizardCardProps) {
  const { t } = useTranslation(["devices", "common"]);

  const wizard = useCommandWizard({ devices, predefinedTarget });
  const mutations = useCommandMutations({
    wizard,
    onDispatched,
    onSaved,
  });

  return (
    <Card>
      <CardContent className="space-y-6 py-6">
        <CommandWizard
          wizard={wizard}
          devices={devices}
          assetTree={assetTree}
          assetsList={assetsList}
          predefinedTarget={predefinedTarget}
          onCancel={onCancel}
          submitAction={{
            label: mutations.isDispatching
              ? t("devices:commands.new.dispatching")
              : t("devices:commands.new.dispatch"),
            onAction: () => mutations.handleDispatch(),
          }}
        />
        {wizard.isLastStep && wizard.commandValid && (
          <SaveAsTemplatePanel
            wizard={wizard}
            isSaving={mutations.isSaving}
            canSave={mutations.canSave}
            onSave={() => mutations.handleSave()}
          />
        )}
      </CardContent>
    </Card>
  );
}

type SaveAsTemplatePanelProps = {
  wizard: ReturnType<typeof useCommandWizard>;
  isSaving: boolean;
  canSave: boolean;
  onSave: () => void;
};

/** Tertiary "save as template" UI rendered alongside the wizard's primary
 *  Dispatch action. Lives outside the wizard so the wizard component stays
 *  generic — the inline action form skips this entirely. */
function SaveAsTemplatePanel({
  wizard,
  isSaving,
  canSave,
  onSave,
}: SaveAsTemplatePanelProps) {
  const { t } = useTranslation("devices");
  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-4">
      <p className="text-sm text-muted-foreground">
        {t("commands.new.save.hint")}
      </p>
      <div className="flex items-end gap-3">
        <Controller
          control={wizard.control}
          name="templateName"
          render={({ field }) => (
            <Field className="flex-1">
              <FieldLabel htmlFor="templateName">
                {t("commands.new.save.nameLabel")}
              </FieldLabel>
              <Input
                id="templateName"
                placeholder={t("commands.new.save.namePlaceholder")}
                value={field.value ?? ""}
                onChange={field.onChange}
              />
            </Field>
          )}
        />
        <Button
          type="button"
          variant="outline"
          onClick={onSave}
          disabled={!canSave}
        >
          {isSaving
            ? t("commands.new.save.saving")
            : t("commands.new.save.action")}
        </Button>
      </div>
    </div>
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
