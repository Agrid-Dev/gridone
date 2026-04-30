import { useParams } from "react-router";
import { type FC } from "react";
import { useTranslation } from "react-i18next";
import { Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DangerZone } from "@/components/DangerZone";
import { AutomationStatusBadge } from "../components/AutomationStatusBadge";
import { TriggerPresenter } from "./presenters/TriggerPresenter";
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

const AutomationPage: FC<{ automationId: string }> = ({ automationId }) => {
  const { t } = useTranslation("automations");
  const {
    canWrite,
    enable,
    disable,
    isToggling,
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
        actions={
          canWrite ? (
            <Button
              variant="outline"
              onClick={() => (automation.enabled ? disable() : enable())}
              disabled={isToggling}
            >
              {t(automation.enabled ? "actions.disable" : "actions.enable")}
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-3">
        <AutomationStatusBadge enabled={automation.enabled} />
        {automation.description && (
          <p className="text-sm leading-relaxed text-foreground/80">
            {automation.description}
          </p>
        )}
      </div>

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
              initialValue={automation.actionTemplateId}
              onCancel={() => setEditingSection(null)}
              onSubmit={(actionTemplateId) =>
                update("action", { actionTemplateId })
              }
            />
          ) : (
            <BasePresenter title={t("flow.actionType.command")} icon={Terminal}>
              <CommandTemplatePresenter
                templateId={automation.actionTemplateId}
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
