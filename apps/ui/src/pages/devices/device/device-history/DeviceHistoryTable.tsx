import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { buildColumns } from "./columns";
import { useDeviceHistoryContext } from "./DeviceHistoryContext";

const PAGE_SIZE = 20;

export default function DeviceHistoryTable() {
  const { t } = useTranslation();
  const {
    availableAttributes,
    dataTypes,
    columnVisibility,
    handleVisibilityChange,
    columnOrder,
    setColumnOrder,
    filteredRows,
    isLoading,
    error,
  } = useDeviceHistoryContext();

  const columns = useMemo(
    () => buildColumns(availableAttributes, dataTypes, t),
    [availableAttributes, dataTypes, t],
  );

  // URL-synced pagination (1-based in URL, 0-based internally)
  const [searchParams, setSearchParams] = useSearchParams();
  const pageIndex = Math.max(0, Number(searchParams.get("page") ?? "1") - 1);

  const handlePaginationChange = useCallback(
    (
      updater: PaginationState | ((prev: PaginationState) => PaginationState),
    ) => {
      const next =
        typeof updater === "function"
          ? updater({ pageIndex, pageSize: PAGE_SIZE })
          : updater;
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next.pageIndex === 0) {
            params.delete("page");
          } else {
            params.set("page", String(next.pageIndex + 1));
          }
          return params;
        },
        { replace: true },
      );
    },
    [pageIndex, setSearchParams],
  );

  // Clamp to last page when current page exceeds page count
  const maxPage = Math.max(0, Math.ceil(filteredRows.length / PAGE_SIZE) - 1);
  useEffect(() => {
    if (filteredRows.length > 0 && pageIndex > maxPage) {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (maxPage === 0) {
            params.delete("page");
          } else {
            params.set("page", String(maxPage + 1));
          }
          return params;
        },
        { replace: true },
      );
    }
  }, [filteredRows.length, pageIndex, maxPage, setSearchParams]);

  const [sorting, setSorting] = useState<SortingState>([
    { id: "timestamp", desc: true },
  ]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnOrder,
      pagination: { pageIndex, pageSize: PAGE_SIZE },
    },
    onSortingChange: setSorting,
    onPaginationChange: handlePaginationChange,
    onColumnVisibilityChange: handleVisibilityChange,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  if (error) {
    return (
      <ErrorFallback
        title={error instanceof Error ? error.message : t("errors.default")}
        showHomeLink={false}
      />
    );
  }

  if (!isLoading && availableAttributes.length === 0) {
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

  const { pageIndex: currentPage, pageSize } = table.getState().pagination;
  const totalRows = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();

  return (
    <div className="space-y-4">
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
              from: currentPage * pageSize + 1,
              to: Math.min((currentPage + 1) * pageSize, totalRows),
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
              {currentPage + 1} / {pageCount}
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
