import { useTranslation } from "react-i18next";
import { TrashIcon } from "lucide-react";
import { Button } from "@/components/ui";
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
} from "@/components/ui/alert-dialog";

type TransportDeleteDialogProps = {
  transportName: string;
  onConfirm: () => void;
  isDeleting: boolean;
};

export function TransportDeleteDialog({
  transportName,
  onConfirm,
  isDeleting,
}: TransportDeleteDialogProps) {
  const { t } = useTranslation("transports");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" type="button" disabled={isDeleting}>
          <TrashIcon className="mr-2 h-4 w-4" />
          {t("deleteAction")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("deleteDialog.title", {
              defaultValue: t("deleteAction"),
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteConfirm", { name: transportName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common:common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t("deleteAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
