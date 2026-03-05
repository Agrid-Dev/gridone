import { useTranslation } from "react-i18next";
import { flexRender, type Table as TTable } from "@tanstack/react-table";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorFallback } from "@/components/fallbacks/Error";
import type { DeviceCommand, PaginationLinks } from "@/api/commands";

type CommandsTableProps = {
  table: TTable<DeviceCommand>;
  total: number;
  page: number;
  size: number;
  totalPages: number;
  links: PaginationLinks | undefined;
  isLoading: boolean;
  isPlaceholderData: boolean;
  error: Error | null;
  onPageChange: (page: number) => void;
};

export function CommandsTable({
  table,
  total,
  page,
  size,
  totalPages,
  links,
  isLoading,
  isPlaceholderData,
  error,
  onPageChange,
}: CommandsTableProps) {
  const { t } = useTranslation();

  if (error) {
    return (
      <ErrorFallback
        title={error instanceof Error ? error.message : t("errors.default")}
        showHomeLink={false}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (total === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History />
          </EmptyMedia>
          <EmptyTitle>{t("commands.noCommands")}</EmptyTitle>
          <EmptyDescription>
            {t("commands.noCommandsDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const hasPrev = links?.prev != null;
  const hasNext = links?.next != null;

  return (
    <div className="space-y-4">
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
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-2.5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("common.rowsRange", {
            from: (page - 1) * size + 1,
            to: Math.min(page * size, total),
            total,
          })}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(page - 1)}
            disabled={!hasPrev || isPlaceholderData}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-sm tabular-nums text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNext || isPlaceholderData}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
