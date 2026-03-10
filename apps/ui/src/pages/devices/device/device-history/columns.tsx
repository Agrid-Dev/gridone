import { TFunction } from "i18next";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import type { DeviceCommand } from "@/api/commands";
import type { User } from "@/api/users";
import { Button } from "@/components/ui";
import { toLabel } from "@/lib/textFormat";
import { formatValue } from "@/lib/formatValue";
import { cn } from "@/lib/utils";
import { CommandIndicator } from "./CommandIndicator";
import type { MergedRow } from "./mergeTimeSeries";

function isNumericType(dataType?: string) {
  return dataType === "float" || dataType === "integer";
}

const RECENT_MS = 5000;

function isRecent(timestamp: string) {
  return Date.now() - new Date(timestamp).getTime() < RECENT_MS;
}

export function buildColumns(
  attributes: string[],
  dataTypes: Record<string, string>,
  t: TFunction,
  commandsMap: Map<number, DeviceCommand>,
  usersMap: Map<string, User>,
): ColumnDef<MergedRow>[] {
  const timestampCol: ColumnDef<MergedRow> = {
    accessorKey: "timestamp",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {t("common.timestamp")}
        <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {new Date(row.getValue<string>("timestamp")).toLocaleString()}
      </span>
    ),
  };

  const attrCols: ColumnDef<MergedRow>[] = attributes.map((attr) => ({
    id: attr,
    accessorFn: (row: MergedRow) => row.values[attr],
    header: () => toLabel(attr),
    cell: ({ row }) => {
      const value = row.original.values[attr];
      const isNew = row.original.isNew[attr];
      const commandId = row.original.commandIds[attr];
      const command =
        commandId != null ? commandsMap.get(commandId) : undefined;
      const user = command ? usersMap.get(command.userId) : undefined;
      const dt = dataTypes[attr];
      const formatted = formatValue(value, dt);
      const recent = isNew && isRecent(row.original.timestamp);
      return (
        <span
          key={`${row.original.timestamp}-${value}`}
          className={cn(
            "inline-flex items-center gap-1.5",
            isNumericType(dt) && "tabular-nums font-mono",
            isNew ? "text-foreground font-medium" : "text-muted-foreground/50",
            recent && "rounded-sm px-1 -mx-1 animate-highlight-fade",
          )}
        >
          {formatted}
          {command && (
            <CommandIndicator
              command={command}
              user={user}
              previousValue={row.original.previousValues[attr]}
              newValue={value}
              dataType={dt}
            />
          )}
        </span>
      );
    },
  }));

  return [timestampCol, ...attrCols];
}
