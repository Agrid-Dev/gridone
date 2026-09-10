import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { useDriverPresentation } from "./useDriverPackage";
import { DriverDiagnostics } from "./DriverDiagnostics";

export function DriverPresentationStatus({ driverId }: { driverId: string }) {
  const { t } = useTranslation("drivers");
  const query = useDriverPresentation(driverId);
  return (
    <section aria-label={t("package.presentation")} className="space-y-3">
      <h3 className="text-lg font-semibold">{t("package.presentation")}</h3>
      {query.isPending ? (
        <p role="status">{t("package.loading")}</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{t("package.statusFailed")}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t("package.reload")}
          </Button>
        </div>
      ) : (
        <>
          <p>
            {t(
              query.data === null
                ? "package.none"
                : query.data.status === "available"
                  ? "package.available"
                  : "package.unavailable",
            )}
          </p>
          {query.data && (
            <p className="break-all text-sm text-muted-foreground">
              {t("package.revision")}: <code>{query.data.revision}</code>
            </p>
          )}
          {query.data?.status === "unavailable" && (
            <DriverDiagnostics diagnostics={query.data.diagnostics} />
          )}
        </>
      )}
    </section>
  );
}
