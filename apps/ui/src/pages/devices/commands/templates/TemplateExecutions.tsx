import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { getCommands, type DeviceCommand } from "@/api/commands";
import type { Page } from "@/api/pagination";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useUsers } from "@/hooks/useUsers";
import { buildCommandColumns } from "@/pages/devices/commands/columns";
import { CommandsTable } from "@/pages/devices/commands/CommandsTable";

const PAGE_SIZE = 50;

/** Read-only executions view for a single template. Deliberately a small
 *  inline component — using CommandsPage would require threading a "hide
 *  everything" flag through useCommands + CommandsFilterBar. The template
 *  column is omitted: the table is already scoped to this template. */
export function TemplateExecutions({ templateId }: { templateId: string }) {
  const { t } = useTranslation("devices");
  const { devices } = useDevicesList();
  const { users } = useUsers();

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("template_id", templateId);
    p.set("sort", "desc");
    p.set("size", String(PAGE_SIZE));
    return p;
  }, [templateId]);

  const { data, isLoading, isPlaceholderData, error } = useQuery<
    Page<DeviceCommand>
  >({
    queryKey: ["commands", "template", templateId],
    queryFn: () => getCommands(params),
    placeholderData: keepPreviousData,
    staleTime: 5000,
  });

  const deviceNames = useMemo(
    () =>
      Object.fromEntries(
        devices.filter((d) => d.name).map((d) => [d.id, d.name]),
      ),
    [devices],
  );
  const userNames = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.username])),
    [users],
  );

  const columns = useMemo(
    () =>
      buildCommandColumns(t, {
        deviceNames,
        userNames,
        templateNames: {},
        showTemplate: false,
      }),
    [t, deviceNames, userNames],
  );

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: data?.totalPages ?? 0,
  });

  return (
    <CommandsTable
      table={table}
      data={data}
      isLoading={isLoading}
      isPlaceholderData={isPlaceholderData}
      error={error}
      prevHref={undefined}
      nextHref={undefined}
    />
  );
}
