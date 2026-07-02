import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputController } from "@/components/forms/controllers/InputController";

type SetpointDialogProps = {
  label: string;
  unit: string;
  currentValue: number | null;
  onClose: () => void;
  onSave: (value: number) => void | Promise<void>;
};

/** Modal editor for a single numeric setpoint. Mount it only while open —
 *  the form resets by remounting, not by syncing state. */
export function SetpointDialog({
  label,
  unit,
  currentValue,
  onClose,
  onSave,
}: SetpointDialogProps) {
  const { t } = useTranslation("standardDevices");
  const { t: tCommon } = useTranslation("common");

  // InputController stores number | undefined for type="number" inputs.
  const schema = z.object({
    value: z.number(t("ahu_double_flux.synoptic.invalidNumber")),
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { value: currentValue ?? undefined },
  });

  const submit = form.handleSubmit(async ({ value }) => {
    await onSave(value);
    onClose();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t("ahu_double_flux.synoptic.editSetpoint")}
          </DialogTitle>
          <DialogDescription>
            {t("ahu_double_flux.synoptic.editSetpointDescription", { label })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <InputController
            control={form.control}
            name="value"
            type="number"
            label={`${label} (${unit})`}
            inputProps={{ step: "any", autoFocus: true }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tCommon("common.cancel")}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {tCommon("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
