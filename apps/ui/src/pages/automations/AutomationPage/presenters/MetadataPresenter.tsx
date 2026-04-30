import { FC } from "react";
import { useTranslation } from "react-i18next";
import { TypographyH4 } from "@/components/ui/typography";

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
    <div className="space-y-2">
      <TypographyH4>{name}</TypographyH4>
      {description ? (
        <p className="text-sm leading-relaxed text-foreground/80">
          {description}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">
          {t("metadata.noDescription")}
        </p>
      )}
    </div>
  );
};

export default MetadataPresenter;
