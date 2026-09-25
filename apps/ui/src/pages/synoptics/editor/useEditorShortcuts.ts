import { useEffect, useRef } from "react";
import { canRotate } from "./document";
import type { SynopticEditorState } from "./useSynopticEditor";

const within = (target: EventTarget | null, selector: string) =>
  target instanceof Element && !!target.closest(selector);

/** Keys pressed in a field, a list, a menu or a dialog are that control's:
 *  typing a V in a label, or Escape closing a popover, is not the plate's. */
const IN_CONTROL =
  "input, textarea, select, [contenteditable=true], [role=combobox], [role=listbox], [role=menu], [role=dialog], [role=alertdialog], [data-radix-popper-content-wrapper]";
/** The side panel: a press of Delete or R on one of its buttons must not
 *  delete or turn the symbol it describes. */
const IN_PANEL = "[data-editor-panel]";
/** Text fields keep the browser's own undo. */
const IN_TEXT = "input, textarea, [contenteditable=true]";

/**
 * The editor's keyboard: V and P pick the tool, R turns the selected
 * symbol, Delete removes it, ⌘D copies it, Enter finishes the run being
 * drawn and Backspace takes its last point back, Escape backs out one
 * level (the run, then the armed symbol, then the selection), ⌘Z and ⇧⌘Z
 * (or Ctrl+Y) undo and redo, and / goes to the library search. Nothing
 * fires while a symbol is being dragged: the drag owns the pointer and
 * Escape.
 */
export function useEditorShortcuts(
  editor: SynopticEditorState,
  focusSearch: () => void,
) {
  // One listener for the page's life, reading the editor as it is now.
  const current = useRef({ editor, focusSearch });
  current.current = { editor, focusSearch };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { editor: ed, focusSearch: toSearch } = current.current;
      if (e.defaultPrevented || ed.drag.active) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && (key === "z" || key === "y")) {
        if (within(e.target, IN_TEXT)) return;
        e.preventDefault();
        if (key === "y" || e.shiftKey) ed.history.redo();
        else ed.history.undo();
        return;
      }
      if (within(e.target, IN_CONTROL)) return;
      if (mod && key === "d") {
        e.preventDefault();
        if (ed.symbol) ed.duplicate(ed.symbol.id);
        return;
      }
      if (mod || e.altKey) return;
      const drawing = ed.draw.points.length > 0;
      switch (e.key) {
        case "Escape":
          if (drawing) ed.draw.cancel();
          else if (ed.placing) ed.arm(null);
          else ed.select(null);
          return;
        case "Enter":
          if (ed.draw.points.length > 1 && !within(e.target, "button")) {
            ed.draw.finish();
          }
          return;
        case "Backspace":
        case "Delete":
          if (within(e.target, IN_PANEL)) return;
          if (drawing) {
            // Mid-run, Backspace takes the last point back; nothing is
            // deleted from the plate.
            e.preventDefault();
            if (e.key === "Backspace") ed.draw.undoPoint();
          } else if (ed.selection) {
            e.preventDefault();
            ed.remove();
          }
          return;
        case "/":
          e.preventDefault();
          toSearch();
          return;
      }
      if (key === "v") ed.setTool("select");
      else if (key === "p") ed.setTool("pipe");
      else if (key === "r" && !within(e.target, IN_PANEL)) {
        if (ed.symbol && canRotate(ed.symbol)) ed.rotate(ed.symbol.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
