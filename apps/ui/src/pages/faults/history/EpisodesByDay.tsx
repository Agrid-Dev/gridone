import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { ResourceLink as Link } from "@/components/ResourceLink";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Th,
} from "@/components/ui/table";
import { formatCompactDuration } from "@/lib/compactDuration";
import { cn } from "@/lib/utils";
import { deviceHistoryPath } from "@/pages/devices/device/deviceSections";
import { SEVERITY_TEXT_CLASS } from "../components/SeverityLabel";
import { faultKey } from "@/lib/faults";
import { type EpisodeRow, episodeDuration } from "./faultHistory";
import { dayHeading, episodeRange } from "./formatEpisode";
import { DeviceCell, SeverityCell, ZoneCell } from "./historyCells";
import type { FaultHistory } from "./useFaultHistory";

/** How far either side of an episode its device's history opens: enough to
 *  see what led to the alert and what followed it. */
const HISTORY_MARGIN_MS = 30 * 60_000;

/** The "Chronologie" reading: the period's episodes under the local day each
 *  opened on, newest first, each linked to its device's history around it. */
export function EpisodesByDay({ history }: { history: FaultHistory }) {
  const { t, i18n } = useTranslation("faults");
  const { days, rows, span, now, truncated } = history;
  const spanLabel = t(`faults.span.${span}`);
  const today = new Date(now);

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table className="min-w-[60rem] table-fixed">
        <colgroup>
          <col className="w-[13%]" />
          <col className="w-[21%]" />
          <col className="w-[19%]" />
          <col className="w-[15%]" />
          <col className="w-[14%]" />
          <col className="w-[10%]" />
          <col className="w-[8%]" />
        </colgroup>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <Th>{t("faults.columns.severity")}</Th>
            <Th>{t("faults.columns.fault")}</Th>
            <Th>{t("faults.columns.device")}</Th>
            <Th>{t("faults.columns.zone")}</Th>
            <Th>{t("faults.history.columns.range")}</Th>
            <Th>{t("faults.history.columns.duration")}</Th>
            <Th>
              <span className="sr-only">
                {t("faults.history.deviceHistory")}
              </span>
            </Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.map(({ day, rows: dayRows }) => (
            <Fragment key={day.getTime()}>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell
                  colSpan={7}
                  className="py-2 text-xs font-semibold text-muted-foreground"
                >
                  {dayHeading(day, today, t, i18n.language)}{" "}
                  <span className="font-normal">
                    ·{" "}
                    {t(
                      truncated
                        ? "faults.history.verifiedRows"
                        : "faults.history.dayCount",
                      { count: dayRows.length },
                    )}
                  </span>
                </TableCell>
              </TableRow>
              {dayRows.map((row) => (
                <EpisodeLine
                  key={`${faultKey(row)}:${row.started_at}`}
                  row={row}
                  history={history}
                  spanLabel={spanLabel}
                />
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
      <div className="border-t px-4 py-3 text-sm text-muted-foreground">
        {truncated
          ? t("faults.history.verifiedRows", { count: rows.length })
          : t("faults.history.byDayFooter", {
              count: rows.length,
              span: spanLabel,
            })}
      </div>
    </div>
  );
}

function EpisodeLine({
  row,
  history,
  spanLabel,
}: {
  row: EpisodeRow;
  history: FaultHistory;
  spanLabel: string;
}) {
  const { t, i18n } = useTranslation("faults");
  const { t: tCommon } = useTranslation();
  const { recurrences, now, labelOf, typeOf } = history;
  const recurrence = recurrences.get(faultKey(row)) ?? 0;
  const ongoing = row.endMs === null;
  const duration = formatCompactDuration(episodeDuration(row, now), tCommon);
  const historyPath = deviceHistoryPath(row.device_id, {
    attrs: [row.attribute_name],
    start: new Date(row.startMs - HISTORY_MARGIN_MS),
    end: row.endMs === null ? null : new Date(row.endMs + HISTORY_MARGIN_MS),
  });

  return (
    <TableRow>
      <SeverityCell row={row} />
      <TableCell className="py-2.5">
        <span className="font-medium">{labelOf(row)}</span>
        {recurrence > 1 && (
          <span className="block text-xs text-muted-foreground">
            {t("faults.recurrence", { count: recurrence, span: spanLabel })}
          </span>
        )}
      </TableCell>
      <DeviceCell row={row} type={typeOf(row)} />
      <ZoneCell row={row} />
      <TableCell className="whitespace-nowrap py-2.5 text-sm tabular-nums">
        {episodeRange(row, t, i18n.language)}
      </TableCell>
      <TableCell
        className={cn(
          "whitespace-nowrap py-2.5 text-sm tabular-nums",
          ongoing
            ? cn("font-semibold", SEVERITY_TEXT_CLASS[row.severity])
            : "text-muted-foreground",
        )}
      >
        {ongoing ? t("faults.history.since", { duration }) : duration}
      </TableCell>
      <TableCell className="py-2.5 text-right">
        <Link
          to={historyPath}
          title={t("faults.history.deviceHistoryTitle")}
          className="text-sm underline-offset-4 hover:underline focus-visible:underline"
        >
          {t("faults.history.deviceHistory")}
        </Link>
      </TableCell>
    </TableRow>
  );
}
