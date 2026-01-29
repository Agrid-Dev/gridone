import React from "react";
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
  icon?: React.ReactNode;
  onConfirm: React.ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
}

export const ConfirmButton: React.FC<ConfirmButtonProps> = ({
  confirmTitle,
  confirmDetails,
  onConfirm,
  icon,
  ...buttonProps
}) => {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button {...buttonProps} />
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
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction {...buttonProps} onClick={onConfirm} />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
