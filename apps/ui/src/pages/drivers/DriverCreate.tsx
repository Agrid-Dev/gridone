import { FC } from "react";
import { useTranslation } from "react-i18next";
import DriverForm from "./DriverForm";
import { useDrivers } from "./useDrivers";
import { ResourceHeader } from "@/components/ResourceHeader";

const DriverCreate: FC = () => {
  const { t } = useTranslation();
  const { handleCreate } = useDrivers();
  return (
    <div>
      <ResourceHeader
        resourceName={t("drivers.title")}
        title={t("drivers.actions.create")}
        resourceNameLinksBack
      />
      <DriverForm onSubmit={handleCreate} />
    </div>
  );
};

export default DriverCreate;
