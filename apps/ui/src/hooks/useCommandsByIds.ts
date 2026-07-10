import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UnitCommand } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

export function useCommandsByIds(ids: number[]) {
  const client = useGridoneClient();
  const sortedKey = useMemo(() => [...ids].sort((a, b) => a - b), [ids]);

  const query = useQuery({
    queryKey: ["commands", "byIds", sortedKey],
    queryFn: () => client.devices.listCommands({ ids: sortedKey }),
    enabled: sortedKey.length > 0,
    staleTime: 60_000,
  });

  const commandsMap = useMemo(
    () =>
      new Map(
        (query.data?.items ?? []).map((cmd: UnitCommand) => [cmd.id, cmd]),
      ),
    [query.data],
  );

  return { commandsMap, ...query };
}
