import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { ResourceHeader } from "@/components/ResourceHeader";
import EditableCard from "./AutomationPage/EditableCard";
import FlowConnector from "./AutomationPage/components/FlowConnector";
import MetadataForm from "./AutomationPage/form/MetadataForm";
import MetadataPresenter from "./AutomationPage/presenters/MetadataPresenter";
import TriggerForm from "./AutomationPage/form/TriggerForm";
import { TriggerPresenter } from "./AutomationPage/presenters/TriggerPresenter";
import ActionForm from "./AutomationPage/form/ActionForm";
import {
  DEFAULT_METADATA,
  useCreateAutomation,
} from "./AutomationPage/hooks/useCreateAutomation";

const WIZARD_FORM_ID = "new-automation-wizard-form";

const NewAutomationPage: FC = () => {
  const { t } = useTranslation(["automations", "common"]);
  const {
    currentStep,
    metadata,
    trigger,
    action,
    submitMetadata,
    submitTrigger,
    submitAction,
    goPrevious,
    isSubmitting,
  } = useCreateAutomation();

  // Re-seed the action form when the user navigates back and forth: the
  // template-id branch carries a string the picker can pre-select; an
  // ``inlineCommand`` payload is form state that lives inside the wizard
  // so we don't pre-seed the picker for it.
  const initialActionTemplateId =
    action?.kind === "templateId" ? action.templateId : undefined;

  const onTrigger = currentStep !== "metadata";
  const onAction = currentStep === "action";
  const nextLabel = onAction
    ? t("common:common.submit")
    : t("common:common.next");

  return (
    <section className="space-y-8">
      <ResourceHeader
        title={t("automations:actions.create")}
        resourceName={t("automations:title")}
        resourceNameLinksBack
        backTo="/automations"
      />

      <EditableCard title={t("automations:metadata.title")} variant="ghost">
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
          <EditableCard title={t("automations:flow.trigger")}>
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
              >
                <ActionForm
                  formId={WIZARD_FORM_ID}
                  hideActions
                  initialValue={initialActionTemplateId}
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
        <Button type="submit" form={WIZARD_FORM_ID} disabled={isSubmitting}>
          {nextLabel}
        </Button>
      </div>
    </section>
  );
};

export default NewAutomationPage;
