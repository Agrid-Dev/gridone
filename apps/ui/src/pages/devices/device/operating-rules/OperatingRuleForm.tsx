import type { ReactNode } from "react";
import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import type { DataType, OperatingRule, OperatingRuleView } from "@gridone/sdk";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { attributeUnit } from "@/lib/attributeUnits";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { usePermissions } from "@/contexts/AuthContext";
import { ConditionRows, ValueInput } from "./ConditionRows";
import { RuleSentence } from "./RuleSentence";
import { defaultScalar, pointAttribute, pointType } from "./expressions";
import { OperatingRuleSummary, WithoutPointIds } from "./OperatingRuleSummary";
import {
  OperatingRuleDiagnostics,
  OperatingRuleError,
} from "./OperatingRuleFeedback";
import {
  isConflict,
  operatingRulePath,
  operatingRulesPath,
  useOperatingRule,
  useOperatingRuleDevices,
  useOperatingRuleForm,
  useOperatingRuleSchemas,
} from "./useOperatingRules";

function Step({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("operatingRules");
  return (
    <section
      aria-labelledby={`operating-rule-step-${number}`}
      className="space-y-4 rounded-xl border bg-card p-5"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">
          {t("step", { number })}
        </span>
        <h3 id={`operating-rule-step-${number}`} className="font-semibold">
          {title}
        </h3>
      </div>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {children}
    </section>
  );
}

export function OperatingRuleForm({
  initial,
  reasons,
}: {
  initial?: OperatingRule;
  reasons?: OperatingRuleView["reasons"];
}) {
  const { t } = useTranslation("operatingRules");
  const attributeLabel = useAttributeLabel();
  const device = useDeviceFromRoute();
  const { data: schemas } = useOperatingRuleSchemas();
  const { data: devices } = useOperatingRuleDevices();
  const state = useOperatingRuleForm(device.id, schemas, initial);
  const { form, base, save, reload, latest } = state;
  const catalog = { devices, contracts: base?.points };
  const target = form.watch("target");
  const condition = form.watch("condition");
  const type = pointType(catalog, target);
  const writable = Object.entries(device.attributes ?? {}).filter(
    ([, attribute]) =>
      Array.isArray(attribute.read_write_modes) &&
      attribute.read_write_modes.includes("write"),
  );
  const missingAttribute =
    !!target.attribute && !writable.some(([name]) => name === target.attribute);
  const back = initial
    ? operatingRulePath(initial)
    : operatingRulesPath(device.id);
  const invalid = Object.keys(form.formState.errors).length > 0;
  const locked = save.isPending || reload.isPending || !!base?.retirement;
  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t(initial ? "edit" : "create")}
        caption={t("onDevice", { device: device.name })}
      />
      <OperatingRuleDiagnostics reasons={reasons} />
      {base?.retirement && <p role="status">{t("retiredHelp")}</p>}
      <form onSubmit={state.submit} className="space-y-4" noValidate>
        <fieldset disabled={locked} className="space-y-4">
          <Step
            number={1}
            title={t("targetStep")}
            description={t("targetHelp")}
          >
            <Controller
              name="target"
              control={form.control}
              render={({ field }) => (
                <div className="flex flex-wrap items-center gap-2 text-base">
                  <span className="text-muted-foreground">
                    {t("whenSomeoneSets")}
                  </span>
                  <Select
                    value={field.value.attribute}
                    onValueChange={(attribute) => {
                      const next = { ...field.value, attribute };
                      field.onChange({
                        ...next,
                        value: defaultScalar(pointType(catalog, next)),
                      });
                    }}
                  >
                    <SelectTrigger
                      aria-label={t("attribute")}
                      aria-invalid={missingAttribute}
                      aria-describedby={
                        missingAttribute
                          ? "operating-rule-attribute-gone"
                          : undefined
                      }
                      className={
                        missingAttribute ? "w-56 border-destructive" : "w-56"
                      }
                    >
                      <SelectValue placeholder={t("chooseAttribute")} />
                    </SelectTrigger>
                    <SelectContent>
                      {missingAttribute && (
                        <SelectItem value={field.value.attribute}>
                          {t("missing", { id: field.value.attribute })}
                        </SelectItem>
                      )}
                      {writable.map(([name, attribute]) => (
                        <SelectItem key={name} value={name}>
                          {attributeLabel(name, attribute)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">{t("toValue")}</span>
                  <ValueInput
                    label={t("requestedValue")}
                    value={field.value.value}
                    type={type}
                    unit={attributeUnit(
                      field.value.attribute,
                      pointAttribute(catalog, field.value),
                    )}
                    onChange={(value) =>
                      field.onChange({ ...field.value, value })
                    }
                    className="w-40"
                  />
                  <span className="text-muted-foreground">
                    {t("onDeviceInline", { device: device.name })}
                  </span>
                  {missingAttribute && (
                    <p
                      id="operating-rule-attribute-gone"
                      className="w-full text-sm text-destructive"
                    >
                      {t("attributeGone", { id: field.value.attribute })}
                    </p>
                  )}
                </div>
              )}
            />
          </Step>

          <Step
            number={2}
            title={t("allowWhen")}
            description={t("conditionHelp")}
          >
            <Controller
              name="condition"
              control={form.control}
              render={({ field }) => (
                <ConditionRows
                  catalog={catalog}
                  candidateType={type as DataType | undefined}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            <Controller
              name="max_age_seconds"
              control={form.control}
              render={({ field, fieldState }) => (
                <div className="space-y-3 border-t pt-4">
                  {/* Settings-row layout: a vertical Field stretches every
                      child to full width, which would blow up the switch. */}
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel htmlFor="operating-rule-freshness">
                        {t("freshnessCheck")}
                      </FieldLabel>
                      <FieldDescription>{t("freshnessHelp")}</FieldDescription>
                    </FieldContent>
                    <Switch
                      id="operating-rule-freshness"
                      checked={field.value != null}
                      onCheckedChange={(checked) =>
                        field.onChange(checked ? 60 : null)
                      }
                    />
                  </Field>
                  {field.value != null && (
                    <FieldShell
                      id="operating-rule-max-age"
                      label={t("maxAge")}
                      description={t("maxAgeHelp")}
                      required
                      invalid={fieldState.invalid}
                      error={
                        fieldState.error
                          ? { type: "validate", message: t("maxAgeInvalid") }
                          : undefined
                      }
                    >
                      <Input
                        id="operating-rule-max-age"
                        type="number"
                        min="0"
                        step="any"
                        className="w-40"
                        name={field.name}
                        ref={field.ref}
                        value={Number.isFinite(field.value) ? field.value : ""}
                        onChange={(event) =>
                          field.onChange(event.target.valueAsNumber)
                        }
                        onBlur={field.onBlur}
                        aria-invalid={fieldState.invalid}
                      />
                    </FieldShell>
                  )}
                </div>
              )}
            />
          </Step>

          <Step number={3} title={t("nameStep")}>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldShell
                id="operating-rule-name"
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
                  id="operating-rule-name"
                  {...form.register("name")}
                  aria-invalid={!!form.formState.errors.name}
                />
              </FieldShell>
              <FieldShell
                id="operating-rule-explanation"
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
                  id="operating-rule-explanation"
                  {...form.register("explanation")}
                  aria-invalid={!!form.formState.errors.explanation}
                />
              </FieldShell>
            </div>
          </Step>
        </fieldset>

        {invalid && (
          <p role="alert" className="text-sm text-destructive">
            {t("formInvalid")}
          </p>
        )}
        <OperatingRuleError error={reload.error ?? save.error} />
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
                <WithoutPointIds>
                  <OperatingRuleSummary
                    rule={latest}
                    catalog={{ devices, contracts: latest.points }}
                  />
                </WithoutPointIds>
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

        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-xl border border-primary/25 bg-accent p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">
              {t("inPlainWords")}
            </p>
            <RuleSentence
              rule={{ target, condition }}
              catalog={catalog}
              className="text-accent-foreground"
            />
          </div>
          <div className="flex shrink-0 gap-3">
            <Button asChild type="button" variant="outline">
              <Link to={back}>{t("cancel")}</Link>
            </Button>
            <Button type="submit" disabled={locked || isConflict(save.error)}>
              {t(save.isPending ? "saving" : "save")}
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t("limits")}</p>
      </form>
    </section>
  );
}

function EditOperatingRule() {
  const { operatingRuleId = "" } = useParams();
  const device = useDeviceFromRoute();
  const { data } = useOperatingRule(device.id, operatingRuleId);
  return (
    <OperatingRuleForm
      key={data.operating_rule.id}
      initial={data.operating_rule}
      reasons={data.reasons}
    />
  );
}

export default function OperatingRuleFormPage({
  edit = false,
}: {
  edit?: boolean;
}) {
  const { t } = useTranslation("operatingRules");
  const can = usePermissions();
  const device = useDeviceFromRoute();
  if (!can("operating_rules:write"))
    return (
      <section className="space-y-4">
        <p role="alert">{t("readOnly")}</p>
        <Button asChild variant="outline">
          <Link to={operatingRulesPath(device.id)}>{t("back")}</Link>
        </Button>
      </section>
    );
  return edit ? <EditOperatingRule /> : <OperatingRuleForm key={device.id} />;
}
