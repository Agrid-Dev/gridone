import { FC } from "react";
import { useTranslation } from "react-i18next";
import DriverForm from "./DriverForm";
import { useDriverPackage } from "./useDriverPackage";
import { DriverDiagnostics } from "./DriverDiagnostics";
import { ResourceHeader } from "@/components/ResourceHeader";

const DriverCreate: FC = () => {
  const { t } = useTranslation("drivers");
  const { submit, blocked, pending, diagnostics, error } = useDriverPackage();
  return (
    <div className="space-y-6">
      <ResourceHeader title={t("actions.create")} />
      <DriverDiagnostics diagnostics={diagnostics} />
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <DriverForm onSubmit={submit} disabled={blocked} pending={pending} />
    </div>
  );
};

export default DriverCreate;
