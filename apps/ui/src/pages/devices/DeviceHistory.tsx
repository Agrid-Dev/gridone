import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Check, ChevronsUpDown, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/DataTable";
import { useDeviceTimeSeries } from "@/hooks/useDeviceTimeSeries";
import { toLabel } from "@/lib/textFormat";
import { cn } from "@/lib/utils";
import type { DataPoint } from "@/api/timeseries";
import type { Device } from "@/api/devices";

// ---------------------------------------------------------------------------
// Layout context
// ---------------------------------------------------------------------------

type DeviceLayoutContext = {
  deviceId: string;
  device: Device;
  attributeNames: string[];
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CellValue = string | number | boolean | null;

type MergedRow = {
  timestamp: string;
  values: Record<string, CellValue>;
  resolved: Record<string, CellValue>;
};

// ---------------------------------------------------------------------------
// Merge utility
// ---------------------------------------------------------------------------

function mergeTimeSeries(
  pointsByMetric: Record<string, DataPoint[]>,
  attributes: string[],
): MergedRow[] {
  const timestampSet = new Set<string>();
  for (const attr of attributes) {
    for (const point of pointsByMetric[attr] ?? []) {
      timestampSet.add(point.timestamp);
    }
  }

  const timestamps = [...timestampSet].sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  );

  if (timestamps.length === 0) return [];

  const lookups = new Map<string, Map<number, CellValue>>();
  for (const attr of attributes) {
    const map = new Map<number, CellValue>();
    for (const point of pointsByMetric[attr] ?? []) {
      map.set(new Date(point.timestamp).getTime(), point.value);
    }
    lookups.set(attr, map);
  }

  const rows: MergedRow[] = timestamps.map((ts) => {
    const epoch = new Date(ts).getTime();
    const values: Record<string, CellValue> = {};
    for (const attr of attributes) {
      const lookup = lookups.get(attr)!;
      values[attr] = lookup.has(epoch) ? lookup.get(epoch)! : null;
    }
    return { timestamp: ts, values, resolved: {} };
  });

  const carry: Record<string, CellValue> = {};
  for (const attr of attributes) carry[attr] = null;

  for (let i = rows.length - 1; i >= 0; i--) {
    for (const attr of attributes) {
      if (rows[i].values[attr] !== null) {
        carry[attr] = rows[i].values[attr];
      }
    }
    rows[i].resolved = { ...carry };
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Column builder
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

const UNCHANGED_MARKER = (
  <span className="text-muted-foreground select-none">·</span>
);

function formatValue(value: CellValue): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function buildColumns(attributes: string[]): ColumnDef<MergedRow>[] {
  const timestampCol: ColumnDef<MergedRow> = {
    accessorKey: "timestamp",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Timestamp
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) =>
      new Date(row.getValue<string>("timestamp")).toLocaleString(),
  };

  const attrCols: ColumnDef<MergedRow>[] = attributes.map((attr) => ({
    id: attr,
    accessorFn: (row: MergedRow) => row.values[attr],
    header: () => toLabel(attr),
    cell: ({ row, table }) => {
      const sparse = row.original.values[attr];

      if (sparse !== null) return formatValue(sparse);

      const visibleRows = table.getRowModel().rows;
      const localIdx = visibleRows.indexOf(row);
      const isFirstOnPage = localIdx === 0;
      const isLastInTable =
        !table.getCanNextPage() && localIdx === visibleRows.length - 1;

      if (isFirstOnPage || isLastInTable) {
        return formatValue(row.original.resolved[attr]);
      }

      return UNCHANGED_MARKER;
    },
  }));

  return [timestampCol, ...attrCols];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MAX_DEFAULT_COLUMNS = 5;

export default function DeviceHistory() {
  const { t } = useTranslation();
  const { deviceId, attributeNames } = useOutletContext<DeviceLayoutContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [comboboxOpen, setComboboxOpen] = useState(false);

  // URL-synced pagination (1-based in URL, 0-based internally)
  const pageIndex = Math.max(0, Number(searchParams.get("page") ?? "1") - 1);
  const handlePageChange = useCallback(
    (next: number) => {
      setSearchParams(next === 0 ? {} : { page: String(next + 1) }, {
        replace: true,
      });
    },
    [setSearchParams],
  );

  const { series, pointsByMetric, isLoading, error } =
    useDeviceTimeSeries(deviceId);

  const availableAttributes = useMemo(
    () => series.map((s) => s.metric),
    [series],
  );

  const [selected, setSelected] = useState<string[]>([]);

  const seriesIds = series.map((s) => s.id).join(",");
  useEffect(() => {
    if (availableAttributes.length > 0 && selected.length === 0) {
      const ordered = attributeNames.filter((n) =>
        availableAttributes.includes(n),
      );
      const remaining = availableAttributes.filter(
        (n) => !attributeNames.includes(n),
      );
      setSelected([...ordered, ...remaining].slice(0, MAX_DEFAULT_COLUMNS));
    }
  }, [seriesIds]); // Only re-run when series list changes

  const toggle = (attr: string) => {
    setSelected((prev) =>
      prev.includes(attr) ? prev.filter((a) => a !== attr) : [...prev, attr],
    );
    handlePageChange(0);
  };

  const mergedRows = useMemo(
    () => mergeTimeSeries(pointsByMetric, selected),
    [pointsByMetric, selected],
  );

  const columns = useMemo(() => buildColumns(selected), [selected]);

  // ----- Loading skeleton -----
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64 rounded-md" />
        <div className="overflow-hidden rounded-md border">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full border-t" />
          ))}
        </div>
      </div>
    );
  }

  // ----- Error -----
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error instanceof Error ? error.message : t("errors.default")}
      </div>
    );
  }

  // ----- Empty state -----
  if (availableAttributes.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("common.noData")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Column selector combobox */}
      <div className="space-y-2">
        <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={comboboxOpen}
              className="w-64 justify-between"
            >
              {selected.length > 0
                ? `${selected.length} ${t("common.attributes")}`
                : t("deviceDetails.selectAttributes")}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput placeholder={t("deviceDetails.searchAttributes")} />
              <CommandList>
                <CommandEmpty>{t("common.noResults")}</CommandEmpty>
                <CommandGroup>
                  {availableAttributes.map((attr) => (
                    <CommandItem
                      key={attr}
                      value={attr}
                      onSelect={() => toggle(attr)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selected.includes(attr) ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {toLabel(attr)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map((attr) => (
              <Badge key={attr} variant="secondary" className="gap-1">
                {toLabel(attr)}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => toggle(attr)}
                />
              </Badge>
            ))}
          </div>
        )}
      </div>

      {selected.length > 0 ? (
        <DataTable
          columns={columns}
          data={mergedRows}
          pageSize={PAGE_SIZE}
          pageIndex={pageIndex}
          onPageChange={handlePageChange}
        />
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("common.noData")}
        </p>
      )}
    </div>
  );
}
