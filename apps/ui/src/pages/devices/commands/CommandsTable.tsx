import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { flexRender, type Table as TTable } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
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
import { cn } from "@/lib/utils";
import type { DeviceCommand } from "@/api/commands";
import type { Page } from "@/api/pagination";

type CommandsTableProps = {
  table: TTable<DeviceCommand>;
  data: Page<DeviceCommand> | undefined;
  isLoading: boolean;
  isPlaceholderData: boolean;
  error: Error | null;
  prevHref: string | undefined;
  nextHref: string | undefined;
};

export function CommandsTable({
  table,
  data,
  isLoading,
  isPlaceholderData,
  error,
  prevHref,
  nextHref,
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

  if (!data || data.total === 0) {
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

  const { total, page, size, totalPages } = data;
  const linkClasses = cn(
    buttonVariants({ variant: "outline", size: "icon" }),
    "h-8 w-8",
  );
  const disabledClasses = "pointer-events-none opacity-50";

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
          {prevHref && !isPlaceholderData ? (
            <Link to={{ search: prevHref }} className={linkClasses} replace>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          ) : (
            <span className={cn(linkClasses, disabledClasses)}>
              <ChevronLeft className="h-4 w-4" />
            </span>
          )}
          <span className="px-2 text-sm tabular-nums text-muted-foreground">
            {page} / {totalPages}
          </span>
          {nextHref && !isPlaceholderData ? (
            <Link to={{ search: nextHref }} className={linkClasses} replace>
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className={cn(linkClasses, disabledClasses)}>
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
