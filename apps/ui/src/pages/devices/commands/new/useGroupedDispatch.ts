import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isGridoneError,
  type AttributeWritePayload,
  type BatchDispatchResponse,
  type Device,
  type GridoneClient,
  type UnitCommand,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { isTagTarget, type DevicesFilter } from "@/lib/devices";

/** Exactly what goes on the wire — no display text, so a dispatch never has to
 *  route through the i18n layer to be issued. Its rendering counterpart is
 *  `CommandDisplay`. */
export type CommandPayload = {
  target: DevicesFilter;
  write: AttributeWritePayload;
};

export type DispatchSnapshot = {
  payload: CommandPayload;
  /** The devices as previewed, kept so the rail can report the ones that
   *  vanished from the target between preview and dispatch. */
  devices: Device[];
  result?: BatchDispatchResponse;
  empty?: boolean;
  error?: Error;
};

const POLL_INTERVAL_MS = 2000;
/** A batch whose commands are not listable yet is worth a few retries; past
 *  that it is not a delay but an empty batch, and polling must stop. */
const EMPTY_LISTING_RETRIES = 5;
/** The server's 422 detail when a dispatched target resolves to no device. */
const EMPTY_TARGET_DETAIL = "Target resolved to no devices";

/** A previewed tag target left no eligible recipient: the batch would be
 *  empty, which the rail reports the same way as a server-side empty target. */
class EmptyPreviewError extends Error {}

function isEmptyTarget(error: unknown): boolean {
  return (
    error instanceof EmptyPreviewError ||
    (isGridoneError(error) &&
      error.status === 422 &&
      error.detail === EMPTY_TARGET_DETAIL)
  );
}

/** Ephemeral dispatch of an id or type target: a nameless template, fired once. */
async function dispatchTemplate(
  client: GridoneClient,
  payload: CommandPayload,
): Promise<BatchDispatchResponse> {
  const template = await client.devices.commandTemplates.create({
    ...payload,
    name: null,
  });
  return client.devices.commandTemplates.dispatch(template.id);
}

/** Restrict a live target to the recipients already reviewed in the rail.
 *  The server rechecks eligibility before confirming; a device joining since
 *  the review never receives this one-shot write. Saved targets stay dynamic. */
async function dispatchPreviewed(
  client: GridoneClient,
  payload: CommandPayload,
  devices: Device[],
): Promise<BatchDispatchResponse> {
  const reviewedIds = new Set(devices.map((device) => device.id));
  const preview = await client.devices.previewCommand({
    attribute: payload.write.attribute,
    value: payload.write.value,
    target: payload.target,
    device_ids: [...reviewedIds],
  });
  const deviceIds = preview.members
    .filter((member) => member.eligible && reviewedIds.has(member.device_id))
    .map((member) => member.device_id);
  if (deviceIds.length === 0) throw new EmptyPreviewError();
  return client.devices.confirmCommand({
    token: preview.token,
    device_ids: deviceIds,
  });
}

/** Keep the preview after dispatch, including vanished devices, while polling
 * every page of this batch. Named saves and ephemeral dispatches have separate
 * lifecycles so dispatch can never hide a previously saved template. */
export function useGroupedDispatch() {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<DispatchSnapshot>();
  const inFlight = useRef(false);
  const emptyListings = useRef(0);
  const save = useMutation({
    mutationFn: ({
      payload,
      name,
    }: {
      payload: CommandPayload;
      name: string;
    }) => client.devices.commandTemplates.create({ ...payload, name }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["command-templates"] }),
  });
  const dispatch = useMutation({
    mutationFn: ({
      payload,
      devices,
    }: Pick<DispatchSnapshot, "payload" | "devices">) =>
      isTagTarget(payload.target)
        ? dispatchPreviewed(client, payload, devices)
        : dispatchTemplate(client, payload),
    onSuccess: (result) =>
      setSnapshot(
        (current) =>
          current && {
            ...current,
            result,
            empty: result.commands.length === 0,
          },
      ),
    onError: (error) =>
      setSnapshot(
        (current) =>
          current && { ...current, error, empty: isEmptyTarget(error) },
      ),
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
      // The server already said this batch holds no command: there is nothing
      // left to appear, and polling would never end.
      if (snapshot?.empty) return false;
      const commands = query.state.data ?? snapshot?.result?.commands ?? [];
      if (commands.length === 0) {
        emptyListings.current += 1;
        return emptyListings.current <= EMPTY_LISTING_RETRIES
          ? POLL_INTERVAL_MS
          : false;
      }
      emptyListings.current = 0;
      return commands.some((command) => command.status === "pending")
        ? POLL_INTERVAL_MS
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
    save: (payload: CommandPayload, name: string) =>
      save.mutateAsync({ payload, name }),
    dispatch: async (payload: CommandPayload, devices: Device[]) => {
      if (inFlight.current) return;
      inFlight.current = true;
      emptyListings.current = 0;
      setSnapshot({ payload, devices });
      try {
        await dispatch.mutateAsync({ payload, devices });
      } catch {
        /* rendered in the rail */
      } finally {
        inFlight.current = false;
      }
    },
    clear: () => setSnapshot(undefined),
  };
}
