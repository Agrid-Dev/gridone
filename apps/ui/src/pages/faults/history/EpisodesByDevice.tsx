import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Th,
} from "@/components/ui/table";
import { formatCompactDuration } from "@/lib/compactDuration";
import { dayName } from "./formatEpisode";
import { DeviceCell, SeverityCell, ZoneCell } from "./historyCells";
import type { FaultHistory } from "./useFaultHistory";

/** The "Par appareil" reading: one line per alert of each device, the
 *  longest in alert over the period first. */
export function EpisodesByDevice({ history }: { history: FaultHistory }) {
  const { t, i18n } = useTranslation("faults");
  const { t: tCommon } = useTranslation();
  const { summaries, span, now, labelOf, typeOf, most, truncated } = history;
  const today = new Date(now);
  const time = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table className="min-w-[60rem] table-fixed">
        <colgroup>
          <col className="w-[13%]" />
          <col className="w-[21%]" />
          <col className="w-[19%]" />
          <col className="w-[15%]" />
          <col className="w-[14%]" />
          <col className="w-[9%]" />
          <col className="w-[9%]" />
        </colgroup>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <Th>{t("faults.columns.severity")}</Th>
            <Th>{t("faults.columns.fault")}</Th>
            <Th>{t("faults.columns.device")}</Th>
            <Th>{t("faults.columns.zone")}</Th>
            <Th>{t("faults.history.columns.lastTime")}</Th>
            <Th>{t("faults.history.columns.total")}</Th>
            <Th>{t("faults.history.columns.count")}</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summaries.map(({ key, latest, count, totalMs, ongoing }) => (
            <TableRow key={key}>
              <SeverityCell row={latest} />
              <TableCell className="py-2.5">
                <span className="font-medium">{labelOf(latest)}</span>
                {ongoing && (
                  <span className="block text-xs text-muted-foreground">
                    {t("faults.history.stillOn")}
                  </span>
                )}
              </TableCell>
              <DeviceCell row={latest} type={typeOf(latest)} />
              <ZoneCell row={latest} />
              <TableCell className="whitespace-nowrap py-2.5 text-sm text-muted-foreground">
                {truncated
                  ? t("faults.history.unavailable")
                  : `${dayName(new Date(latest.startMs), today, t, i18n.language)} · ${time.format(latest.startMs)}`}
              </TableCell>
              <TableCell className="whitespace-nowrap py-2.5 text-sm font-medium tabular-nums">
                {truncated
                  ? t("faults.history.unavailable")
                  : formatCompactDuration(totalMs, tCommon)}
              </TableCell>
              <TableCell className="py-2.5">
                {truncated ? (
                  t("faults.history.unavailable")
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{count}</span>
                    {/* The bar compares how often each alert came back. */}
                    <span
                      aria-hidden
                      className="h-1.5 rounded-full bg-foreground/20"
                      style={{ width: `${8 + (52 * count) / most}px` }}
                    />
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="border-t px-4 py-3 text-sm text-muted-foreground">
        {truncated
          ? t("faults.history.verifiedRows", { count: summaries.length })
          : t("faults.history.byDeviceFooter", {
              count: summaries.length,
              span: t(`faults.span.${span}`),
            })}
      </div>
    </div>
  );
}
