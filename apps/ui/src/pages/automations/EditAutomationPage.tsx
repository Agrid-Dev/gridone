import { FC } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ResourceHeader } from "@/components/ResourceHeader";

const EditAutomationPage: FC = () => {
  const { t } = useTranslation("automations");
  const { automationId } = useParams<{ automationId: string }>();
  return (
    <>
      <ResourceHeader
        title={t("actions.edit")}
        resourceName={t("singular")}
        resourceNameLinksBack
        backTo={`/automations/${automationId ?? ""}`}
      />
      <div className="pt-10 text-sm text-muted-foreground">
        {t("comingSoon")}
      </div>
    </>
  );
};

export default EditAutomationPage;
