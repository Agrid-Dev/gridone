import { FC } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ResourceHeader } from "@/components/ResourceHeader";
import AutomationForm from "./components/form/AutomationForm";
import { useAutomation } from "./useAutomation";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";

const EditAutomationPage: FC = () => {
  const { t } = useTranslation("automations");
  const { automationId } = useParams<{ automationId: string }>();
  const { automation } = useAutomation(automationId || "");
  if (!automation) {
    return <NotFoundFallback />;
  }

  return (
    <>
      <ResourceHeader
        title={t("actions.edit")}
        resourceName={t("singular")}
        resourceNameLinksBack
        backTo={`/automations/${automationId ?? ""}`}
      />
      <AutomationForm initialValues={automation} />
    </>
  );
};

export default EditAutomationPage;
