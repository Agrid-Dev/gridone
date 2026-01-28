import { FC } from "react";
import { useTranslation } from "react-i18next";
import { TypographyEyebrow, TypographyH2 } from "@/components/ui/typography";
import DriverForm from "./DriverForm";
import { useDrivers } from "./useDrivers";
const DriverCreate: FC = () => {
  const { t } = useTranslation();
  const { handleCreate } = useDrivers();
  return (
    <div>
      <div className="mb-4">
        <TypographyEyebrow>{t("drivers.title")}</TypographyEyebrow>
        <div className="mt-1">
          <TypographyH2>{t("drivers.new")}</TypographyH2>
        </div>
      </div>
      <DriverForm onSubmit={handleCreate} />
    </div>
  );
};

export default DriverCreate;
