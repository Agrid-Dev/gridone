import { useRef } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Download, Upload } from "lucide-react";
import { Button, Card, CardContent } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceHeader } from "@/components/ResourceHeader";
import { MappingPreviewTable } from "./MappingPreviewTable";
import { MappingResultSummary } from "./MappingResultSummary";
import { useZoneMappingImport } from "./useZoneMappingImport";
import { MAPPING_COLUMNS } from "./zoneMapping";

/** Bulk device → zone assignment from a CSV of resource IDs.
 *
 *  The four steps share one page rather than a wizard: the preview *is* the
 *  confirmation step, and the results replace it in place so a partial
 *  failure can be retried without re-uploading the file. */
export default function ZoneMappingImportPage() {
  const { t } = useTranslation(["devices", "common"]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    loading,
    filename,
    parsed,
    invalidRows,
    skippedRows,
    assignments,
    outcome,
    isPending,
    loadFile,
    reset,
    apply,
    retryFailed,
    downloadTemplate,
    downloadZones,
  } = useZoneMappingImport();

  const rows = parsed?.rows ?? [];

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("zoneImport.title")}
        caption={t("zoneImport.caption")}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/devices">
              <ArrowLeft />
              {t("zoneImport.backToDevices")}
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              {t("zoneImport.formatHint")}{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {MAPPING_COLUMNS.join(",")}
              </code>
            </p>
            <p>{t("zoneImport.templateHint")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload />
              {filename
                ? t("zoneImport.replaceFile")
                : t("zoneImport.chooseFile")}
            </Button>
            <Button variant="ghost" size="sm" onClick={downloadTemplate}>
              <Download />
              {t("zoneImport.downloadTemplate")}
            </Button>
            <Button variant="ghost" size="sm" onClick={downloadZones}>
              <Download />
              {t("zoneImport.downloadZones")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-label={t("zoneImport.fileInputLabel")}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void loadFile(file);
                // Let the same file be picked again after a fix.
                e.target.value = "";
              }}
            />
            {filename && (
              <span className="text-sm text-muted-foreground">
                {t("zoneImport.selectedFile", {
                  filename,
                  count: rows.length,
                })}
              </span>
            )}
            {filename && !isPending && (
              <Button variant="ghost" size="sm" onClick={reset}>
                {t("common:common.cancel")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {outcome ? (
        <MappingResultSummary
          outcome={outcome}
          isPending={isPending}
          onRetry={retryFailed}
          onNewImport={reset}
        />
      ) : parsed === null ? null : loading ? (
        <Skeleton className="h-40" />
      ) : parsed.fileError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {t(`zoneImport.fileErrors.${parsed.fileError}`)}
        </p>
      ) : (
        <div className="space-y-4">
          <MappingPreviewTable rows={rows} />
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="mr-auto space-y-1 text-sm">
              {invalidRows.length > 0 && (
                <p className="text-destructive">
                  {t("zoneImport.blocked", { count: invalidRows.length })}
                </p>
              )}
              {skippedRows.length > 0 && (
                <p className="text-muted-foreground">
                  {t("zoneImport.skippedNote", { count: skippedRows.length })}
                </p>
              )}
            </div>
            <Button
              disabled={
                isPending || invalidRows.length > 0 || assignments.length === 0
              }
              onClick={apply}
            >
              {t("zoneImport.apply", { count: assignments.length })}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
