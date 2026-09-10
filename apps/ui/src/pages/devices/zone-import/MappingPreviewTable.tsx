import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import type { MappingRow } from "./zoneMapping";

type RowStatus = {
  key: "invalid" | "skipped" | "unchanged" | "move" | "link";
  variant: "destructive" | "secondary" | "outline" | "warning" | "success";
};

/** What applying this row would do — the column an operator scans before
 *  committing, since a mapping file silently moves devices out of the zone
 *  they sit in today. */
function rowStatus(row: MappingRow): RowStatus {
  if (row.error !== null) return { key: "invalid", variant: "destructive" };
  if (row.skipped) return { key: "skipped", variant: "secondary" };
  if (row.unchanged) return { key: "unchanged", variant: "outline" };
  if (row.currentZone !== null) return { key: "move", variant: "warning" };
  return { key: "link", variant: "success" };
}

export function MappingPreviewTable({ rows }: { rows: MappingRow[] }) {
  const { t } = useTranslation("devices");
  const dash = "—";

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="w-16">{t("zoneImport.table.line")}</TableHead>
            <TableHead>{t("zoneImport.table.device")}</TableHead>
            <TableHead>{t("zoneImport.table.currentZone")}</TableHead>
            <TableHead>{t("zoneImport.table.targetZone")}</TableHead>
            <TableHead>{t("zoneImport.table.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const status = rowStatus(row);
            return (
              <TableRow key={row.line}>
                <TableCell className="text-muted-foreground">
                  {row.line}
                </TableCell>
                <TableCell>
                  <span className="font-medium">{row.deviceName ?? dash}</span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {row.deviceId || dash}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.currentZone ?? dash}
                </TableCell>
                <TableCell>
                  <span>{row.targetZone ?? dash}</span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {row.assetId || dash}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={status.variant}>
                    {t(`zoneImport.status.${status.key}`)}
                  </Badge>
                  {row.error && (
                    <span className="block pt-1 text-xs text-destructive">
                      {t(`zoneImport.rowErrors.${row.error}`)}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
