import { useParams } from "react-router";
import { type FC } from "react";
import { useTranslation } from "react-i18next";
import { Terminal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DangerZone } from "@/components/DangerZone";
import type { Automation } from "@/api/automations";
import { TriggerPresenter } from "./presenters/TriggerPresenter";
import MetadataPresenter from "./presenters/MetadataPresenter";
import { useAutomation } from "./hooks/useAutomationPage";
import BasePresenter from "./presenters/BasePresenter";
import AutomationExecutionHistory from "./AutomationExecutionHistory";
import EditableCard from "./EditableCard";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import FlowConnector from "./components/FlowConnector";
import CommandTemplatePresenter from "./presenters/CommandTemplatePresenter";
import { useAutomationEdit } from "./hooks/useAutomationEdit";
import TriggerForm from "./form/TriggerForm";
import ActionForm from "./form/ActionForm";
import MetadataForm from "./form/MetadataForm";

/** Extract the underlying templateId from a ``command_template`` action.
 *  The UI only renders/edits this kind today; other providers (e.g.
 *  ``notification``) pass through untouched and yield ``undefined`` here. */
function initialActionTemplateId(automation: Automation): string | undefined {
  if (automation.action.providerId !== "command_template") return undefined;
  const id = automation.action.params.templateId;
  return typeof id === "string" ? id : undefined;
}

const AutomationPage: FC<{ automationId: string }> = ({ automationId }) => {
  const { t } = useTranslation("automations");
  const {
    canWrite,
    editingSection,
    setEditingSection,
    update,
    submittingSection,
  } = useAutomationEdit(automationId);
  const { automation, isLoading, remove, isDeleting } = useAutomation(
    automationId ?? "",
  );

  if (isLoading || !automation) {
    return (
      <section className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </section>
    );
  }

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
              initialValue={initialActionTemplateId(automation)}
              onCancel={() => setEditingSection(null)}
              onSubmit={(result) => {
                if (result.kind === "templateId") {
                  update("action", {
                    action: {
                      providerId: "command_template",
                      params: { templateId: result.templateId },
                    },
                  });
                  return;
                }
                // ``inlineCommand`` lands in commit 3 — placeholder body never
                // emits this kind today, so the branch is unreachable.
                throw new Error("inline command submit not implemented yet");
              }}
            />
          ) : (
            <BasePresenter title={t("flow.actionType.command")} icon={Terminal}>
              <CommandTemplatePresenter
                templateId={initialActionTemplateId(automation) ?? ""}
              />
            </BasePresenter>
          )}
        </EditableCard>
      </div>

      {automationId && (
        <AutomationExecutionHistory automationId={automationId} />
      )}

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
  if (!automationId) {
    return <NotFoundFallback />;
  }
  return <AutomationPage automationId={automationId} />;
};

export default AutomationPageWrapper;
