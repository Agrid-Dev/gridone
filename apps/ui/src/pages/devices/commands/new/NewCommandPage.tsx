import { useMemo } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAsset, type Asset } from "@/api/assets";
import type { DevicesFilter } from "@/api/devices";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Controller } from "react-hook-form";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { usePermissions } from "@/contexts/AuthContext";
import { CommandWizard } from "./CommandWizard";
import { useCommandMutations } from "./useCommandMutations";
import { useCommandWizard, type CommandWizardState } from "./useCommandWizard";

const STEP_KEYS = [
  "commands.new.subtitle.target",
  "commands.new.subtitle.command",
  "commands.new.subtitle.review",
] as const;

export default function NewCommandPage() {
  const { t } = useTranslation(["devices", "common", "assets"]);
  const can = usePermissions();
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

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("commands.new.title")}
        resourceName={backResource}
        resourceNameLinksBack
        backTo={backHref}
      />
      <StepSubtitle predefined={!!predefinedTarget} />
      <WizardCard predefinedTarget={predefinedTarget} deviceId={deviceId} />
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
  predefinedTarget?: DevicesFilter;
  deviceId?: string;
};

/** Owns the standalone wizard + dispatch/save mutations + the
 *  save-as-template sibling panel. The wizard hook fetches its own data, so
 *  this component stays focused on orchestration: it builds payloads from
 *  the wizard's getters and hands them to the (independent) mutations
 *  hook, then navigates / clears drafts on success. */
function WizardCard({ predefinedTarget, deviceId }: WizardCardProps) {
  const { t } = useTranslation(["devices", "common"]);
  const navigate = useNavigate();

  const wizard = useCommandWizard({ predefinedTarget });
  const mutations = useCommandMutations({
    onDispatched: (result) => {
      wizard.clearDraft();
      if (result.kind === "batch") {
        toast.success(t("devices:commands.new.feedback.batchDispatched"));
        navigate(`/devices/commands?batch_id=${result.batchId}`);
      } else {
        toast.success(t("devices:commands.new.feedback.dispatched"));
        const listUrl = deviceId
          ? `/devices/${encodeURIComponent(deviceId)}/history/commands`
          : "/devices/commands";
        navigate(listUrl);
      }
    },
    onSaved: (template) => {
      wizard.clearDraft();
      toast.success(t("devices:commands.new.save.savedFeedback"));
      navigate(`/devices/commands/templates/${template.id}`);
    },
  });

  if (wizard.isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  const templateName = (wizard.values.templateName ?? "").trim();
  const handleSave = () => {
    const payload = wizard.getCommandPayload();
    if (payload && templateName.length > 0) {
      mutations.saveTemplate({ ...payload, name: templateName });
    }
  };

  return (
    <Card>
      <CardContent className="space-y-6 py-6">
        <CommandWizard
          wizard={wizard}
          onCancel={() => navigate(-1)}
          submit={{
            label: mutations.isDispatching
              ? t("devices:commands.new.dispatching")
              : t("devices:commands.new.dispatch"),
            onSubmit: (payload) => mutations.dispatch(payload),
          }}
        />
        {wizard.isLastStep && wizard.commandValid && (
          <SaveAsTemplatePanel
            wizard={wizard}
            isSaving={mutations.isSaving}
            canSave={
              templateName.length > 0 &&
              !mutations.isSaving &&
              wizard.commandValid
            }
            onSave={handleSave}
          />
        )}
      </CardContent>
    </Card>
  );
}

type SaveAsTemplatePanelProps = {
  wizard: CommandWizardState;
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
