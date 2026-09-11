import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  GROUPED_COMMAND_CONFIRMATION_THRESHOLD,
  templateNameSchema,
} from "./groupedCommand";
import { useGroupedDispatch, type CommandPreview } from "./useGroupedDispatch";

export function useGroupedCommandActions(preview: CommandPreview | undefined) {
  const { t } = useTranslation("devices");
  const dispatch = useGroupedDispatch();
  const [confirmation, setConfirmation] = useState<CommandPreview>();
  const [saveOpen, setSaveOpen] = useState(false);
  const nameForm = useForm({
    resolver: zodResolver(templateNameSchema),
    defaultValues: { name: "" },
  });
  return {
    ...dispatch,
    confirmation,
    saveOpen,
    setSaveOpen,
    nameForm,
    requestDispatch: () => {
      if (!preview || dispatch.isDispatching) return;
      if (preview.devices.length > GROUPED_COMMAND_CONFIRMATION_THRESHOLD)
        setConfirmation(preview);
      else void dispatch.dispatch(preview);
    },
    cancelConfirmation: () => setConfirmation(undefined),
    confirmDispatch: () => {
      if (confirmation) void dispatch.dispatch(confirmation);
      setConfirmation(undefined);
    },
    saveTemplate: nameForm.handleSubmit(async ({ name }) => {
      if (!preview) return;
      try {
        await dispatch.save(preview, name);
        setSaveOpen(false);
        nameForm.reset();
        toast.success(t("commands.new.save.savedFeedback"));
      } catch {
        /* displayed in the popover */
      }
    }),
  };
}
