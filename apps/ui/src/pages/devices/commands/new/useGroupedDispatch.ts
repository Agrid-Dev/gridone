import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isGridoneError,
  type AttributeWritePayload,
  type BatchDispatchResponse,
  type Device,
  type UnitCommand,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import type { DevicesFilter } from "@/lib/devices";

export type CommandPreview = {
  devices: Device[];
  target: DevicesFilter;
  write: AttributeWritePayload;
  scope: string;
  label: string;
  unit?: string | null;
};
export type DispatchSnapshot = CommandPreview & {
  result?: BatchDispatchResponse;
  empty?: boolean;
  error?: Error;
};

/** Keep the preview after dispatch, including vanished devices, while polling
 * every page of this batch. Named saves and ephemeral dispatches have separate
 * lifecycles so dispatch can never hide a previously saved template. */
export function useGroupedDispatch() {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<DispatchSnapshot>();
  const inFlight = useRef(false);
  const save = useMutation({
    mutationFn: ({
      preview,
      name,
    }: {
      preview: CommandPreview;
      name: string;
    }) =>
      client.devices.commandTemplates.create({
        target: preview.target,
        write: preview.write,
        name,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["command-templates"] }),
  });
  const dispatch = useMutation({
    mutationFn: async (preview: CommandPreview) => {
      const template = await client.devices.commandTemplates.create({
        target: preview.target,
        write: preview.write,
        name: null,
      });
      return client.devices.commandTemplates.dispatch(template.id);
    },
    onSuccess: (result, preview) => {
      setSnapshot({ ...preview, result, empty: result.commands.length === 0 });
      queryClient.invalidateQueries({ queryKey: ["commands"] });
    },
    onError: (error, preview) =>
      setSnapshot({
        ...preview,
        error,
        empty:
          isGridoneError(error) &&
          error.status === 422 &&
          error.detail === "Target resolved to no devices",
      }),
  });
  const batchId = snapshot?.result?.batch_id;
  const tracking = useQuery({
    queryKey: ["commands", "batch-tracking", batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const commands: UnitCommand[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await client.devices.listCommands({
          batch_id: batchId,
          page,
          size: 100,
        });
        commands.push(...response.items);
        totalPages = response.total_pages;
        page += 1;
      } while (page <= totalPages);
      return commands;
    },
    refetchInterval: (query) => {
      const commands = query.state.data ?? snapshot?.result?.commands ?? [];
      return commands.length === 0 ||
        commands.some((command) => command.status === "pending")
        ? 2000
        : false;
    },
  });
  const commands = tracking.data ?? snapshot?.result?.commands ?? [];
  const commandsByDevice = new Map(
    commands.map((command) => [command.device_id, command]),
  );
  const previewIds = new Set(snapshot?.devices.map((device) => device.id));
  const addedCommands = commands.filter(
    (command) => !previewIds.has(command.device_id),
  );

  return {
    snapshot,
    commandsByDevice,
    addedCommands,
    trackingError: tracking.error,
    isDispatching: dispatch.isPending,
    isSaving: save.isPending,
    saveError: save.error,
    save: (preview: CommandPreview, name: string) =>
      save.mutateAsync({ preview, name }),
    dispatch: async (preview: CommandPreview) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setSnapshot(preview);
      try {
        await dispatch.mutateAsync(preview);
      } catch {
        /* rendered in the rail */
      } finally {
        inFlight.current = false;
      }
    },
    clear: () => setSnapshot(undefined),
  };
}
