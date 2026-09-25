import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Maximize,
  Minus,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ChecksList } from "./ChecksList";
import { isInline } from "./library";
import type { SynopticEditorState } from "./useSynopticEditor";

type Hint = { key?: string; text: string };

/** The keys and gestures that apply now: to the tool in hand, or to what
 *  is being placed. */
function useHints(editor: SynopticEditorState): Hint[] {
  const { t } = useTranslation("synoptics");
  const holding = editor.dragType ?? editor.placing;
  if (holding) {
    return [
      {
        text: t(
          isInline(holding) ? "editor.hints.placeOnPipe" : "editor.hints.place",
        ),
      },
      { key: t("editor.keys.escape"), text: t("editor.hints.cancel") },
    ];
  }
  if (editor.tool === "pipe") {
    return [
      { key: t("editor.keys.click"), text: t("editor.hints.portOrBend") },
      { key: t("editor.keys.enter"), text: t("editor.hints.finish") },
      { key: "⌫", text: t("editor.hints.undoPoint") },
      { key: t("editor.keys.escape"), text: t("editor.hints.cancel") },
    ];
  }
  return [
    { key: "V", text: t("editor.tools.select") },
    { key: "P", text: t("editor.tools.pipe") },
    { key: "R", text: t("editor.shortcuts.rotate") },
    { key: t("editor.keys.delete"), text: t("editor.shortcuts.delete") },
    { text: t("editor.hints.pan") },
  ];
}

/**
 * The strip under the plan: the zoom, what the keys do now, and what to
 * check before saving.
 */
export function EditorStatusBar({
  editor,
  scale,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  editor: SynopticEditorState;
  /** The view's scale, 1 being the fitted plate. */
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  const { t } = useTranslation("synoptics");
  const [open, setOpen] = useState(false);
  const hints = useHints(editor);
  const { checks } = editor;
  const errors = checks.some((c) => c.severity === "error");
  const Icon = errors ? CircleAlert : AlertTriangle;
  const percent = Math.round(scale * 100);
  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-t bg-card px-2">
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t("view.zoomOut")}
          onClick={onZoomOut}
        >
          <Minus aria-hidden className="size-4" />
        </Button>
        <span
          className="w-12 text-center text-xs font-medium tabular-nums"
          aria-label={t("view.zoom", { percent })}
        >
          {percent} %
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t("view.zoomIn")}
          onClick={onZoomIn}
        >
          <Plus aria-hidden className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2"
          onClick={onFit}
        >
          <Maximize aria-hidden className="size-3.5" />
          {t("view.fit")}
        </Button>
      </div>
      <span aria-hidden className="h-5 w-px bg-border" />
      <p
        className="flex min-w-0 flex-1 items-center gap-3.5 overflow-hidden whitespace-nowrap text-xs text-muted-foreground"
        data-editor-hints
      >
        {hints.map((hint, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            {hint.key && <Kbd>{hint.key}</Kbd>}
            {hint.text}
          </span>
        ))}
      </p>
      {checks.length === 0 ? (
        <span className="inline-flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
          <CheckCircle2 aria-hidden className="size-4 text-status-ok" />
          {t("editor.checks.none")}
        </span>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-checks-pill
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                errors
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-status-warning/40 bg-status-warning/10 text-status-warning",
              )}
            >
              <Icon aria-hidden className="size-4" />
              {t("editor.checks.title", { count: checks.length })}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" side="top" className="w-96">
            <ChecksList editor={editor} onPick={() => setOpen(false)} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
