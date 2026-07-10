import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { GridoneError, type Asset, type Device } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Controller } from "react-hook-form";
import type { AssetTreeNode } from "@/lib/assets";
import type { DevicesFilter } from "@/lib/devices";
import { CommandStep } from "./CommandStep";
import { ReviewStep } from "./ReviewStep";
import { StepSection } from "./StepSection";
import { CommandSummary, TargetSummary } from "./summaries";
import { TargetStep } from "./TargetStep";
import type { useCommandWizard } from "./useCommandWizard";

export type CommandWizardSubmitSlot = {
  label: string;
  /** Called with the materialized templateId after a successful commit
   *  (POST or PATCH). The slot decides what to do next — navigate, dispatch,
   *  attach to an automation. */
  onSubmit: (templateId: string) => void | Promise<void>;
};

type CommandWizardProps = {
  wizard: ReturnType<typeof useCommandWizard>;
  devices: Device[];
  assetTree: AssetTreeNode[];
  assetsList: Asset[];
  assetsById?: Record<string, Asset>;
  predefinedTarget?: DevicesFilter;
  /** "Save with the user-entered name". Renders the name input + Save button
   *  in the review step. */
  saveSubmit?: CommandWizardSubmitSlot;
  /** "Commit ephemeral, then act on the templateId". The standalone wizard
   *  uses this for Dispatch; future inline-action use ("Use this command")
   *  also goes through this slot. */
  dispatchSubmit?: CommandWizardSubmitSlot;
  onCancel: () => void;
};

export function CommandWizard(props: CommandWizardProps) {
  const { t } = useTranslation(["devices", "common"]);
  const { wizard, saveSubmit, dispatchSubmit } = props;
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
    canSave,
    canDispatch,
    isCommitting,
    commitError,
    handleNext,
    handleBack,
    clearDraft,
  } = wizard;

  // Error toasts — fires once per distinct error instance.
  useEffect(() => {
    if (!commitError) return;
    const detail =
      commitError instanceof GridoneError
        ? commitError.detail || commitError.message
        : commitError.message;
    toast.error(String(detail));
  }, [commitError]);

  const stateOf = (idx: number) =>
    idx < step ? "done" : idx === step ? "active" : "pending";

  const onBack = isFirstStep
    ? () => {
        clearDraft();
        props.onCancel();
      }
    : handleBack;
  const backLabel = isFirstStep
    ? t("common:common.cancel")
    : t("commands.new.back");

  const handleSave = async () => {
    if (!saveSubmit) return;
    const id = await wizard.save();
    if (id) await saveSubmit.onSubmit(id);
  };

  const handleDispatch = async () => {
    if (!dispatchSubmit) return;
    const id = await wizard.dispatch();
    if (id) await dispatchSubmit.onSubmit(id);
  };

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

            {saveSubmit && (
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
              <div className="flex items-center gap-2">
                {saveSubmit && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSave}
                    disabled={!canSave}
                  >
                    {isCommitting
                      ? t("commands.new.save.saving")
                      : saveSubmit.label}
                  </Button>
                )}
                {dispatchSubmit && (
                  <Button
                    type="button"
                    onClick={handleDispatch}
                    disabled={!canDispatch}
                  >
                    {isCommitting
                      ? t("commands.new.dispatching")
                      : dispatchSubmit.label}
                  </Button>
                )}
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
