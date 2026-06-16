import { useParams } from "react-router";
import { type FC } from "react";
import { useTranslation } from "react-i18next";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DangerZone } from "@/components/DangerZone";
import { TriggerPresenter } from "./presenters/TriggerPresenter";
import MetadataPresenter from "./presenters/MetadataPresenter";
import { useAutomation } from "./hooks/useAutomationPage";
import AutomationExecutionHistory from "./AutomationExecutionHistory";
import EditableCard from "./EditableCard";
import FlowConnector from "./components/FlowConnector";
import { ActionPresenter } from "./presenters/ActionPresenter";
import { useAutomationEdit } from "./hooks/useAutomationEdit";
import TriggerForm from "./form/TriggerForm";
import ActionForm from "./form/ActionForm";
import MetadataForm from "./form/MetadataForm";

const AutomationPageContent: FC = () => {
  const { automationId } = useParams<{ automationId: string }>();
  const { t } = useTranslation("automations");
  if (!automationId) {
    throw new Error("AutomationPage requires an 'automationId' route param");
  }
  const {
    canWrite,
    editingSection,
    setEditingSection,
    update,
    submittingSection,
  } = useAutomationEdit(automationId);
  const { automation, remove, isDeleting } = useAutomation(automationId);

  return (
    <section className="space-y-8">
      <ResourceHeader
        title={automation.name}
        resourceName={t("title")}
        resourceNameLinksBack
        backTo="/automations"
      />

      <EditableCard
        title={t("metadata.title")}
        variant="ghost"
        editLabel={t("metadata.edit")}
        onClickEdit={
          canWrite && editingSection === null
            ? () => {
                setEditingSection("metadata");
              }
            : undefined
        }
        isSubmitting={submittingSection === "metadata"}
      >
        {editingSection === "metadata" ? (
          <MetadataForm
            initialValue={{
              name: automation.name,
              description: automation.description,
              enabled: automation.enabled,
            }}
            onSubmit={(values) => update("metadata", values)}
            onCancel={() => setEditingSection(null)}
          />
        ) : (
          <MetadataPresenter
            name={automation.name}
            description={automation.description}
            enabled={automation.enabled}
            createdAt={automation.createdAt}
            updatedAt={automation.updatedAt}
            createdBy={automation.createdBy}
          />
        )}
      </EditableCard>

      <div className="space-y-3">
        <EditableCard
          title={t("flow.trigger")}
          onClickEdit={
            canWrite && editingSection === null
              ? () => {
                  setEditingSection("trigger");
                }
              : undefined
          }
          isSubmitting={submittingSection === "trigger"}
        >
          {editingSection === "trigger" ? (
            <TriggerForm
              initialValue={automation.trigger}
              onSubmit={(trigger) => update("trigger", { trigger })}
              onCancel={() => setEditingSection(null)}
            />
          ) : (
            <TriggerPresenter trigger={automation.trigger} />
          )}
        </EditableCard>

        <FlowConnector />

        <EditableCard
          title={t("flow.action")}
          onClickEdit={
            canWrite && editingSection === null
              ? () => {
                  setEditingSection("action");
                }
              : undefined
          }
          isSubmitting={submittingSection === "action"}
        >
          {editingSection === "action" ? (
            <ActionForm
              initialValue={automation.action}
              onCancel={() => setEditingSection(null)}
              onSubmit={(action) => update("action", { action })}
            />
          ) : (
            <ActionPresenter action={automation.action} />
          )}
        </EditableCard>
      </div>

      <AutomationExecutionHistory automationId={automationId} />

      {canWrite && (
        <DangerZone
          onDelete={remove}
          isDeleting={isDeleting}
          confirmTitle={t("deleteConfirm.title")}
          confirmDetails={t("deleteConfirm.details", { name: automation.name })}
          deleteLabel={t("actions.delete")}
        />
      )}
    </section>
  );
};

const AutomationPageWrapper: FC = () => {
  const { automationId } = useParams<{ automationId: string }>();
  return (
    <ResourceBoundary resetKeys={[automationId]}>
      <AutomationPageContent />
    </ResourceBoundary>
  );
};

export default AutomationPageWrapper;
