import { useState, type ComponentProps, type ReactNode } from "react";
import { Button } from "./ui/button";
import { AlertDialogTrigger } from "./ui/alert-dialog";
import { ConfirmationDialog } from "./ConfirmationDialog";

interface ConfirmButtonProps extends Omit<
  ComponentProps<typeof Button>,
  "onClick" | "asChild"
> {
  confirmTitle: ReactNode;
  confirmDetails: ReactNode;
  confirmLabel?: ReactNode;
  /** An action that is not a deletion says so while it runs and when it fails;
   *  both default to the deletion wording. */
  confirmPendingLabel?: ReactNode;
  confirmErrorLabel?: string;
  icon?: ReactNode;
  onConfirm: () => Promise<unknown>;
}

export function ConfirmButton({
  confirmTitle,
  confirmDetails,
  confirmLabel,
  confirmPendingLabel,
  confirmErrorLabel,
  onConfirm,
  icon,
  children,
  ...buttonProps
}: ConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={setOpen}
      onConfirm={onConfirm}
      title={confirmTitle}
      details={confirmDetails}
      label={confirmLabel ?? children}
      pendingLabel={confirmPendingLabel}
      errorLabel={confirmErrorLabel}
      icon={icon}
    >
      <AlertDialogTrigger asChild>
        <Button {...buttonProps}>{children}</Button>
      </AlertDialogTrigger>
    </ConfirmationDialog>
  );
}
