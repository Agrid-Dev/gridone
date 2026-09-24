import { useParams } from "react-router";
import { type FC } from "react";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { useAutomation } from "./hooks/useAutomationPage";
import { AutomationEditor } from "./editor/AutomationEditor";

const AutomationPageContent: FC = () => {
  const { automationId } = useParams<{ automationId: string }>();
  if (!automationId) {
    throw new Error("AutomationPage requires an 'automationId' route param");
  }
  const { automation, remove, isDeleting } = useAutomation(automationId);

  return (
    <AutomationEditor
      key={automationId}
      mode={{ kind: "edit", automation }}
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
