import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import type { Protection, ProtectionView } from "@gridone/sdk";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { usePermissions } from "@/contexts/AuthContext";
import { ConditionEditor, ScalarInput } from "./ConditionEditor";
import { defaultScalar, pointType } from "./expressions";
import { PointPicker } from "./PointPicker";
import { ProtectionSummary } from "./ProtectionSummary";
import { ProtectionDiagnostics, ProtectionError } from "./ProtectionFeedback";
import {
  isConflict,
  protectionPath,
  protectionsPath,
  useProtection,
  useProtectionDevices,
  useProtectionForm,
  useProtectionSchemas,
} from "./useProtections";

export function ProtectionForm({
  initial,
  reasons,
}: {
  initial?: Protection;
  reasons?: ProtectionView["reasons"];
}) {
  const { t } = useTranslation("protections");
  const device = useDeviceFromRoute();
  const { data: schemas } = useProtectionSchemas();
  const { data: devices } = useProtectionDevices();
  const state = useProtectionForm(device.id, schemas, initial);
  const { form, base, save, reload, latest } = state;
  const catalog = { devices, contracts: base?.points };
  const target = form.watch("target");
  const type = pointType(catalog, target);
  const back = initial ? protectionPath(initial) : protectionsPath(device.id);
  const invalid = Object.keys(form.formState.errors).length > 0;
  const locked = save.isPending || reload.isPending || !!base?.retirement;
  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t(initial ? "edit" : "create")}
        caption={t("intro", { device: device.name })}
      />
      <ProtectionDiagnostics reasons={reasons} />
      {base?.retirement && <p role="status">{t("retiredHelp")}</p>}
      <form onSubmit={state.submit} className="space-y-6" noValidate>
        <fieldset disabled={locked} className="space-y-6">
          <div className="grid gap-4 rounded-xl border bg-card p-5">
            <FieldShell
              id="protection-name"
              label={t("name")}
              required
              invalid={!!form.formState.errors.name}
              error={
                form.formState.errors.name
                  ? { type: "validate", message: t("required") }
                  : undefined
              }
            >
              <Input
                id="protection-name"
                {...form.register("name")}
                aria-invalid={!!form.formState.errors.name}
              />
            </FieldShell>
            <FieldShell
              id="protection-explanation"
              label={t("explanation")}
              description={t("explanationHelp")}
              required
              invalid={!!form.formState.errors.explanation}
              error={
                form.formState.errors.explanation
                  ? { type: "validate", message: t("required") }
                  : undefined
              }
            >
              <Textarea
                id="protection-explanation"
                {...form.register("explanation")}
                aria-invalid={!!form.formState.errors.explanation}
              />
            </FieldShell>
          </div>
          <section
            className="space-y-4 rounded-xl border bg-card p-5"
            aria-labelledby="protection-target-heading"
          >
            <h3 id="protection-target-heading" className="font-semibold">
              {t("target")}
            </h3>
            <p className="text-sm text-muted-foreground">{t("targetHelp")}</p>
            <Controller
              name="target"
              control={form.control}
              render={({ field }) => (
                <>
                  <PointPicker
                    catalog={catalog}
                    value={field.value}
                    writable
                    fixedDevice
                    onChange={(point) =>
                      field.onChange({
                        ...point,
                        value: defaultScalar(pointType(catalog, point)),
                      })
                    }
                  />
                  <ScalarInput
                    label={t("requestedValue")}
                    value={field.value.value}
                    dataType={type}
                    onChange={(value) =>
                      field.onChange({ ...field.value, value })
                    }
                  />
                </>
              )}
            />
          </section>
          <section
            className="space-y-3"
            aria-labelledby="protection-condition-heading"
          >
            <h3 id="protection-condition-heading" className="font-semibold">
              {t("allowWhen")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("conditionHelp")}
            </p>
            <Controller
              name="condition"
              control={form.control}
              render={({ field }) => (
                <ConditionEditor
                  catalog={catalog}
                  candidateType={type}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </section>
        </fieldset>
        {invalid && (
          <p role="alert" className="text-sm text-destructive">
            {t("formInvalid")}
          </p>
        )}
        <ProtectionError error={reload.error ?? save.error} />
        {isConflict(save.error) && (
          <div className="space-y-4 rounded-xl border border-amber-300 bg-amber-50/30 p-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => reload.mutate()}
              disabled={reload.isPending}
            >
              {t("reloadLatest")}
            </Button>
            {latest && (
              <>
                <h3 className="font-semibold">
                  {t("latestVersion", { revision: latest.revision })}
                </h3>
                <p className="text-sm font-medium">{latest.name}</p>
                <ProtectionSummary
                  rule={latest}
                  catalog={{ devices, contracts: latest.points }}
                />
                <p className="text-sm">
                  {t(latest.retirement ? "retiredHelp" : "reconcileHelp")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={state.useLatest}
                  >
                    {t("useLatest")}
                  </Button>
                  {!latest.retirement && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={state.keepDraft}
                    >
                      {t("keepDraft")}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {state.backup && (
          <Button type="button" variant="outline" onClick={state.restoreDraft}>
            {t("restoreDraft")}
          </Button>
        )}
        <p className="text-sm text-muted-foreground">{t("limits")}</p>
        <div className="flex justify-end gap-3">
          <Button asChild type="button" variant="outline">
            <Link to={back}>{t("cancel")}</Link>
          </Button>
          <Button type="submit" disabled={locked || isConflict(save.error)}>
            {t(save.isPending ? "saving" : "save")}
          </Button>
        </div>
      </form>
    </section>
  );
}

function EditProtection() {
  const { protectionId = "" } = useParams();
  const device = useDeviceFromRoute();
  const { data } = useProtection(device.id, protectionId);
  return (
    <ProtectionForm
      key={data.protection.id}
      initial={data.protection}
      reasons={data.reasons}
    />
  );
}

export default function ProtectionFormPage({
  edit = false,
}: {
  edit?: boolean;
}) {
  const { t } = useTranslation("protections");
  const can = usePermissions();
  const device = useDeviceFromRoute();
  if (!can("protections:write"))
    return (
      <section className="space-y-4">
        <p role="alert">{t("readOnly")}</p>
        <Button asChild variant="outline">
          <Link to={protectionsPath(device.id)}>{t("back")}</Link>
        </Button>
      </section>
    );
  return edit ? <EditProtection /> : <ProtectionForm key={device.id} />;
}
