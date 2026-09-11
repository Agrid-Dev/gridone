import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BatchDispatchResponse, GroupCommandPreview } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import type { Scalar } from "@/components/device-ui/conditions";
import { groupConflict } from "./GroupError";
import { groupKey } from "./useDeviceGroups";
import type { DevicesFilter } from "@/lib/devices";

export function useGroupCommand(id: string) {
  const client = useGridoneClient();
  const cache = useQueryClient();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<GroupCommandPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [batch, setBatch] = useState<BatchDispatchResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [changed, setChanged] = useState(false);

  const prepare = useCallback(
    async (attribute: string, value: Scalar, filter?: DevicesFilter) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      setChanged(false);
      try {
        const result = await client.devices.groups.preview(id, {
          attribute,
          value,
          target: filter,
        });
        setPreview(result);
        setSelected(
          result.members
            .filter((row) => row.eligible)
            .map((row) => row.device_id),
        );
      } catch (failure) {
        setError(failure);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [client, id],
  );

  const confirm = async () => {
    if (!preview || !selected.length || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await client.devices.groups.confirm(id, {
        token: preview.token,
        device_ids: selected,
      });
      setBatch(result);
      setPreview(null);
      void cache.invalidateQueries({ queryKey: ["commands"] });
    } catch (failure) {
      const code = groupConflict(failure)?.code;
      if (
        code === "group_preview_changed" ||
        code === "group_preview_expired"
      ) {
        try {
          const refreshed = await client.devices.groups.preview(id, {
            attribute: preview.attribute,
            value: preview.value,
            device_ids: preview.device_ids,
            target: preview.target,
          });
          setPreview(refreshed);
          setSelected(
            selected.filter((deviceId) =>
              refreshed.members.some(
                (row) => row.device_id === deviceId && row.eligible,
              ),
            ),
          );
          setChanged(true);
          void cache.invalidateQueries({ queryKey: groupKey });
        } catch (refreshFailure) {
          setPreview(null);
          setError(refreshFailure);
        }
      } else setError(failure);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const results = useQuery({
    queryKey: ["group-command-results", batch?.batch_id],
    enabled: !!batch,
    queryFn: async () => {
      const first = await client.devices.listCommands({
        batch_id: batch!.batch_id,
        size: 200,
      });
      const rest = await Promise.all(
        Array.from({ length: first.total_pages - 1 }, (_, i) =>
          client.devices.listCommands({
            batch_id: batch!.batch_id,
            size: 200,
            page: i + 2,
          }),
        ),
      );
      return [...first.items, ...rest.flatMap((page) => page.items)];
    },
    refetchInterval: (query) =>
      query.state.data?.every((command) => command.status !== "pending")
        ? false
        : 1000,
  });

  return {
    preview,
    selected,
    setSelected,
    batch,
    busy,
    error,
    changed,
    prepare,
    confirm,
    commands: results.data ?? batch?.commands ?? [],
    resultsError: results.error,
    cancel: () => {
      if (!inFlight.current) {
        setPreview(null);
        setChanged(false);
        setError(null);
      }
    },
  };
}
