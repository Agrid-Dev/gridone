import { useTranslation } from "react-i18next";
import { Button, Card, CardContent, CardTitle } from "@/components/ui";
import type { AssignmentOutcome } from "@/hooks/useDeviceAssetAssignments";

type MappingResultSummaryProps = {
  outcome: AssignmentOutcome;
  isPending: boolean;
  onRetry: () => void;
  onNewImport: () => void;
};

/** One summary for the whole batch, with the failures kept on screen: they
 *  are the only rows still to act on, and retrying resends just those. */
export function MappingResultSummary({
  outcome,
  isPending,
  onRetry,
  onNewImport,
}: MappingResultSummaryProps) {
  const { t } = useTranslation("devices");

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <CardTitle>{t("zoneImport.results.title")}</CardTitle>
        <ul className="space-y-1 text-sm">
          <li>
            {t("zoneImport.results.applied", { count: outcome.applied.length })}
          </li>
          <li className="text-muted-foreground">
            {t("zoneImport.results.unchanged", {
              count: outcome.unchanged.length,
            })}
          </li>
          <li className={outcome.failed.length > 0 ? "text-destructive" : ""}>
            {t("zoneImport.results.failed", { count: outcome.failed.length })}
          </li>
        </ul>

        {outcome.failed.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            {outcome.failed.map((result) => (
              <li key={result.device_id}>
                <span className="font-mono text-xs">{result.device_id}</span>
                {" — "}
                {result.error ?? t("zoneImport.results.unknownError")}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="outline" onClick={onNewImport} disabled={isPending}>
            {t("zoneImport.results.newImport")}
          </Button>
          {outcome.failed.length > 0 && (
            <Button onClick={onRetry} disabled={isPending}>
              {t("zoneImport.results.retry", {
                count: outcome.failed.length,
              })}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
