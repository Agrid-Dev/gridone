import { FC } from "react";
import { useTranslation } from "react-i18next";
import DriverForm from "./DriverForm";
import { useDrivers } from "./useDrivers";
import { ResourceHeader } from "@/components/ResourceHeader";

const DriverCreate: FC = () => {
  const { t } = useTranslation("drivers");
  const { handleCreate } = useDrivers();
  return (
    <div>
      <ResourceHeader
        resourceName={t("title")}
        title={t("actions.create")}
        resourceNameLinksBack
        backTo="/drivers"
      />
      <DriverForm onSubmit={handleCreate} />
    </div>
  );
};

export default DriverCreate;
