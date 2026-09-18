import { useGroupCommand } from "@/components/group-command/useGroupCommand";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { useState, type BaseSyntheticEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Device, UnitCommand } from "@gridone/sdk";
import {
  templateNameSchema,
  type CommandPayload,
  type DispatchSnapshot,
} from "./groupedCommand";

/** A command ready to leave: the wire payload and the devices it was previewed
 *  against. No display text — the rail supplies its own. */
export type PendingCommand = {
  payload: CommandPayload;
  devices: Device[];
};

export type GroupedCommandActions = {
  /** The dispatched command, kept while its batch is tracked. */
  groupCommand: ReturnType<typeof useGroupCommand>;
  snapshot: DispatchSnapshot | undefined;
  commandsByDevice: Map<string, UnitCommand>;
  /** Commands the server created for devices that were not in the preview. */
  addedCommands: UnitCommand[];
  trackingError: Error | null;
  isDispatching: boolean;
  isSaving: boolean;
  saveError: Error | null;
  saveOpen: boolean;
  setSaveOpen: (open: boolean) => void;
  nameForm: UseFormReturn<{ name: string }>;
  requestDispatch: () => void;
  saveTemplate: (event?: BaseSyntheticEvent) => Promise<void>;
  clear: () => void;
};

export function useGroupedCommandActions(
  command: PendingCommand | undefined,
): GroupedCommandActions {
  const { t } = useTranslation(["devices", "common"]);
  const client = useGridoneClient();
  const groupCommand = useGroupCommand(command?.payload.target ?? {});
  const cache = useQueryClient();
  const [reviewed, setReviewed] = useState<PendingCommand>();
  const save = useMutation({
    mutationFn: ({
      payload,
      name,
    }: {
      payload: CommandPayload;
      name: string;
    }) => client.devices.commandTemplates.create({ ...payload, name }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["command-templates"] }),
  });
  const snapshot =
    reviewed && (groupCommand.batch || groupCommand.sending)
      ? {
          ...reviewed,
          result: groupCommand.batch ?? undefined,
          empty: groupCommand.batch?.commands.length === 0,
        }
      : undefined;
  const commandsByDevice = new Map(
    groupCommand.commands.map((item) => [item.device_id, item]),
  );
  const reviewedIds = new Set(reviewed?.devices.map((device) => device.id));
  const [saveOpen, setSaveOpen] = useState(false);
  const nameForm = useForm({
    resolver: zodResolver(templateNameSchema),
    defaultValues: { name: "" },
  });
  return {
    groupCommand,
    snapshot,
    commandsByDevice,
    addedCommands: groupCommand.commands.filter(
      (item) => !reviewedIds.has(item.device_id),
    ),
    trackingError: groupCommand.resultsError,
    isDispatching: groupCommand.busy,
    isSaving: save.isPending,
    saveError: save.error,
    clear: () => {
      setReviewed(undefined);
      groupCommand.cancel();
    },
    saveOpen,
    setSaveOpen,
    nameForm,
    requestDispatch: () => {
      if (!command || groupCommand.busy) return;
      setReviewed(command);
      void groupCommand.prepare(
        command.payload.write.attribute,
        command.payload.write.value,
        {
          ...command.payload.target,
          ids: command.devices.map((device) => device.id),
        },
      );
    },
    saveTemplate: nameForm.handleSubmit(async ({ name }) => {
      if (!command) return;
      try {
        await save.mutateAsync({ payload: command.payload, name });
        setSaveOpen(false);
        nameForm.reset();
        toast.success(t("commands.new.save.savedFeedback"));
      } catch {
        /* displayed in the popover */
      }
    }),
  };
}
