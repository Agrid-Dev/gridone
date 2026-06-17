import { FC } from "react";
import { useTranslation } from "react-i18next";
import DriverForm from "./DriverForm";
import { useDrivers } from "./useDrivers";
import { ResourceHeader } from "@/components/ResourceHeader";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";

const DriverCreate: FC = () => {
  const { t } = useTranslation("drivers");
  const { handleCreate } = useDrivers();
  useBreadcrumb([{ to: "/drivers/new", labelKey: "breadcrumb.new" }]);
  return (
    <div>
      <ResourceHeader resourceName={t("title")} title={t("actions.create")} />
      <DriverForm onSubmit={handleCreate} />
    </div>
  );
};

export default DriverCreate;
