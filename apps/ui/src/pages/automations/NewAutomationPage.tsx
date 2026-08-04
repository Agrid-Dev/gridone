import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { Card } from "@/components/ui/card";
import { ResourceHeader } from "@/components/ResourceHeader";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { cn } from "@/lib/utils";
import EditableCard from "./AutomationPage/EditableCard";
import FlowConnector from "./AutomationPage/components/FlowConnector";
import MetadataForm from "./AutomationPage/form/MetadataForm";
import MetadataPresenter from "./AutomationPage/presenters/MetadataPresenter";
import TriggerForm from "./AutomationPage/form/TriggerForm";
import { TriggerPresenter } from "./AutomationPage/presenters/TriggerPresenter";
import ActionForm from "./AutomationPage/form/ActionForm";
import { RuleSentence } from "./components/RuleSentence";
import {
  DEFAULT_METADATA,
  useCreateAutomation,
  WIZARD_STEPS,
  type WizardStep,
} from "./AutomationPage/hooks/useCreateAutomation";

const WIZARD_FORM_ID = "new-automation-wizard-form";

const NewAutomationPage: FC = () => {
  const { t } = useTranslation(["automations", "common"]);
  const {
    currentStep,
    metadata,
    trigger,
    action,
    setAction,
    submitMetadata,
    submitTrigger,
    submitAction,
    goPrevious,
    isSubmitting,
  } = useCreateAutomation();

  useBreadcrumb([{ to: "/automations/new", labelKey: "breadcrumb.new" }]);

  const onTrigger = currentStep !== "metadata";
  const onAction = currentStep === "action";
  const nextLabel = onAction
    ? t("common:common.submit")
    : t("common:common.next");
  // On the action step the parent button drives submit but the form's
  // gate is ``result``-based (no required fields to react-hook-form-validate
  // against), so we surface readiness here.
  const submitDisabled = isSubmitting || (onAction && !action);

  return (
    <section className="space-y-6">
      <ResourceHeader title={t("automations:actions.create")} />

      <StepIndicator currentStep={currentStep} />

      <Card className="border-dashed bg-muted/20 p-4">
        <p className="font-display text-base font-semibold">
          {metadata?.name || t("automations:wizard.untitled")}
        </p>
        <RuleSentence trigger={trigger} action={action} className="mt-2.5" />
      </Card>

      <EditableCard
        title={t("automations:metadata.title")}
        className={cn(currentStep === "metadata" && "border-primary/50")}
      >
        {currentStep === "metadata" ? (
          <MetadataForm
            formId={WIZARD_FORM_ID}
            hideActions
            initialValue={metadata ?? DEFAULT_METADATA}
            onSubmit={submitMetadata}
            onCancel={goPrevious}
          />
        ) : (
          metadata && (
            <MetadataPresenter
              name={metadata.name}
              description={metadata.description}
              enabled={metadata.enabled}
            />
          )
        )}
      </EditableCard>

      {onTrigger && (
        <div className="space-y-3">
          <EditableCard
            title={t("automations:flow.trigger")}
            className={cn(currentStep === "trigger" && "border-primary/50")}
          >
            {currentStep === "trigger" ? (
              <TriggerForm
                formId={WIZARD_FORM_ID}
                hideActions
                initialValue={trigger ?? undefined}
                onSubmit={submitTrigger}
                onCancel={goPrevious}
              />
            ) : (
              trigger && <TriggerPresenter trigger={trigger} />
            )}
          </EditableCard>

          {onAction && (
            <>
              <FlowConnector />
              <EditableCard
                title={t("automations:flow.action")}
                isSubmitting={isSubmitting}
                className="border-primary/50"
              >
                <ActionForm
                  formId={WIZARD_FORM_ID}
                  hideActions
                  initialValue={action ?? undefined}
                  onChange={setAction}
                  onSubmit={submitAction}
                  onCancel={goPrevious}
                />
              </EditableCard>
            </>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={goPrevious}
          disabled={isSubmitting}
        >
          {t("common:common.previous")}
        </Button>
        <Button type="submit" form={WIZARD_FORM_ID} disabled={submitDisabled}>
          {nextLabel}
        </Button>
      </div>
    </section>
  );
};

/** Three-step progress strip: done steps get a check, the active step is
 *  highlighted, upcoming steps stay muted. */
function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const { t } = useTranslation("automations");
  const currentIndex = WIZARD_STEPS.indexOf(currentStep);
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {WIZARD_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step} className="flex items-center gap-3">
            {index > 0 && <span aria-hidden className="h-px w-6 bg-border" />}
            <span
              className={cn(
                "flex items-center gap-2 text-sm",
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
              aria-current={active ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums",
                  done && "bg-primary/10 text-primary",
                  active && "bg-primary text-primary-foreground",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check aria-hidden className="h-3 w-3" /> : index + 1}
              </span>
              {t(`wizard.steps.${step}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default NewAutomationPage;
