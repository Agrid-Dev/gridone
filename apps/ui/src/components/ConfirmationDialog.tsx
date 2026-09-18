import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConfirmation } from "@/hooks/useConfirmation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

export type ConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<unknown>;
  title: ReactNode;
  details: ReactNode;
  label?: ReactNode;
  pendingLabel?: ReactNode;
  /** Shown when the server gives no message of its own. Defaults to the
   *  deletion wording, so any other action passes its own. */
  errorLabel?: string;
  children?: ReactNode;
  icon?: ReactNode;
  onCloseAutoFocus?: (event: Event) => void;
};

export function ConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  details,
  label,
  pendingLabel,
  errorLabel,
  children,
  icon,
  onCloseAutoFocus,
}: ConfirmationDialogProps) {
  const { t } = useTranslation();
  const { pending, error, changeOpen, confirm } = useConfirmation(
    onConfirm,
    onOpenChange,
    errorLabel,
  );
  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      {children}
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onCloseAutoFocus={onCloseAutoFocus}
        aria-busy={pending}
      >
        <AlertDialogHeader>
          {icon && (
            <div className="self-center rounded-sm bg-muted p-2">{icon}</div>
          )}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{details}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" disabled={pending}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            {pending
              ? (pendingLabel ?? t("deletion.pending"))
              : (label ?? t("common.delete"))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
