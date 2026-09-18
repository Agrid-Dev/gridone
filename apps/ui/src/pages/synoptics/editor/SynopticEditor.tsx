import { useCallback, useEffect, useMemo, useState, type FC } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  normalizeError,
  type Cell,
  type Fluid,
  type Synoptic,
  type SymbolElement,
} from "@gridone/sdk";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import type { PlateDocument } from "@/components/synoptic";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDevicesList } from "@/hooks/useDevicesList";
import {
  useSaveSynoptic,
  useSynopticPage,
  useSynoptics,
  type SaveTarget,
} from "../useSynoptics";
import {
  addPipe,
  addSymbol,
  emptyDocument,
  moveSymbol,
  nextId,
  removePipe,
  removeSymbol,
  rotateSymbol,
  routeWaypoints,
  toDocument,
  updatePipe,
  updateSymbol,
  type RoutePoint,
  type Selection,
} from "./document";
import { EditorCanvas, type EditorMode } from "./EditorCanvas";
import { FLUIDS } from "@/lib/fluidColors";
import { Inspector } from "./Inspector";
import { Palette } from "./Palette";
import {
  forgetElement,
  mapSaveErrors,
  NO_SAVE_ERRORS,
  type SaveErrors,
} from "./saveErrors";

const LEVELS = [0, 1];

type EditorProps = {
  initial: PlateDocument;
  /** The stored plate being edited, or null for a new one. */
  stored: Synoptic | null;
};

const Editor: FC<EditorProps> = ({ initial, stored }) => {
  const { t } = useTranslation(["synoptics", "common"]);
  const navigate = useNavigate();
  const [doc, setDoc] = useState<PlateDocument>(initial);
  const [selection, setSelection] = useState<Selection>(null);
  const [mode, setMode] = useState<EditorMode>("select");
  const [level, setLevel] = useState(0);
  const [fluid, setFluid] = useState<Fluid>(FLUIDS[0]);
  const [placing, setPlacing] = useState<string | null>(null);
  const [errors, setErrors] = useState<SaveErrors>(NO_SAVE_ERRORS);
  const [message, setMessage] = useState<string | null>(null);
  const { devices } = useDevicesList();
  const synoptics = useSynoptics();
  // The stamp the author read, captured with the draft: a refetch of the
  // plate must not move it under an edit in progress, or the 409 guard
  // would pass a save that overwrites another author's work.
  const [target] = useState<SaveTarget>(() =>
    stored
      ? { id: stored.id, updatedAt: stored.metadata.updated_at ?? "" }
      : null,
  );
  const save = useSaveSynoptic(target);

  const symbol = useMemo(
    () =>
      selection?.kind === "symbol"
        ? doc.symbols?.find((s) => s.id === selection.id)
        : undefined,
    [doc.symbols, selection],
  );
  const pipe = useMemo(
    () =>
      selection?.kind === "pipe"
        ? doc.pipes?.find((p) => p.id === selection.id)
        : undefined,
    [doc.pipes, selection],
  );

  /** Applies a change to one element; the errors the last save left on
   *  it are forgotten, since the author has touched what they named. */
  const edit = useCallback(
    (id: string, change: (d: PlateDocument) => PlateDocument) => {
      setDoc(change);
      setErrors((e) => forgetElement(e, id));
    },
    [],
  );

  const onPlace = useCallback(
    (type: string, placement: SymbolElement["placement"]) => {
      const id = nextId(doc, type);
      setDoc((d) =>
        addSymbol(d, { id, type, placement, props: {}, bindings: {} }),
      );
      setSelection({ kind: "symbol", id });
      setPlacing(null);
    },
    [doc],
  );
  const onDraw = useCallback(
    (points: RoutePoint[]) => {
      const id = nextId(doc, fluid);
      setDoc((d) =>
        addPipe(d, {
          id,
          fluid,
          from: points[0].endpoint,
          to: points[points.length - 1].endpoint,
          waypoints: routeWaypoints(points),
          flow: null,
          tags: [],
        }),
      );
      setSelection({ kind: "pipe", id });
    },
    [doc, fluid],
  );
  const onMove = useCallback(
    (id: string, cell: Cell) => edit(id, (d) => moveSymbol(d, id, cell)),
    [edit],
  );
  const onDelete = useCallback(
    (which: Selection) => {
      if (!which) return;
      edit(which.id, (d) =>
        which.kind === "symbol"
          ? removeSymbol(d, which.id)
          : removePipe(d, which.id),
      );
      setSelection(null);
    },
    [edit],
  );
  const onRotate = useCallback(
    (id: string) => edit(id, (d) => rotateSymbol(d, id)),
    [edit],
  );
  const onCancel = useCallback(() => {
    setPlacing(null);
    setSelection(null);
  }, []);

  const onSave = async () => {
    setMessage(null);
    try {
      const saved = await save.mutateAsync(doc);
      navigate(`/synoptics/${encodeURIComponent(saved.id)}`);
    } catch (error) {
      const failure = normalizeError(error);
      if (failure.kind === "fieldErrors") {
        setErrors(mapSaveErrors(failure.errors, doc));
      } else {
        setErrors(NO_SAVE_ERRORS);
        setMessage(
          failure.kind === "message"
            ? failure.message
            : t("common:errors.default"),
        );
      }
    }
  };

  const errorIds = useMemo(() => new Set(errors.byElement.keys()), [errors]);

  // Unsaved work is held in this page alone: a reload or a close warns,
  // as the dashboard layout editor does, and Cancel asks first. A sidebar
  // link does not: the app runs on BrowserRouter, which has no blocker.
  const dirty = doc !== initial;
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const onCancelPage = () => {
    if (dirty && !window.confirm(t("editor.discard"))) return;
    navigate(
      target ? `/synoptics/${encodeURIComponent(target.id)}` : "/synoptics",
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <ResourceHeader
        title={
          <Input
            aria-label={t("editor.name")}
            className="w-80 text-lg font-semibold"
            value={doc.name}
            onChange={(e) => {
              setDoc((d) => ({ ...d, name: e.target.value }));
              // A document-level violation (an empty name) is being fixed.
              setErrors((err) => ({ ...err, document: [] }));
            }}
          />
        }
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancelPage}>
              {t("common:common.cancel")}
            </Button>
            <Button type="button" onClick={onSave} disabled={save.isPending}>
              {save.isPending
                ? t("common:common.saving")
                : t("common:common.save")}
            </Button>
          </div>
        }
      />
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      {errors.document.map((error, i) => (
        <p key={i} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("editor.mode")} className="flex gap-1">
          {(["select", "draw"] as const).map((m) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={mode === m ? "default" : "outline"}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setPlacing(null);
              }}
            >
              {t(`editor.modes.${m}`)}
            </Button>
          ))}
        </div>
        <Select value={fluid} onValueChange={(v) => setFluid(v as Fluid)}>
          <SelectTrigger aria-label={t("editor.fluid")} className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FLUIDS.map((f) => (
              <SelectItem key={f} value={f}>
                {f.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {doc.projection !== "flat" && (
          <div
            role="group"
            aria-label={t("editor.level")}
            className="flex gap-1"
          >
            {LEVELS.map((z) => (
              <Button
                key={z}
                type="button"
                size="sm"
                variant={level === z ? "default" : "outline"}
                aria-pressed={level === z}
                onClick={() => setLevel(z)}
              >
                z {z}
              </Button>
            ))}
          </div>
        )}
        <Palette
          placing={placing}
          onPick={(type) => {
            setPlacing(type);
            if (type) setMode("select");
          }}
        />
      </div>
      <div className="flex h-[40rem] gap-4">
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border">
          <EditorCanvas
            doc={doc}
            mode={mode}
            level={level}
            fluid={fluid}
            placing={placing}
            selection={selection}
            errorIds={errorIds}
            onSelect={setSelection}
            onPlace={onPlace}
            onDraw={onDraw}
            onMove={onMove}
            onDelete={onDelete}
            onRotate={onRotate}
            onCancel={onCancel}
          />
        </div>
        <aside className="w-96 shrink-0 overflow-y-auto rounded-lg border p-4">
          <Inspector
            selection={selection}
            symbol={symbol}
            pipe={pipe}
            devices={devices}
            synoptics={synoptics}
            errors={selection ? (errors.byElement.get(selection.id) ?? []) : []}
            onSymbolChange={(patch) =>
              symbol &&
              edit(symbol.id, (d) => updateSymbol(d, symbol.id, patch))
            }
            onPipeChange={(patch) =>
              pipe && edit(pipe.id, (d) => updatePipe(d, pipe.id, patch))
            }
            onDelete={() => onDelete(selection)}
          />
        </aside>
      </div>
    </div>
  );
};

/** `/synoptics/new`: an empty plate. */
export const SynopticCreate: FC = () => {
  const { t } = useTranslation("synoptics");
  return (
    <ResourceBoundary resetKeys={[]}>
      <Editor initial={emptyDocument(t("editor.untitled"))} stored={null} />
    </ResourceBoundary>
  );
};

const EditStored: FC = () => {
  const { doc } = useSynopticPage();
  return <Editor initial={toDocument(doc)} stored={doc} />;
};

/** `/synoptics/:synopticId/edit`: the stored plate, saved whole. */
export const SynopticEdit: FC = () => {
  const { synopticId } = useParams<{ synopticId: string }>();
  return (
    <ResourceBoundary resetKeys={[synopticId]}>
      <EditStored key={synopticId} />
    </ResourceBoundary>
  );
};
