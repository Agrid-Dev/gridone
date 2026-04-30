import { FC } from "react";
import { useTranslation } from "react-i18next";
import BasePresenter from "./BasePresenter";

interface MetadataPresenterProps {
  name: string;
  description: string;
}

const MetadataPresenter: FC<MetadataPresenterProps> = ({
  name,
  description,
}) => {
  const { t } = useTranslation("automations");

  return (
    <BasePresenter title={name}>
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
