import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

interface ConfirmButtonProps extends Omit<
  React.ComponentProps<typeof Button>,
  "onClick" | "asChild"
> {
  confirmTitle: React.ReactNode;
  confirmDetails: React.ReactNode;
  confirmLabel?: React.ReactNode;
  icon?: React.ReactNode;
  onConfirm: React.ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
}

export const ConfirmButton: React.FC<ConfirmButtonProps> = ({
  confirmTitle,
  confirmDetails,
  confirmLabel,
  onConfirm,
  icon,
  children,
  ...buttonProps
}) => {
  const { t } = useTranslation();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button {...buttonProps}>{children}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          {icon && (
            <div className="bg-muted rounded-sm p-2 self-center">{icon}</div>
          )}
          <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{confirmDetails}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {confirmLabel ?? children ?? t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
