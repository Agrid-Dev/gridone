import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { InputController } from "@/components/forms/controllers/InputController";
import { ServerErrorAlert } from "@/components/forms/schema-form/ServerErrorAlert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { serverErrorMessage } from "@/lib/serverErrorMessage";

interface FolderFormValues {
  name: string;
}

/** Names a new folder or renames one; stays open with the server's message
 *  when saving fails. */
export function FolderDialog({
  open,
  title,
  submitLabel,
  defaultName = "",
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  submitLabel: string;
  defaultName?: string;
  onSubmit: (name: string) => Promise<unknown>;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {open && (
          <FolderForm
            defaultName={defaultName}
            submitLabel={submitLabel}
            onSubmit={onSubmit}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FolderForm({
  defaultName,
  submitLabel,
  onSubmit,
  onClose,
}: {
  defaultName: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useTranslation("documents");
  const schema = useMemo(
    () => z.object({ name: z.string().trim().min(1).max(255) }),
    [],
  );
  const form = useForm<FolderFormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { name: defaultName },
  });
  const submit = form.handleSubmit(async ({ name }) => {
    form.clearErrors("root");
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (error) {
      form.setError("root", {
        message: serverErrorMessage(error) || t("error"),
      });
    }
  });
  const { isSubmitting, isValid, errors } = form.formState;
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <InputController
        name="name"
        control={form.control}
        label={t("folderName")}
        required
      />
      <ServerErrorAlert message={errors.root?.message} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={!isValid || isSubmitting}>
          {isSubmitting ? t("saving") : submitLabel}
        </Button>
      </div>
    </form>
  );
}
