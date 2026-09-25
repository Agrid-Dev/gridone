import { useTranslation } from "react-i18next";
import type { Device, SynopticSummary } from "@gridone/sdk";
import type { SynopticEditorState } from "../useSynopticEditor";
import { EditorGuide } from "./EditorGuide";
import { PipeInspector } from "./PipeInspector";
import { PipeToolPanel } from "./PipeToolPanel";
import { SymbolInspector } from "./SymbolInspector";

/**
 * The editor's right panel: the pipe tool's options while it is in hand,
 * else what is selected, else the guide. Keys pressed inside it belong to
 * its fields and buttons, not to the plate (`data-editor-panel`).
 */
export function Inspector({
  editor,
  devices,
  synoptics,
}: {
  editor: SynopticEditorState;
  devices: Device[];
  synoptics: SynopticSummary[];
}) {
  const { t } = useTranslation("synoptics");
  return (
    <aside
      data-editor-panel
      aria-label={t("editor.inspector.label")}
      className="w-[22rem] shrink-0 overflow-y-auto border-l bg-card p-5"
    >
      {editor.tool === "pipe" ? (
        <PipeToolPanel editor={editor} />
      ) : editor.symbol ? (
        <SymbolInspector
          key={editor.symbol.id}
          editor={editor}
          symbol={editor.symbol}
          devices={devices}
          synoptics={synoptics}
        />
      ) : editor.pipe ? (
        <PipeInspector
          key={editor.pipe.id}
          editor={editor}
          pipe={editor.pipe}
          devices={devices}
        />
      ) : (
        <EditorGuide editor={editor} />
      )}
    </aside>
  );
}
