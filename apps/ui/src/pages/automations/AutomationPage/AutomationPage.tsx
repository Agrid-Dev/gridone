import { useParams } from "react-router";
import { type FC } from "react";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { useAutomation } from "./hooks/useAutomationPage";
import AutomationWorkspace from "./AutomationWorkspace";

const AutomationPageContent: FC = () => {
  const { automationId } = useParams<{ automationId: string }>();
  if (!automationId) {
    throw new Error("AutomationPage requires an 'automationId' route param");
  }
  const { automation, remove, isDeleting } = useAutomation(automationId);

  return (
    <AutomationWorkspace
      automationId={automationId}
      automation={automation}
      onDelete={remove}
      isDeleting={isDeleting}
    />
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
