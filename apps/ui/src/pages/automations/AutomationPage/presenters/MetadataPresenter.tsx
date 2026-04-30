import { FC } from "react";
import { useTranslation } from "react-i18next";
import BasePresenter from "./BasePresenter";
import { AutomationStatusBadge } from "../../components/AutomationStatusBadge";

interface MetadataPresenterProps {
  name: string;
  description: string;
  enabled: boolean;
}

const MetadataPresenter: FC<MetadataPresenterProps> = ({
  name,
  description,
  enabled,
}) => {
  const { t } = useTranslation("automations");

  return (
    <BasePresenter
      title={
        <span className="flex items-center gap-2">
          {name}
          <AutomationStatusBadge enabled={enabled} />
        </span>
      }
    >
      {description ? (
        <p className="text-sm leading-relaxed text-foreground/80">
          {description}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">
          {t("metadata.noDescription")}
        </p>
      )}
    </BasePresenter>
  );
};

export default MetadataPresenter;
