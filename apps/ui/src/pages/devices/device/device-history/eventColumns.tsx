import { TFunction } from "i18next";
import { ColumnDef } from "@tanstack/react-table";
import { Activity, ArrowLeftRight } from "lucide-react";
import type { UnitCommand, User } from "@gridone/sdk";
import { AttributeValue } from "@/components/AttributeValue";
import type { DeviceType } from "@/lib/devices";
import { formatValue } from "@/lib/formatValue";
import { CommandIndicator } from "./CommandIndicator";
import { eventDayKind, type HistoryEvent } from "./historyEvents";

type BuildEventColumnsOptions = {
  t: TFunction<readonly ["devices", "common"]>;
  locale: string;
  labelFor: (attr: string) => string;
  dataTypes: Record<string, string>;
  deviceType: DeviceType | undefined;
  commandsMap: Map<number, UnitCommand>;
  usersMap: Map<string, User>;
};

/** The four fixed columns of the events log: timestamp / event / value /
 *  source. Rows arrive pre-sorted (newest first), so no column sorts. */
export function buildEventColumns({
  t,
  locale,
  labelFor,
  dataTypes,
  deviceType,
  commandsMap,
  usersMap,
}: BuildEventColumnsOptions): ColumnDef<HistoryEvent>[] {
  const dayFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  });
  // Seconds included: devices can record several times a minute, and rows
  // sharing an HH:MM stamp read as duplicates (AGR-1029).
  const timeFormat = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const now = new Date();

  const dayLabel = (date: Date) => {
    const kind = eventDayKind(date, now);
    if (kind === "today") return t("devices:history.events.today");
    if (kind === "yesterday") return t("devices:history.events.yesterday");
    return dayFormat.format(date);
  };

  return [
    {
      id: "timestamp",
      header: () => t("common:common.timestamp"),
      cell: ({ row }) => {
        const date = new Date(row.original.timestamp);
        return (
          <div className="whitespace-nowrap font-mono text-xs leading-snug tabular-nums">
            <div className="text-muted-foreground">{dayLabel(date)}</div>
            <div>{timeFormat.format(date)}</div>
          </div>
        );
      },
    },
    {
      id: "event",
      header: () => t("devices:history.events.event"),
      cell: ({ row }) => {
        const { kind, metric } = row.original;
        const Icon = kind === "numeric" ? Activity : ArrowLeftRight;
        return (
          <span className="inline-flex items-center gap-2">
            <Icon
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="font-medium">
              {t(
                kind === "numeric"
                  ? "devices:history.events.reading"
                  : "devices:history.events.change",
                { metric: labelFor(metric) },
              )}
            </span>
          </span>
        );
      },
    },
    {
      id: "value",
      header: () => t("devices:history.events.value"),
      cell: ({ row }) => {
        const { metric, value, kind } = row.original;
        const dataType = dataTypes[metric];
        if (kind === "state" && dataType === "bool") {
          return (
            <span className="font-mono text-sm tabular-nums">
              {t(
                value === true
                  ? "common:common.hvacMode.on"
                  : "common:common.hvacMode.off",
              )}
            </span>
          );
        }
        if (kind === "state") {
          return (
            <AttributeValue
              value={value}
              attributeName={metric}
              deviceType={deviceType}
              dataType={dataType}
              className="text-sm"
            />
          );
        }
        return (
          <span className="font-mono text-sm tabular-nums">
            {formatValue(value, dataType)}
          </span>
        );
      },
    },
    {
      id: "source",
      header: () => t("devices:history.events.source"),
      cell: ({ row }) => {
        const { commandId, metric, value, previousValue } = row.original;
        const command =
          commandId != null ? commandsMap.get(commandId) : undefined;
        if (!command) {
          return (
            <span className="text-muted-foreground">
              {t("devices:history.events.gateway")}
            </span>
          );
        }
        const user = usersMap.get(command.user_id);
        return (
          <span className="inline-flex items-center gap-1.5">
            <span>{user?.name || user?.username || command.user_id}</span>
            <CommandIndicator
              command={command}
              user={user}
              previousValue={previousValue}
              newValue={value}
              dataType={dataTypes[metric]}
            />
          </span>
        );
      },
    },
  ];
}
