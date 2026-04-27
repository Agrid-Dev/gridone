import { FC } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ResourceHeader } from "@/components/ResourceHeader";

const AutomationDetail: FC = () => {
  const { t } = useTranslation("automations");
  const { automationId } = useParams<{ automationId: string }>();
  return (
    <>
      <ResourceHeader
        title={automationId ?? t("singular")}
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

export default AutomationDetail;
