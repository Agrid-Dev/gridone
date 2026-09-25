import { useCallback, useMemo, useRef, useState, type FC } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { Synoptic } from "@gridone/sdk";
import { useFocusedPage } from "@/components/layout/PageLayout";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ZOOM_STEP, type View } from "@/components/synoptic/hooks/useViewport";
import type {
  PlateDocument,
  PlateHandle,
} from "@/components/synoptic/SynopticRenderer";
import { Skeleton } from "@/components/ui/skeleton";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useSynopticPage, useSynoptics } from "../useSynoptics";
import { emptyDocument, toDocument } from "./document";
import { EditorCanvas } from "./EditorCanvas";
import { EditorStatusBar } from "./EditorStatusBar";
import { EditorToolbar } from "./EditorToolbar";
import { EditorTopBar } from "./EditorTopBar";
import { NewSynopticDialog } from "./NewSynopticDialog";
import { Inspector } from "./panel/Inspector";
import { PreviewCard } from "./PreviewCard";
import { PreviewDialog } from "./PreviewDialog";
import { describeError } from "./saveErrors";
import { SymbolLibrary } from "./SymbolLibrary";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { useSynopticEditor } from "./useSynopticEditor";

type EditorProps = {
  initial: PlateDocument;
  /** The stored plate being edited, or null for a new one. */
  stored: Synoptic | null;
};

/**
 * The editor, taking the whole window: its bar on top, the symbol library
 * on the left, the plan in the middle with its tools, its status and the
 * 3D preview, and the panel on the right. Authoring is always on the plan;
 * the plate's own view is only what its operators open it on. A new plate
 * starts with the New dialog over an empty plan.
 */
const Editor: FC<EditorProps> = ({ initial, stored }) => {
  useFocusedPage();
  const navigate = useNavigate();
  const editor = useSynopticEditor(initial, stored);
  const { devices } = useDevicesList();
  const synoptics = useSynoptics();
  const known = useMemo(() => new Set(synoptics.map((s) => s.id)), [synoptics]);
  const searchRef = useRef<HTMLInputElement>(null);
  useEditorShortcuts(editor, () => searchRef.current?.focus());
  const plateRef = useRef<PlateHandle | null>(null);
  const [scale, setScale] = useState(1);
  const onViewChange = useCallback((view: View) => setScale(view.scale), []);
  const [previewing, setPreviewing] = useState(false);
  const [starting, setStarting] = useState(!stored);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <EditorTopBar editor={editor} onPreview={() => setPreviewing(true)} />
      {[editor.message, ...editor.errors.document.map((e) => describeError(e))]
        .filter((text): text is string => !!text)
        .map((text) => (
          <p
            key={text}
            role="alert"
            className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive"
          >
            {text}
          </p>
        ))}
      <div className="flex min-h-0 flex-1">
        <SymbolLibrary editor={editor} searchRef={searchRef} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 bg-synoptic-plate">
            <EditorCanvas
              editor={editor}
              plateRef={plateRef}
              onViewChange={onViewChange}
            />
            <EditorToolbar editor={editor} />
            {editor.preview.open && (
              <PreviewCard
                doc={editor.doc}
                onExpand={() => setPreviewing(true)}
                onClose={editor.preview.toggle}
              />
            )}
          </div>
          <EditorStatusBar
            editor={editor}
            scale={scale}
            onZoomIn={() => plateRef.current?.zoomBy(ZOOM_STEP)}
            onZoomOut={() => plateRef.current?.zoomBy(1 / ZOOM_STEP)}
            onFit={() => plateRef.current?.fit()}
          />
        </div>
        <Inspector editor={editor} devices={devices} synoptics={synoptics} />
      </div>
      <PreviewDialog
        open={previewing}
        onOpenChange={setPreviewing}
        doc={editor.doc}
        id={stored?.id ?? null}
        knownSynoptics={known}
      />
      {!stored && (
        <NewSynopticDialog
          open={starting}
          synoptics={synoptics}
          onStart={(doc) => {
            editor.start(doc);
            setStarting(false);
          }}
          onCancel={() => navigate("/synoptics")}
        />
      )}
    </div>
  );
};

/**
 * The editor's frame while what it needs loads, already taking the whole
 * window: the shell does not show for a moment and vanish under the
 * author. An error that follows gets the window back, and its page keeps
 * the navigation as the way out.
 */
function EditorSkeleton() {
  useFocusedPage();
  return (
    <div className="flex h-dvh flex-col bg-background" aria-busy>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-72" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-64 shrink-0 space-y-3 border-r bg-card p-4">
          <Skeleton className="h-9" />
          <Skeleton className="h-40" />
        </div>
        <div className="flex-1 bg-synoptic-plate" />
        <div className="w-[22rem] shrink-0 space-y-3 border-l bg-card p-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-32" />
        </div>
      </div>
    </div>
  );
}

/** `/synoptics/new`: an empty plan, under the New dialog. */
export const SynopticCreate: FC = () => {
  const { t } = useTranslation("synoptics");
  const [initial] = useState(() => emptyDocument(t("editor.untitled")));
  return (
    <ResourceBoundary resetKeys={[]} fallback={<EditorSkeleton />}>
      <Editor initial={initial} stored={null} />
    </ResourceBoundary>
  );
};

const EditStored: FC = () => {
  const { doc } = useSynopticPage();
  // The draft starts from the plate as first read: a refetch must not
  // replace the author's work, and the save carries the stamp read then.
  const [initial] = useState(() => toDocument(doc));
  return <Editor initial={initial} stored={doc} />;
};

/** `/synoptics/:synopticId/edit`: the stored plate, saved whole. */
export const SynopticEdit: FC = () => {
  const { synopticId } = useParams<{ synopticId: string }>();
  return (
    <ResourceBoundary resetKeys={[synopticId]} fallback={<EditorSkeleton />}>
      <EditStored key={synopticId} />
    </ResourceBoundary>
  );
};
