import { useTranslation } from "react-i18next";
import { ArrowLeft, Eye, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SynopticEditorState } from "./useSynopticEditor";
import { ViewSettings } from "./ViewSettings";

/**
 * The editor's own bar, standing in for the app's while it takes the
 * window: the way back, the plate's name typed in place, whether the work
 * is saved, undo and redo, the plate's settings, the preview, and the save.
 */
export function EditorTopBar({
  editor,
  onPreview,
}: {
  editor: SynopticEditorState;
  onPreview: () => void;
}) {
  const { t } = useTranslation(["synoptics", "common"]);
  const { history } = editor;
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3">
      <Button
        type="button"
        variant="ghost"
        className="gap-1.5 px-2"
        onClick={editor.leave}
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("title")}
      </Button>
      <span aria-hidden className="h-6 w-px bg-border" />
      <input
        aria-label={t("editor.name")}
        data-page-title
        value={editor.doc.name}
        onChange={(e) => editor.typeName(e.target.value)}
        onBlur={history.settle}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="h-9 w-72 min-w-0 rounded-md border border-transparent bg-transparent px-2 font-display text-lg font-semibold outline-none hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      {editor.dirty && (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <span aria-hidden className="size-2 rounded-full bg-status-warning" />
          {t("editor.unsaved")}
        </span>
      )}
      <span className="flex-1" />
      <span className="flex">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("editor.undo")}
          title={t("editor.undo")}
          aria-keyshortcuts="Meta+Z Control+Z"
          disabled={!history.canUndo}
          onClick={history.undo}
        >
          <Undo2 aria-hidden className="size-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("editor.redo")}
          title={t("editor.redo")}
          aria-keyshortcuts="Meta+Shift+Z Control+Y"
          disabled={!history.canRedo}
          onClick={history.redo}
        >
          <Redo2 aria-hidden className="size-5" />
        </Button>
        <ViewSettings editor={editor} />
      </span>
      <span aria-hidden className="h-6 w-px bg-border" />
      <Button
        type="button"
        variant="outline"
        className="gap-1.5"
        onClick={onPreview}
      >
        <Eye aria-hidden className="size-4" />
        {t("editor.preview.open")}
      </Button>
      <Button type="button" variant="ghost" onClick={editor.leave}>
        {t("common:common.cancel")}
      </Button>
      <Button type="button" onClick={editor.save} disabled={editor.saving}>
        {editor.saving ? t("common:common.saving") : t("common:common.save")}
      </Button>
    </header>
  );
}
