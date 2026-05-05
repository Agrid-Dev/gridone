import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Asset, AssetTreeNode } from "@/api/assets";
import type { CommandTemplateCreatePayload } from "@/api/commands";
import type { Device, DevicesFilter } from "@/api/devices";
import { CommandStep } from "./CommandStep";
import { ReviewStep } from "./ReviewStep";
import { StepSection } from "./StepSection";
import { CommandSummary, TargetSummary } from "./summaries";
import { TargetStep } from "./TargetStep";
import type { CommandWizardState } from "./useCommandWizard";

export type SubmitAction = {
  label: string;
  /** The wizard hands its current ``getCommandPayload()`` result so the
   *  caller doesn't have to read it from the wizard state. ``null`` is
   *  filtered out by the wizard before this fires (the button is gated on
   *  ``commandValid``), so callers can rely on a non-null payload. */
  onAction: (payload: Omit<CommandTemplateCreatePayload, "name">) => void;
};

type CommandWizardProps = {
  /** Form-progression state. The parent owns the hook so it can read
   *  ``commandValid`` / ``getCommandPayload`` for its own submit wiring
   *  (e.g. the standalone wizard composes this with ``useCommandMutations``). */
  wizard: CommandWizardState;
  devices: Device[];
  assetTree: AssetTreeNode[];
  assetsList: Asset[];
  predefinedTarget?: DevicesFilter;
  assetsById?: Record<string, Asset>;
  /** Terminal action: one button at the end of the last visible step. The
   *  standalone wizard wires this to a Dispatch-mutation handler; the
   *  inline action form bubbles the payload up to the automation submit. */
  submitAction: SubmitAction;
  onCancel: () => void;
  /** Fires when the user re-opens an already-submitted wizard via the Edit
   *  affordance. Inline embeddings use this to clear their parent's stale
   *  payload until the user re-confirms. */
  onEdit?: () => void;
};

export function CommandWizard({
  wizard,
  devices,
  assetTree,
  assetsList,
  submitAction,
  onCancel,
  onEdit,
}: CommandWizardProps) {
  const { t } = useTranslation(["devices", "common"]);
  const {
    control,
    setValue,
    values,
    selectedDevices,
    compatibleAttributes,
    targetValid,
    commandValid,
    isPredefined,
    skipReview,
    step,
    isFirstStep,
    submitted,
    reopen,
    handleNext,
    handleBack,
    handleCancel,
    getCommandPayload,
    trigger,
  } = wizard;

  const stateOf = (idx: number) => {
    // Once the user confirms, every visible step collapses to its summary
    // so they get immediate feedback that the command was accepted.
    if (submitted) return "done";
    return idx < step ? "done" : idx === step ? "active" : "pending";
  };

  const onBack = isFirstStep
    ? () => {
        handleCancel();
        onCancel();
      }
    : handleBack;
  const backLabel = isFirstStep
    ? t("common:common.cancel")
    : t("commands.new.back");

  const fireSubmit = async () => {
    // Run RHF validation across the whole form before bubbling the payload —
    // ``commandValid`` is a synchronous derivation; ``trigger`` also surfaces
    // any pending zod-level errors on individual fields.
    const ok = await trigger();
    if (!ok) return;
    const payload = getCommandPayload();
    if (!payload) return;
    submitAction.onAction(payload);
  };

  const handleEdit = () => {
    reopen();
    onEdit?.();
  };

  // ``commandIsLast`` flips the command step's footer into the submit
  // button instead of a Next button.
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
                devices={devices}
                assetTree={assetTree}
                assetsList={assetsList}
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
            <SubmitFooter
              onBack={onBack}
              backLabel={backLabel}
              submitLabel={submitAction.label}
              submitDisabled={!commandValid}
              onSubmit={fireSubmit}
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
              <SubmitFooter
                onBack={onBack}
                backLabel={backLabel}
                submitLabel={submitAction.label}
                submitDisabled={!commandValid}
                onSubmit={fireSubmit}
              />
            </div>
          </StepSection>
        </>
      )}

      {submitted && (
        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" onClick={handleEdit}>
            {t("commands.new.edit")}
          </Button>
        </div>
      )}
    </div>
  );
}

type StepFooterProps = {
  onBack: () => void;
  backLabel: string;
  onNext: () => void;
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
      <Button type="button" onClick={onNext} disabled={nextDisabled}>
        {t("commands.new.next")}
      </Button>
    </div>
  );
}

type SubmitFooterProps = {
  onBack: () => void;
  backLabel: string;
  submitLabel: string;
  submitDisabled?: boolean;
  onSubmit: () => void;
};

function SubmitFooter({
  onBack,
  backLabel,
  submitLabel,
  submitDisabled,
  onSubmit,
}: SubmitFooterProps) {
  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      <Button type="button" variant="outline" onClick={onBack}>
        {backLabel}
      </Button>
      <Button type="button" onClick={onSubmit} disabled={submitDisabled}>
        {submitLabel}
      </Button>
    </div>
  );
}
