import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/ConfirmButton";

type ResourceDeleteButtonProps = {
  onDelete: () => void;
  isDeleting?: boolean;
  confirmTitle: string;
  confirmDetails: string;
  deleteLabel?: string;
};

/** The discreet destructive Delete for a resource header: a ghost icon button
 *  that opens a confirmation dialog (via ConfirmButton) before deleting. */
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
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-destructive"
      aria-label={label}
      disabled={isDeleting}
      onConfirm={onDelete}
      confirmTitle={confirmTitle}
      confirmDetails={confirmDetails}
      confirmLabel={label}
    >
      <Trash2 className="h-4 w-4" />
    </ConfirmButton>
  );
}
