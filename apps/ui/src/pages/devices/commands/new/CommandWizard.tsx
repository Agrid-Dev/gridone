import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Asset, AssetTreeNode } from "@/api/assets";
import type { Device } from "@/api/devices";
import { CommandStep } from "./CommandStep";
import { ReviewStep } from "./ReviewStep";
import { StepSection } from "./StepSection";
import { CommandSummary, TargetSummary } from "./summaries";
import { TargetStep } from "./TargetStep";
import { useCommandWizard } from "./useCommandWizard";
import type { WizardContext } from "./types";

type CommandWizardProps = {
  context: WizardContext;
  devices: Device[];
  assetTree: AssetTreeNode[];
  assetsList: Asset[];
  lockedDeviceId?: string;
  lockedAssetId?: string;
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
    isSubmitting,
    handleNext,
    handleBack,
    handleCancel,
    handleSubmit,
  } = useCommandWizard(props);

  const stateOf = (idx: number) =>
    idx < step ? "done" : idx === step ? "active" : "pending";

  const isFirstStep = step === 0;
  const onBack = isFirstStep ? handleCancel : handleBack;
  const backLabel = isFirstStep
    ? t("common:common.cancel")
    : t("commands.new.back");

  return (
    <Card>
      <CardContent className="py-6 space-y-6">
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
              defaultAssetId={props.lockedAssetId}
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

        <StepSection
          number={2}
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
          number={3}
          title={t("commands.new.steps.review")}
          state={stateOf(2)}
        >
          <div className="space-y-5">
            <ReviewStep values={values} selectedDevices={selectedDevices} />
            <StepFooter
              onBack={onBack}
              backLabel={backLabel}
              onSubmit={handleSubmit}
              submitDisabled={isSubmitting || selectedDevices.length === 0}
              submitLabel={
                isSubmitting
                  ? t("commands.new.dispatching")
                  : t("commands.new.dispatch")
              }
            />
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
  onSubmit?: () => void;
  submitDisabled?: boolean;
  submitLabel?: string;
};

function StepFooter({
  onBack,
  backLabel,
  onNext,
  nextDisabled,
  onSubmit,
  submitDisabled,
  submitLabel,
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
      {onSubmit && (
        <Button type="button" onClick={onSubmit} disabled={submitDisabled}>
          {submitLabel}
        </Button>
      )}
    </div>
  );
}
