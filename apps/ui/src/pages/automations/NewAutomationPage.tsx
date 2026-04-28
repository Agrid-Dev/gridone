import { FC } from "react";
import { useTranslation } from "react-i18next";
import { ResourceHeader } from "@/components/ResourceHeader";
import AutomationForm from "./components/form/AutomationForm";

const NewAutomationPage: FC = () => {
  const { t } = useTranslation("automations");
  return (
    <>
      <ResourceHeader
        title={t("actions.create")}
        resourceName={t("title")}
        resourceNameLinksBack
        backTo="/automations"
      />
      <AutomationForm />
    </>
  );
};

export default NewAutomationPage;
