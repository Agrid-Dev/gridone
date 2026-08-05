import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type PaginationState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Th,
} from "@/components/ui";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { buildEventColumns } from "./eventColumns";
import { useDeviceHistoryContext } from "./DeviceHistoryContext";

const PAGE_SIZE = 20;

/** The events log: one row per recorded value change of the active metric and
 *  the state series, newest first, with URL-synced pagination. */
export default function HistoryEventsTable() {
  const { t, i18n } = useTranslation(["devices", "common"]);
  const { events, dataTypes, deviceType, commandsMap, usersMap } =
    useDeviceHistoryContext();
  const labelFor = useAttributeLabel();

  const columns = useMemo(
    () =>
      buildEventColumns({
        t,
        locale: i18n.language,
        labelFor,
        dataTypes,
        deviceType,
        commandsMap,
        usersMap,
      }),
    [t, i18n.language, labelFor, dataTypes, deviceType, commandsMap, usersMap],
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
  const maxPage = Math.max(0, Math.ceil(events.length / PAGE_SIZE) - 1);
  useEffect(() => {
    if (events.length > 0 && pageIndex > maxPage) {
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
  }, [events.length, pageIndex, maxPage, setSearchParams]);

  const table = useReactTable({
    data: events,
    columns,
    state: {
      pagination: { pageIndex, pageSize: PAGE_SIZE },
    },
    onPaginationChange: handlePaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  const { pageIndex: currentPage, pageSize } = table.getState().pagination;
  const totalRows = events.length;
  const pageCount = table.getPageCount();

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/50 hover:bg-muted/50">
                {hg.headers.map((header) => (
                  <Th key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </Th>
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
                  {t("common:common.noResults")}
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
            {t("common:common.rowsRange", {
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
