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
  const { t } = useTranslation();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" type="button" disabled={isDeleting}>
          <TrashIcon className="mr-2 h-4 w-4" />
          {t("transports.deleteAction")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("transports.deleteDialog.title", {
              defaultValue: t("transports.deleteAction"),
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("transports.deleteConfirm", { name: transportName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t("transports.deleteAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
