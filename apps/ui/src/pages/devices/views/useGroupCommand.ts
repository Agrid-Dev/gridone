import { useCallback, useMemo, useRef, useState } from "react";
import {
  hashKey,
  queryOptions,
  useQueries,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  BatchDispatchResponse,
  SelectionCommandPrepare,
  SelectionCommandPreview,
  UnitCommand,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import type { Scalar } from "@/components/device-ui/conditions";
import { groupConflict } from "./GroupError";
import type { DevicesFilter } from "@/lib/devices";

export type GroupCommandWrite = { attribute: string; value: Scalar };

export type GroupCommandPreparation = {
  write: GroupCommandWrite;
  request: SelectionCommandPrepare;
  preview: SelectionCommandPreview | null;
  selected: string[];
  error: unknown;
  changed: boolean;
  needsRefresh: boolean;
  uncertain: boolean;
  batch: BatchDispatchResponse | null;
};

export function canConfirmPreparation(item: GroupCommandPreparation): boolean {
  return (
    !item.batch &&
    !!item.preview &&
    item.selected.length > 0 &&
    !item.needsRefresh &&
    !(item.uncertain && groupConflict(item.error))
  );
}

/** Compare command intentions independently of object and filter value order.
 * A retry after a lost response must reuse its token and original recipients.
 */
function preparationKey(request: SelectionCommandPrepare): string {
  const { driver_id, ids, types, tags, asset_id } = request.target;
  return hashKey([
    request.attribute,
    request.value,
    {
      driver_id: driver_id ?? undefined,
      ids: ids ? [...ids].sort() : undefined,
      types: types ? [...types].sort() : undefined,
      tags: tags
        ? Object.fromEntries(
            Object.entries(tags).map(([key, values]) => [
              key,
              [...values].sort(),
            ]),
          )
        : undefined,
      asset_id: asset_id ?? undefined,
    },
    request.device_ids ? [...request.device_ids].sort() : undefined,
  ]);
}

export function useGroupCommand(target: DevicesFilter) {
  const client = useGridoneClient();
  const cache = useQueryClient();
  const inFlight = useRef(false);
  const uncertainPreparations = useRef(
    new Map<string, GroupCommandPreparation>(),
  );
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const [preparations, setPreparations] = useState<GroupCommandPreparation[]>(
    [],
  );
  const updatePreparation = useCallback(
    (attribute: string, changes: Partial<GroupCommandPreparation>) =>
      setPreparations((current) =>
        current.map((item) =>
          item.write.attribute === attribute ? { ...item, ...changes } : item,
        ),
      ),
    [],
  );

  const prepareMany = useCallback(
    async (writes: GroupCommandWrite[], filter?: DevicesFilter) => {
      if (inFlight.current || !writes.length) return;
      inFlight.current = true;
      setBusy(true);
      // A draft has one absolute target per attribute; the latest value wins.
      const pending: GroupCommandPreparation[] = [
        ...new Map(writes.map((write) => [write.attribute, write])).values(),
      ].map((write) => {
        const request = { ...write, target: filter ?? target };
        return (
          uncertainPreparations.current.get(preparationKey(request)) ?? {
            write,
            request,
            preview: null,
            selected: [],
            error: null,
            changed: false,
            needsRefresh: false,
            uncertain: false,
            batch: null,
          }
        );
      });
      setPreparations(pending);
      setOpen(true);
      try {
        const results = await Promise.allSettled(
          pending.map((item) =>
            item.uncertain
              ? Promise.resolve(item.preview!)
              : client.devices.previewCommand(item.request),
          ),
        );
        setPreparations(
          pending.map((item, index) => {
            if (item.uncertain) return item;
            const result = results[index];
            return result.status === "fulfilled"
              ? {
                  ...item,
                  preview: result.value,
                  selected: result.value.members
                    .filter((member) => member.eligible)
                    .map((member) => member.device_id),
                }
              : { ...item, error: result.reason, needsRefresh: true };
          }),
        );
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [client, target],
  );

  const prepare = useCallback(
    (attribute: string, value: Scalar, filter?: DevicesFilter) =>
      prepareMany([{ attribute, value }], filter),
    [prepareMany],
  );

  /** Refresh only an invalidated preview, retaining the user's exclusions.
   * New members stay unchecked; a failed initial preview has no prior selection.
   */
  const refreshPreparation = async (item: GroupCommandPreparation) => {
    try {
      const refreshed = await client.devices.previewCommand(item.request);
      const eligible = refreshed.members
        .filter((member) => member.eligible)
        .map((member) => member.device_id);
      updatePreparation(item.write.attribute, {
        preview: refreshed,
        selected: item.preview
          ? item.selected.filter((id) => eligible.includes(id))
          : eligible,
        error: null,
        changed: !!item.preview,
        needsRefresh: false,
        uncertain: false,
      });
    } catch (error) {
      // Keep the previous members for review but make the consumed token unusable.
      updatePreparation(item.write.attribute, { error, needsRefresh: true });
    }
  };

  const retryPreview = async (attribute: string) => {
    const item = preparations.find((row) => row.write.attribute === attribute);
    if (!open || !item || item.batch || item.uncertain || inFlight.current)
      return;
    inFlight.current = true;
    setBusy(true);
    try {
      await refreshPreparation(item);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const confirm = async () => {
    const pending = preparations.filter(canConfirmPreparation);
    if (!open || !pending.length || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setSending(true);
    try {
      // Stop on the first failure. Accepted attributes stay recorded, while the
      // remaining attributes require another deliberate confirmation.
      for (const item of pending) {
        try {
          const batch = await client.devices.confirmCommand({
            token: item.preview!.token,
            device_ids: item.selected,
          });
          uncertainPreparations.current.delete(preparationKey(item.request));
          updatePreparation(item.write.attribute, {
            batch,
            error: null,
            uncertain: false,
          });
          void cache.invalidateQueries({ queryKey: ["commands"] });
        } catch (error) {
          const code = groupConflict(error)?.code;
          if (
            (code === "command_preview_changed" ||
              code === "command_preview_expired") &&
            !item.uncertain
          ) {
            uncertainPreparations.current.delete(preparationKey(item.request));
            updatePreparation(item.write.attribute, {
              error,
              uncertain: false,
            });
            await refreshPreparation({ ...item, uncertain: false });
            void cache.invalidateQueries({ queryKey: ["devices"] });
          } else {
            const uncertain = { ...item, error, uncertain: true };
            uncertainPreparations.current.set(
              preparationKey(item.request),
              uncertain,
            );
            updatePreparation(item.write.attribute, { error, uncertain: true });
          }
          // Other errors keep the original token: retrying an uncertain response
          // must use the server's idempotency instead of creating a second write.
          break;
        }
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
      setSending(false);
    }
  };

  const accepted = useMemo(
    () => preparations.filter((item) => item.batch !== null),
    [preparations],
  );
  const batches = useMemo(
    () => accepted.map((item) => item.batch!),
    [accepted],
  );
  const successfulWrites = useMemo(
    () => accepted.map((item) => item.write),
    [accepted],
  );
  const results = useQueries({
    queries: batches.map((batch) =>
      queryOptions({
        queryKey: ["group-command-results", batch.batch_id],
        queryFn: async (): Promise<UnitCommand[]> => {
          const first = await client.devices.listCommands({
            batch_id: batch.batch_id,
            size: 200,
          });
          const rest = await Promise.all(
            Array.from({ length: Math.max(0, first.total_pages - 1) }, (_, i) =>
              client.devices.listCommands({
                batch_id: batch.batch_id,
                size: 200,
                page: i + 2,
              }),
            ),
          );
          // Preserve commands that are not listable yet so pending work keeps polling.
          return [
            ...new Map(
              [
                ...batch.commands,
                ...first.items,
                ...rest.flatMap((page) => page.items),
              ].map((command) => [command.id, command]),
            ).values(),
          ];
        },
        refetchInterval: (query) =>
          (query.state.data ?? batch.commands).some(
            (command) => command.status === "pending",
          )
            ? 1000
            : false,
      }),
    ),
  });
  const first = preparations[0];
  return {
    preview: open ? (first?.preview ?? first?.request ?? null) : null,
    preparations,
    selected: first?.selected ?? [],
    setSelected: (selected: string[], attribute = first?.write.attribute) => {
      if (!open || inFlight.current) return;
      const item = preparations.find(
        (row) => row.write.attribute === attribute,
      );
      if (!item || item.batch || item.uncertain) return;
      const eligible = new Set(
        item.preview?.members
          .filter((row) => row.eligible)
          .map((row) => row.device_id),
      );
      updatePreparation(item.write.attribute, {
        selected: [...new Set(selected)].filter((id) => eligible.has(id)),
      });
    },
    batches,
    batch: batches.at(-1) ?? null,
    successfulWrites,
    busy,
    sending,
    error: preparations.find((item) => item.error)?.error ?? null,
    changed: preparations.some((item) => item.changed),
    prepare,
    prepareMany,
    retryPreview,
    confirm,
    commands: results.flatMap(
      (result, index) => result.data ?? batches[index].commands,
    ),
    resultsError: results.find((result) => result.error)?.error ?? null,
    cancel: () => {
      if (!inFlight.current) {
        setOpen(false);
        setPreparations((current) =>
          current.map((item) => ({ ...item, error: null, changed: false })),
        );
      }
    },
  };
}
