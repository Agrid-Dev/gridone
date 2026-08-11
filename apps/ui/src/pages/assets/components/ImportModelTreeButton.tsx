import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FolderTree, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { TreeImportResponse } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

type ImportModelTreeButtonProps = {
  assetId: string;
};

/**
 * Destructive "import tree from IFC" action of the 3D-model card: replaces
 * the building's subtree with the model's floors and rooms after an explicit
 * confirmation, then reports what was created and unlinked.
 *
 * The dialog is controlled (not trigger-driven) because after a successful
 * import the same dialog switches to the result report instead of closing.
 */
export function ImportModelTreeButton({ assetId }: ImportModelTreeButtonProps) {
  const { t } = useTranslation(["assets", "common"]);
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<TreeImportResponse | null>(null);

  const importMutation = useMutation({
    mutationFn: () => client.assets.importModelTree(assetId),
    onSuccess: (result) => {
      setReport(result);
      // The import rewrites the whole subtree and its device links: sweep
      // every asset-scoped query (list, tree, children, devices, model).
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const close = () => {
    setOpen(false);
    setReport(null);
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FolderTree />
        {t("editPage.model.import")}
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <AlertDialogContent>
          {report === null ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("editPage.model.importConfirmTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("editPage.model.importConfirmDetails")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={importMutation.isPending}
                  onClick={close}
                >
                  {t("common:common.cancel")}
                </Button>
                {/* Plain Button, not AlertDialogAction: the dialog must stay
                    open to show the report once the import succeeds. */}
                <Button
                  type="button"
                  className="bg-destructive text-white hover:bg-destructive/90"
                  disabled={importMutation.isPending}
                  onClick={() => importMutation.mutate()}
                >
                  {importMutation.isPending && (
                    <Loader2 className="animate-spin" aria-hidden />
                  )}
                  {t("editPage.model.importConfirm")}
                </Button>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("editPage.model.importDoneTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("editPage.model.importDoneDetails")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <ul className="space-y-1 text-sm text-foreground">
                <li>
                  {t("editPage.model.importedFloors", {
                    count: report.floors_created,
                  })}
                </li>
                <li>
                  {t("editPage.model.importedRooms", {
                    count: report.rooms_created,
                  })}
                </li>
                <li>
                  {t("editPage.model.importedDevicesUnlinked", {
                    count: report.devices_unlinked,
                  })}
                </li>
              </ul>
              <AlertDialogFooter>
                <Button type="button" onClick={close}>
                  {t("editPage.model.importClose")}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
