import { TFunction } from "i18next";
import { ColumnDef } from "@tanstack/react-table";
import type { UnitCommand, User } from "@gridone/sdk";
import { AttributeValue } from "@/components/AttributeValue";
import { attributeUnit } from "@/lib/attributeUnits";
import type { DeviceType } from "@/lib/devices";
import { type AttributeFields, isFaultAttribute } from "@/lib/faults";
import type { CellValue, MergedRow } from "@/lib/mergeTimeSeries";
import { cn } from "@/lib/utils";
import { CommandIndicator } from "./CommandIndicator";
import { dayKind } from "./dayKind";

type BuildHistoryColumnsOptions = {
  t: TFunction<readonly ["devices", "common"]>;
  locale: string;
  /** The selected attributes, one column each, in the order to show them. */
  selectedAttributes: string[];
  labelFor: (name: string, attribute?: AttributeFields) => string;
  attributes: Record<string, AttributeFields | undefined>;
  dataTypes: Record<string, string>;
  deviceType: DeviceType | undefined;
  commandsMap: Map<number, UnitCommand>;
  usersMap: Map<string, User>;
};

/** The comparison table's columns: the timestamp, then one column per
 *  selected attribute so two attributes read side by side at the same
 *  instant. Rows arrive newest first, so no column sorts. */
export function buildHistoryColumns({
  t,
  locale,
  selectedAttributes,
  labelFor,
  attributes,
  dataTypes,
  deviceType,
  commandsMap,
  usersMap,
}: BuildHistoryColumnsOptions): ColumnDef<MergedRow>[] {
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
    const kind = dayKind(date, now);
    if (kind === "today") return t("devices:history.today");
    if (kind === "yesterday") return t("devices:history.yesterday");
    return dayFormat.format(date);
  };

  const timestampColumn: ColumnDef<MergedRow> = {
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
  };

  const attributeColumns = selectedAttributes.map(
    (name): ColumnDef<MergedRow> => {
      const attribute = attributes[name];
      const dataType = dataTypes[name];
      const unit = attributeUnit(name, attribute);
      // A fault attribute's past value is judged as its current one is:
      // faulty unless among the values the driver declares healthy.
      const faultOf =
        attribute && isFaultAttribute(attribute) && attribute.healthy_values
          ? (value: CellValue) => ({
              severity: attribute.severity,
              isFaulty:
                value !== null && !attribute.healthy_values!.includes(value),
            })
          : undefined;
      return {
        id: name,
        header: () => labelFor(name, attribute),
        cell: ({ row }) => {
          const value = row.original.values[name];
          const isNew = row.original.isNew[name];
          const commandId = row.original.commandIds[name];
          const command =
            commandId != null ? commandsMap.get(commandId) : undefined;
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1.5",
                // A value carried over from an earlier instant reads
                // muted: it was in force then, it did not change then.
                isNew ? "font-medium" : "text-muted-foreground/50",
              )}
            >
              <AttributeValue
                value={value}
                attributeName={name}
                deviceType={deviceType}
                dataType={dataType}
                fault={faultOf?.(value)}
                unit={unit}
                valueLabels={attribute?.value_labels}
                className="text-sm"
              />
              {command && (
                <CommandIndicator
                  command={command}
                  user={usersMap.get(command.user_id)}
                  attributeName={name}
                  previousValue={row.original.previousValues[name]}
                  newValue={value}
                  dataType={dataType}
                  unit={unit}
                  valueLabels={attribute?.value_labels}
                />
              )}
            </span>
          );
        },
      };
    },
  );

  return [timestampColumn, ...attributeColumns];
}
