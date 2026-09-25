import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Synoptic } from "@gridone/sdk";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";
import { EMPTY_VALUES } from "@/components/synoptic/values";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlateView } from "../PlateView";

/** The id a plate not yet saved goes by in the preview. */
const DRAFT = "draft";

/**
 * The draft in the page operators open, before it is saved: the plate
 * view itself, with its views, zoom and legend, and no readings yet.
 */
export function PreviewDialog({
  open,
  onOpenChange,
  doc,
  id,
  knownSynoptics,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: PlateDocument;
  /** The stored plate's id, or none for a new one. */
  id: string | null;
  knownSynoptics: ReadonlySet<string>;
}) {
  const { t } = useTranslation("synoptics");
  const draft = useMemo<Synoptic>(
    () => ({ ...doc, id: id ?? DRAFT, metadata: {} }) as Synoptic,
    [doc, id],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-w-[min(90vw,90rem)] flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{t("editor.preview.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("editor.preview.dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <PlateView
            doc={draft}
            values={EMPTY_VALUES}
            knownSynoptics={knownSynoptics}
            onNavigate={() => {}}
            className="min-h-0 flex-1"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
