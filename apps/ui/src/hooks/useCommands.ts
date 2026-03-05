import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useReactTable, getCoreRowModel } from "@tanstack/react-table";
import {
  getCommands,
  type CommandsFilters,
  type CommandsPage,
} from "@/api/commands";
import type { Device } from "@/api/devices";
import type { User } from "@/api/users";
import { buildCommandColumns } from "@/pages/devices/commands/columns";

export function useCommandsQuery(filters: CommandsFilters) {
  return useQuery<CommandsPage>({
    queryKey: ["commands", filters],
    queryFn: () => getCommands(filters),
    placeholderData: keepPreviousData,
    staleTime: 5000,
  });
}

export function useCommandsTable(
  filters: CommandsFilters,
  devices: Device[],
  users: User[] | undefined,
) {
  const { t } = useTranslation();
  const query = useCommandsQuery(filters);

  const deviceNames = useMemo(
    () =>
      Object.fromEntries(
        devices.filter((d) => d.name).map((d) => [d.id, d.name]),
      ),
    [devices],
  );

  const userNames = useMemo(
    () => Object.fromEntries((users ?? []).map((u) => [u.id, u.username])),
    [users],
  );

  const columns = useMemo(
    () => buildCommandColumns(t, { deviceNames, userNames }),
    [t, deviceNames, userNames],
  );

  const table = useReactTable({
    data: query.data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: query.data?.totalPages ?? 0,
  });

  return { ...query, table };
}
