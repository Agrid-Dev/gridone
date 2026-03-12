import { useTranslation } from "react-i18next";
import { ConfirmButton } from "@/components/ConfirmButton";

type DangerZoneProps = {
  onDelete: () => void;
  isDeleting?: boolean;
  confirmTitle: string;
  confirmDetails: string;
  deleteLabel?: string;
};

export function DangerZone({
  onDelete,
  isDeleting = false,
  confirmTitle,
  confirmDetails,
  deleteLabel,
}: DangerZoneProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <h3 className="text-sm font-medium text-destructive">
        {t("common.dangerZone")}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("common.dangerZoneDescription")}
      </p>
      <div className="mt-4">
        <ConfirmButton
          variant="outline"
          className="text-destructive"
          onConfirm={onDelete}
          confirmTitle={confirmTitle}
          confirmDetails={confirmDetails}
          disabled={isDeleting}
        >
          {deleteLabel ?? t("common.delete")}
        </ConfirmButton>
      </div>
    </div>
  );
}
