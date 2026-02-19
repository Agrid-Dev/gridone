import { TFunction } from "i18next";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui";
import { toLabel } from "@/lib/textFormat";
import { cn } from "@/lib/utils";
import type { CellValue, MergedRow } from "./mergeTimeSeries";

export function formatValue(value: CellValue, dataType?: string): string {
  if (value === null || value === undefined) return "\u2014";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (dataType === "float" && typeof value === "number")
    return value.toFixed(2);
  return String(value);
}

function isNumericType(dataType?: string) {
  return dataType === "float" || dataType === "integer";
}

export function buildColumns(
  attributes: string[],
  dataTypes: Record<string, string>,
  t: TFunction,
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
      const dt = dataTypes[attr];
      const formatted = formatValue(value, dt);
      return (
        <span
          className={cn(
            "transition-colors",
            isNumericType(dt) && "tabular-nums font-mono",
            isNew ? "text-foreground font-medium" : "text-muted-foreground/50",
          )}
        >
          {formatted}
        </span>
      );
    },
  }));

  return [timestampCol, ...attrCols];
}
