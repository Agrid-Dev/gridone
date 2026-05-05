import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ApiError } from "@/api/apiError";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Controller } from "react-hook-form";
import type { Asset, AssetTreeNode } from "@/api/assets";
import type {
  CommandTemplate,
  CommandTemplateCreatePayload,
} from "@/api/commands";
import type { Device, DevicesFilter } from "@/api/devices";
import { CommandStep } from "./CommandStep";
import { ReviewStep } from "./ReviewStep";
import { StepSection } from "./StepSection";
import { CommandSummary, TargetSummary } from "./summaries";
import { TargetStep } from "./TargetStep";
import { type DispatchResult, useCommandWizard } from "./useCommandWizard";

type OverrideAction = {
  label: string;
  onAction: (payload: Omit<CommandTemplateCreatePayload, "name">) => void;
};

type CommandWizardProps = {
  devices: Device[];
  assetTree: AssetTreeNode[];
  assetsList: Asset[];
  /** When set, the target step is skipped and the wizard opens at the command
   *  step. The filter is treated as the authoritative target on dispatch /
   *  save. See useCommandWizard for semantics. */
  predefinedTarget?: DevicesFilter;
  assetsById?: Record<string, Asset>;
  /** When true, drop the review step. The actions area moves to the bottom
   *  of the command step. Used by the automation action form, which has its
   *  own global review surface. */
  skipReview?: boolean;
  /** When provided, replace the wizard's terminal Save + Dispatch buttons
   *  (and the name input above them) with a single button. Clicking it
   *  builds the (target, write) pair and hands it to the parent via
   *  ``onAction`` — the parent is responsible for whatever happens next
   *  (e.g. saving as an unnamed template + creating the automation). */
  overrideAction?: OverrideAction;
  onCancel: () => void;
  /** Required unless an ``overrideAction`` is provided — the standalone
   *  wizard's Save / Dispatch buttons feed these. */
  onDispatched?: (result: DispatchResult) => void;
  onSaved?: (template: CommandTemplate) => void;
};

export function CommandWizard(props: CommandWizardProps) {
  const { t } = useTranslation(["devices", "common"]);
  const skipReview = props.skipReview ?? false;
  const {
    control,
    setValue,
    values,
    step,
    selectedDevices,
    compatibleAttributes,
    targetValid,
    commandValid,
    isPredefined,
    isFirstStep,
    isDispatching,
    isSaving,
    dispatchError,
    saveError,
    handleNext,
    handleBack,
    handleCancel,
    handleDispatch,
    handleSave,
    getCommandPayload,
  } = useCommandWizard({
    devices: props.devices,
    predefinedTarget: props.predefinedTarget,
    skipReview,
    onDispatched: props.onDispatched,
    onSaved: props.onSaved,
  });

  // Error toasts (dispatch + save share the same surface). Fires once per
  // distinct error instance rather than on every render.
  const error = dispatchError ?? saveError;
  useEffect(() => {
    if (!error) return;
    const detail =
      error instanceof ApiError ? error.detail || error.message : error.message;
    toast.error(String(detail));
  }, [error]);

  const stateOf = (idx: number) =>
    idx < step ? "done" : idx === step ? "active" : "pending";

  const onBack = isFirstStep
    ? () => {
        handleCancel();
        props.onCancel();
      }
    : handleBack;
  const backLabel = isFirstStep
    ? t("common:common.cancel")
    : t("commands.new.back");

  const templateName = (values.templateName ?? "").trim();
  const canSave =
    templateName.length > 0 && !isSaving && selectedDevices.length > 0;

  const handleOverride = () => {
    const payload = getCommandPayload();
    if (payload) props.overrideAction?.onAction(payload);
  };

  // The "command step is the last visitable step" branch: when skipReview
  // is true, the actions block lives at the bottom of the command step
  // instead of inside the review step. ``commandIsLast`` keeps the
  // step-footer logic readable.
  const commandIsLast = skipReview;

  return (
    <div className="space-y-6">
      {!isPredefined && (
        <>
          <StepSection
            number={1}
            title={t("commands.new.steps.target")}
            state={stateOf(0)}
            summary={<TargetSummary selectedDevices={selectedDevices} />}
          >
            <div className="space-y-5">
              <TargetStep
                control={control}
                devices={props.devices}
                assetTree={props.assetTree}
                assetsList={props.assetsList}
              />
              <StepFooter
                onBack={onBack}
                backLabel={backLabel}
                onNext={handleNext}
                nextDisabled={!targetValid}
              />
            </div>
          </StepSection>

          <Separator />
        </>
      )}

      <StepSection
        number={isPredefined ? 1 : 2}
        title={t("commands.new.steps.command")}
        state={stateOf(1)}
        summary={<CommandSummary values={values} />}
      >
        <div className="space-y-5">
          <CommandStep
            control={control}
            setValue={setValue}
            attributes={compatibleAttributes}
            selectedDevices={selectedDevices}
            selectedAttribute={values.attribute}
            selectedDataType={values.attributeDataType}
          />
          {commandIsLast ? (
            <ActionsArea
              control={control}
              showNameInput={!props.overrideAction}
              backLabel={backLabel}
              onBack={onBack}
              isDispatching={isDispatching}
              isSaving={isSaving}
              canSave={canSave}
              canDispatch={selectedDevices.length > 0}
              commandValid={commandValid}
              onDispatch={handleDispatch}
              onSave={handleSave}
              overrideAction={props.overrideAction}
              onOverride={handleOverride}
              t={t}
            />
          ) : (
            <StepFooter
              onBack={onBack}
              backLabel={backLabel}
              onNext={handleNext}
              nextDisabled={!commandValid}
            />
          )}
        </div>
      </StepSection>

      {!skipReview && (
        <>
          <Separator />

          <StepSection
            number={isPredefined ? 2 : 3}
            title={t("commands.new.steps.review")}
            state={stateOf(2)}
          >
            <div className="space-y-5">
              <ReviewStep values={values} selectedDevices={selectedDevices} />
              <ActionsArea
                control={control}
                showNameInput={!props.overrideAction}
                backLabel={backLabel}
                onBack={onBack}
                isDispatching={isDispatching}
                isSaving={isSaving}
                canSave={canSave}
                canDispatch={selectedDevices.length > 0}
                commandValid={commandValid}
                onDispatch={handleDispatch}
                onSave={handleSave}
                overrideAction={props.overrideAction}
                onOverride={handleOverride}
                t={t}
              />
            </div>
          </StepSection>
        </>
      )}
    </div>
  );
}

type StepFooterProps = {
  onBack: () => void;
  backLabel: string;
  onNext?: () => void;
  nextDisabled?: boolean;
};

function StepFooter({
  onBack,
  backLabel,
  onNext,
  nextDisabled,
}: StepFooterProps) {
  const { t } = useTranslation("devices");
  return (
    <div className="flex items-center justify-between pt-2">
      <Button type="button" variant="outline" onClick={onBack}>
        {backLabel}
      </Button>
      {onNext && (
        <Button type="button" onClick={onNext} disabled={nextDisabled}>
          {t("commands.new.next")}
        </Button>
      )}
    </div>
  );
}

type ActionsAreaProps = {
  control: ReturnType<typeof useCommandWizard>["control"];
  showNameInput: boolean;
  backLabel: string;
  onBack: () => void;
  isDispatching: boolean;
  isSaving: boolean;
  canSave: boolean;
  canDispatch: boolean;
  commandValid: boolean;
  onDispatch: () => void;
  onSave: () => void;
  overrideAction: OverrideAction | undefined;
  onOverride: () => void;
  t: ReturnType<typeof useTranslation>["t"];
};

function ActionsArea({
  control,
  showNameInput,
  backLabel,
  onBack,
  isDispatching,
  isSaving,
  canSave,
  canDispatch,
  commandValid,
  onDispatch,
  onSave,
  overrideAction,
  onOverride,
  t,
}: ActionsAreaProps) {
  return (
    <>
      {showNameInput && (
        <div className="space-y-3 rounded-md border bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground">
            {t("commands.new.save.hint")}
          </p>
          <Controller
            control={control}
            name="templateName"
            render={({ field }) => (
              <Field>
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
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          {backLabel}
        </Button>
        {overrideAction ? (
          <Button type="button" onClick={onOverride} disabled={!commandValid}>
            {overrideAction.label}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
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
            <Button
              type="button"
              onClick={onDispatch}
              disabled={isDispatching || !canDispatch}
            >
              {isDispatching
                ? t("commands.new.dispatching")
                : t("commands.new.dispatch")}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
