import { useDeferredValue, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Maximize2, X } from "lucide-react";
import {
  SynopticRenderer,
  type PlateDocument,
} from "@/components/synoptic/SynopticRenderer";
import { Button } from "@/components/ui/button";

/**
 * The plate as its operators will see it, in the isometric view, drawn
 * live beside the plan it is authored on. It follows the edits a beat
 * behind (a deferred copy), so dragging a symbol stays smooth, and it
 * takes no pointer: the wheel and the drags are the plan's.
 */
export function PreviewCard({
  doc,
  onExpand,
  onClose,
}: {
  doc: PlateDocument;
  onExpand: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("synoptics");
  const iso = useMemo<PlateDocument>(
    () => ({ ...doc, projection: "isometric" }),
    [doc],
  );
  const deferred = useDeferredValue(iso);
  return (
    <div
      data-editor-preview-card
      className="absolute bottom-3 right-3 w-72 overflow-hidden rounded-xl border bg-card shadow-lg"
    >
      <div className="flex items-center justify-between py-1 pl-3 pr-1">
        <span className="text-sm font-medium">{t("editor.preview.title")}</span>
        <span className="flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t("editor.preview.expand")}
            onClick={onExpand}
          >
            <Maximize2 aria-hidden className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t("editor.preview.close")}
            onClick={onClose}
          >
            <X aria-hidden className="size-4" />
          </Button>
        </span>
      </div>
      <div
        className="pointer-events-none h-40 border-y bg-synoptic-plate"
        aria-hidden
      >
        <SynopticRenderer doc={deferred} animated={false} />
      </div>
      <p className="px-3 py-1.5 text-xs text-muted-foreground">
        {t("editor.preview.caption")}
      </p>
    </div>
  );
}
