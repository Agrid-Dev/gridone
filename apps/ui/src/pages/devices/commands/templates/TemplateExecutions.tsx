import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { Page, UnitCommand } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
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
  const { t } = useTranslation(["devices", "common"]);
  const client = useGridoneClient();
  const { devices } = useDevicesList();
  const { users } = useUsers();

  const { data, isLoading, isPlaceholderData, error } = useQuery<
    Page<UnitCommand>
  >({
    queryKey: ["commands", "template", templateId],
    queryFn: () =>
      client.devices.listCommands({
        template_id: templateId,
        sort: "desc",
        size: PAGE_SIZE,
      }),
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
    pageCount: data?.total_pages ?? 0,
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
