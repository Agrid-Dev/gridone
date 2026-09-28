import { useTranslation } from "react-i18next";
import { Box, MousePointer2, Spline } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import type { EditorTool, SynopticEditorState } from "./useSynopticEditor";

const TOOLS: { tool: EditorTool; key: string; Icon: typeof Spline }[] = [
  { tool: "select", key: "V", Icon: MousePointer2 },
  { tool: "pipe", key: "P", Icon: Spline },
];

/**
 * The tools over the plan: selecting and moving, drawing a pipe, and the
 * 3D preview's switch. Panning needs no tool: dragging the background
 * pans in either.
 */
export function EditorToolbar({ editor }: { editor: SynopticEditorState }) {
  const { t } = useTranslation("synoptics");
  const button =
    "flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
      <div
        role="toolbar"
        aria-label={t("editor.tools.label")}
        className="pointer-events-auto flex items-center gap-1 rounded-xl border bg-card p-1 shadow-md"
      >
        {TOOLS.map(({ tool, key, Icon }) => {
          const on = editor.tool === tool;
          return (
            <button
              key={tool}
              type="button"
              aria-pressed={on}
              aria-keyshortcuts={key}
              onClick={() => editor.setTool(tool)}
              className={cn(
                button,
                on ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              <Icon aria-hidden className="size-4" />
              {t(`editor.tools.${tool}`)}
              <Kbd
                className={cn(
                  on &&
                    "border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground",
                )}
              >
                {key}
              </Kbd>
            </button>
          );
        })}
        <span aria-hidden className="mx-1 h-6 w-px bg-border" />
        <button
          type="button"
          aria-pressed={editor.preview.open}
          onClick={editor.preview.toggle}
          className={cn(
            button,
            editor.preview.open ? "bg-muted" : "hover:bg-muted",
          )}
        >
          <Box aria-hidden className="size-4" />
          {t("editor.tools.preview")}
        </button>
      </div>
    </div>
  );
}
