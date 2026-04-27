import { FC } from "react";
import { useTranslation } from "react-i18next";
import { ResourceHeader } from "@/components/ResourceHeader";

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
      <div className="pt-10 text-sm text-muted-foreground">
        {t("comingSoon")}
      </div>
    </>
  );
};

export default NewAutomationPage;
