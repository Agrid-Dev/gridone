import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ApiError } from "@/api/apiError";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Controller } from "react-hook-form";
import type { Asset, AssetTreeNode } from "@/api/assets";
import type { CommandTemplate } from "@/api/commands";
import type { Device, DevicesFilter } from "@/api/devices";
import { CommandStep } from "./CommandStep";
import { ReviewStep } from "./ReviewStep";
import { StepSection } from "./StepSection";
import { CommandSummary, TargetSummary } from "./summaries";
import { TargetStep } from "./TargetStep";
import { type DispatchResult, useCommandWizard } from "./useCommandWizard";

type CommandWizardProps = {
  devices: Device[];
  assetTree: AssetTreeNode[];
  assetsList: Asset[];
  /** When set, the target step is skipped and the wizard opens at the command
   *  step. The filter is treated as the authoritative target on dispatch /
   *  save. See useCommandWizard for semantics. */
  predefinedTarget?: DevicesFilter;
  assetsById?: Record<string, Asset>;
  onCancel: () => void;
  onDispatched: (result: DispatchResult) => void;
  onSaved: (template: CommandTemplate) => void;
};

export function CommandWizard(props: CommandWizardProps) {
  const { t } = useTranslation("devices");
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
  } = useCommandWizard({
    devices: props.devices,
    predefinedTarget: props.predefinedTarget,
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

  return (
    <Card>
      <CardContent className="py-6 space-y-6">
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
            <StepFooter
              onBack={onBack}
              backLabel={backLabel}
              onNext={handleNext}
              nextDisabled={!commandValid}
            />
          </div>
        </StepSection>

        <Separator />

        <StepSection
          number={isPredefined ? 2 : 3}
          title={t("commands.new.steps.review")}
          state={stateOf(2)}
        >
          <div className="space-y-5">
            <ReviewStep values={values} selectedDevices={selectedDevices} />

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

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onBack}>
                {backLabel}
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSave}
                  disabled={!canSave}
                >
                  {isSaving
                    ? t("commands.new.save.saving")
                    : t("commands.new.save.action")}
                </Button>
                <Button
                  type="button"
                  onClick={handleDispatch}
                  disabled={isDispatching || selectedDevices.length === 0}
                >
                  {isDispatching
                    ? t("commands.new.dispatching")
                    : t("commands.new.dispatch")}
                </Button>
              </div>
            </div>
          </div>
        </StepSection>
      </CardContent>
    </Card>
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
