import { useGroupCommand } from "@/components/group-command/useGroupCommand";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { serverErrorMessage } from "@/lib/serverErrorMessage";
import { useRef, useState, type BaseSyntheticEvent } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Device, UnitCommand } from "@gridone/sdk";
import {
  GROUPED_COMMAND_CONFIRMATION_THRESHOLD,
  templateNameSchema,
} from "./groupedCommand";
import {
  useGroupedDispatch,
  type CommandPayload,
  type DispatchSnapshot,
} from "./useGroupedDispatch";

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
  /** Set while a large dispatch awaits confirmation. */
  confirmation: PendingCommand | undefined;
  saveOpen: boolean;
  setSaveOpen: (open: boolean) => void;
  nameForm: UseFormReturn<{ name: string }>;
  requestDispatch: () => void;
  cancelConfirmation: () => void;
  confirmDispatch: () => void;
  saveTemplate: (event?: BaseSyntheticEvent) => Promise<void>;
  clear: () => void;
};

export function useGroupedCommandActions(
  command: PendingCommand | undefined,
): GroupedCommandActions {
  const { t } = useTranslation(["devices", "common"]);
  const dispatch = useGroupedDispatch();
  const client = useGridoneClient();
  const groupCommand = useGroupCommand(command?.payload.target ?? {});
  const [preparing, setPreparing] = useState(false);
  const preparingRef = useRef(false);
  const [confirmation, setConfirmation] = useState<PendingCommand>();
  const [saveOpen, setSaveOpen] = useState(false);
  const nameForm = useForm({
    resolver: zodResolver(templateNameSchema),
    defaultValues: { name: "" },
  });
  return {
    groupCommand,
    snapshot: dispatch.snapshot,
    commandsByDevice: dispatch.commandsByDevice,
    addedCommands: dispatch.addedCommands,
    trackingError: dispatch.trackingError,
    isDispatching: dispatch.isDispatching || preparing || groupCommand.busy,
    isSaving: dispatch.isSaving,
    saveError: dispatch.saveError,
    clear: dispatch.clear,
    confirmation,
    saveOpen,
    setSaveOpen,
    nameForm,
    requestDispatch: async () => {
      if (!command || dispatch.isDispatching || preparingRef.current) return;
      preparingRef.current = true;
      setPreparing(true);
      try {
        const preview = await client.devices.previewCommand({
          target: command.payload.target,
          attribute: command.payload.write.attribute,
          value: command.payload.write.value,
          device_ids: command.devices.map((device) => device.id),
        });
        if (preview.members.some((row) => row.user_confirmation)) {
          await groupCommand.review(preview);
        } else if (
          command.devices.length > GROUPED_COMMAND_CONFIRMATION_THRESHOLD
        ) {
          setConfirmation(command);
        } else {
          await dispatch.dispatch(command.payload, command.devices);
        }
      } catch (error) {
        toast.error(serverErrorMessage(error) ?? t("common:errors.default"));
      } finally {
        preparingRef.current = false;
        setPreparing(false);
      }
    },
    cancelConfirmation: () => setConfirmation(undefined),
    confirmDispatch: () => {
      if (confirmation)
        void dispatch.dispatch(confirmation.payload, confirmation.devices);
      setConfirmation(undefined);
    },
    saveTemplate: nameForm.handleSubmit(async ({ name }) => {
      if (!command) return;
      try {
        await dispatch.save(command.payload, name);
        setSaveOpen(false);
        nameForm.reset();
        toast.success(t("commands.new.save.savedFeedback"));
      } catch {
        /* displayed in the popover */
      }
    }),
  };
}
