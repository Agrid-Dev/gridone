import { useOutletContext } from "react-router";
import { useTranslation } from "react-i18next";
import { flexRender } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, History, Settings2 } from "lucide-react";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { toLabel } from "@/lib/textFormat";
import { useDeviceHistory } from "./useDeviceHistory";
import type { Device } from "@/api/devices";

type DeviceLayoutContext = {
  deviceId: string;
  device: Device;
  attributeNames: string[];
};

export default function DeviceHistory() {
  const { t } = useTranslation();
  const { deviceId, attributeNames } = useOutletContext<DeviceLayoutContext>();
  const { table, isLoading, error, availableAttributes } = useDeviceHistory(
    deviceId,
    attributeNames,
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="overflow-hidden rounded-lg border">
          <div className="bg-muted/50">
            <Skeleton className="h-10 w-full" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full border-t" />
          ))}
        </div>
        <Skeleton className="ml-auto h-8 w-48 rounded-md" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorFallback
        title={error instanceof Error ? error.message : t("errors.default")}
        showHomeLink={false}
      />
    );
  }

  if (availableAttributes.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History />
          </EmptyMedia>
          <EmptyTitle>{t("common.noData")}</EmptyTitle>
          <EmptyDescription>
            {t("deviceDetails.noHistoryDescription", {
              defaultValue:
                "No time-series data has been recorded for this device yet.",
            })}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const visibleCount = table
    .getAllColumns()
    .filter((c) => c.id !== "timestamp" && c.getIsVisible()).length;
  const allVisible = visibleCount === availableAttributes.length;

  const toggleAll = (visible: boolean) => {
    for (const attr of availableAttributes) {
      table.getColumn(attr)?.toggleVisibility(visible);
    }
  };

  const { pageIndex, pageSize } = table.getState().pagination;
  const totalRows = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings2 className="mr-2 h-4 w-4" />
              {t("common.columns")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>{t("common.toggleColumns")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                toggleAll(!allVisible);
              }}
            >
              {allVisible ? t("common.unselectAll") : t("common.selectAll")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {availableAttributes.map((attr) => (
              <DropdownMenuCheckboxItem
                key={attr}
                checked={table.getColumn(attr)?.getIsVisible() ?? false}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(checked) =>
                  table.getColumn(attr)?.toggleVisibility(!!checked)
                }
              >
                {toLabel(attr)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Badge variant="secondary" className="text-xs">
          {visibleCount} / {availableAttributes.length}
        </Badge>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/50 hover:bg-muted/50">
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2.5">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {t("common.noResults")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalRows > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("common.rowsRange", {
              from: pageIndex * pageSize + 1,
              to: Math.min((pageIndex + 1) * pageSize, totalRows),
              total: totalRows,
            })}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-sm tabular-nums text-muted-foreground">
              {pageIndex + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
