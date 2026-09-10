import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Button } from "@/components/ui";
import { usePermissions } from "@/contexts/AuthContext";
import { useDriverFromRoute } from "./useDrivers";
import { useDriverReplacement } from "./useDriverPackage";
import { DriverDiagnostics } from "./DriverDiagnostics";
import DriverForm from "./DriverForm";

function DriverEditContent() {
  const driver = useDriverFromRoute();
  const { t } = useTranslation("drivers");
  const can = usePermissions();
  const {
    query,
    submit,
    blocked,
    pending,
    conflict,
    diagnostics,
    error,
    reload,
  } = useDriverReplacement(driver.id);
  return (
    <div className="space-y-6">
      <ResourceHeader
        title={t("package.replaceTitle", { driverId: driver.id })}
      />
      <p>{t("package.replaceHint")}</p>
      {query.data && (
        <p className="break-all text-sm">
          {t("package.revision")}: <code>{query.data.revision}</code>
        </p>
      )}
      {(conflict || query.isError) && (
        <div role="alert" className="space-y-2">
          <p>{t(conflict ? "package.conflict" : "package.statusFailed")}</p>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void reload()}
          >
            {t("package.reload")}
          </Button>
        </div>
      )}
      {query.isPending && <p role="status">{t("package.loading")}</p>}
      <DriverDiagnostics diagnostics={diagnostics} />
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {can("drivers:write") && (
        <DriverForm
          driverId={driver.id}
          onSubmit={submit}
          disabled={blocked}
          pending={pending}
        />
      )}
    </div>
  );
}

export default function DriverEdit() {
  const { driverId } = useParams();
  return (
    <ResourceBoundary resetKeys={[driverId]}>
      <DriverEditContent key={driverId} />
    </ResourceBoundary>
  );
}
