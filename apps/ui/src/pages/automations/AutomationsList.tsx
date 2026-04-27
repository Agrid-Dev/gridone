import { FC } from "react";
import { useTranslation } from "react-i18next";
import { ResourceHeader } from "@/components/ResourceHeader";

const AutomationsList: FC = () => {
  const { t } = useTranslation("automations");
  return (
    <>
      <ResourceHeader title={t("title")} resourceName={t("subtitle")} />
      <div className="pt-10 text-sm text-muted-foreground">
        {t("comingSoon")}
      </div>
    </>
  );
};

export default AutomationsList;
