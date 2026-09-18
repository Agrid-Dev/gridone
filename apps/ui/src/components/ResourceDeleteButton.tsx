import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/ConfirmButton";

type ResourceDeleteButtonProps = {
  onDelete: () => void | Promise<unknown>;
  isDeleting?: boolean;
  confirmTitle: string;
  confirmDetails: string;
  deleteLabel?: string;
};

/** Named destructive action with the shared asynchronous confirmation. */
export function ResourceDeleteButton({
  onDelete,
  isDeleting = false,
  confirmTitle,
  confirmDetails,
  deleteLabel,
}: ResourceDeleteButtonProps) {
  const { t } = useTranslation();
  const label = deleteLabel ?? t("common.delete");

  return (
    <ConfirmButton
      variant="outline"
      className="min-h-11 text-destructive hover:text-destructive"
      aria-label={label}
      disabled={isDeleting}
      onConfirm={onDelete}
      confirmTitle={confirmTitle}
      confirmDetails={
        <>
          {confirmDetails} {t("deletion.irreversible")}
        </>
      }
      confirmLabel={label}
    >
      <Trash2 className="h-4 w-4" />
      {label}
    </ConfirmButton>
  );
}
