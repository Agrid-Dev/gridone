import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  normalizeError,
  type Cell,
  type Fluid,
  type PipeElement,
  type Projection,
  type SymbolElement,
  type Synoptic,
} from "@gridone/sdk";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { FLUIDS } from "@/lib/fluidColors";
import { readPreviewOpen, writePreviewOpen } from "@/lib/synopticPreference";
import { useSaveSynoptic, type SaveTarget } from "../useSynoptics";
import { plateChecks } from "./checks";
import {
  addPipe,
  addSymbol,
  defaultProps,
  duplicateSymbol,
  moveSymbol,
  nextId,
  removePipe,
  removeSymbol,
  rotateSymbol,
  routeWaypoints,
  samePlate,
  setCollectorAxis,
  updatePipe,
  updateSymbol,
  withDevice,
  type RoutePoint,
  type Selection,
} from "./document";
import { rerouteChanged } from "./reroute";
import {
  cellKey,
  cellsOf,
  freshViolations,
  portAnchorOf,
  runCorners,
  runViolations,
} from "./runRules";
import {
  forgetElement,
  forgetField,
  mapSaveErrors,
  NO_SAVE_ERRORS,
  type SaveErrors,
} from "./saveErrors";
import { useDocumentHistory } from "./useDocumentHistory";

export type EditorTool = "select" | "pipe";
/** The height bends are drawn at: the floor, or overhead (a run that
 *  crosses another in the isometric view). */
export type BendLevel = 0 | 1;
/** Why an edit was not taken. */
export type Refusal =
  | "overlap"
  | "unroutable"
  | "noRoom"
  | "brokenRun"
  | "portTaken";

type Change = (doc: PlateDocument) => PlateDocument;

const sameEndpoint = (a: RoutePoint, b: RoutePoint) =>
  JSON.stringify(a.endpoint) === JSON.stringify(b.endpoint);

/** A change with the runs following what it moved, or null when they
 *  cannot: the edit is then refused as a whole. */
function withRuns(change: Change) {
  return (base: PlateDocument): PlateDocument | null => {
    const next = change(base);
    if (next === base) return base;
    const result = rerouteChanged(base, next);
    return result.ok ? result.doc : null;
  };
}

/**
 * Everything the editor page holds and does: the plate with its undo
 * history, what is selected, the tool in hand, the run being drawn, the
 * symbol being placed, the save and what it refused. Every edit goes
 * through the history and, when it moves a port, through the re-route, so
 * the plate stays one the backend takes.
 */
export function useSynopticEditor(
  initial: PlateDocument,
  stored: Synoptic | null,
) {
  const { t } = useTranslation(["synoptics", "common"]);
  const navigate = useNavigate();
  const { doc, apply, seal, discardOpen, reset, undo, redo, canUndo, canRedo } =
    useDocumentHistory(initial, samePlate);
  /** The document a save or a cancel compares against: the one loaded,
   *  or the one the New dialog started. */
  const [baseline, setBaseline] = useState(initial);
  const [selection, setSelection] = useState<Selection>(null);
  const [tool, setToolState] = useState<EditorTool>("select");
  const [placing, setPlacing] = useState<string | null>(null);
  const [dragType, setDragType] = useState<string | null>(null);
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [fluid, setFluid] = useState<Fluid>(FLUIDS[0]);
  const [level, setLevel] = useState<BendLevel>(0);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<SaveErrors>(NO_SAVE_ERRORS);
  const [message, setMessage] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(readPreviewOpen);
  // The stamp the author read, captured with the draft: a refetch of the
  // plate must not move it under an edit in progress, or the 409 guard
  // would pass a save that overwrites another author's work.
  const [target] = useState<SaveTarget>(() =>
    stored
      ? { id: stored.id, updatedAt: stored.metadata.updated_at ?? "" }
      : null,
  );
  const save = useSaveSynoptic(target);

  const flat = doc.projection === "flat";
  /** Bends on a flat plate stay on the floor: it refuses any height. */
  const bendLevel: BendLevel = flat ? 0 : level;

  // A selection the plate no longer holds (undone, deleted) reads as none.
  const selected = useMemo<Selection>(() => {
    if (!selection) return null;
    const list = selection.kind === "symbol" ? doc.symbols : doc.pipes;
    return list?.some((e) => e.id === selection.id) ? selection : null;
  }, [doc, selection]);
  const symbol = useMemo(
    () =>
      selected?.kind === "symbol"
        ? doc.symbols?.find((s) => s.id === selected.id)
        : undefined,
    [doc.symbols, selected],
  );
  const pipe = useMemo(
    () =>
      selected?.kind === "pipe"
        ? doc.pipes?.find((p) => p.id === selected.id)
        : undefined,
    [doc.pipes, selected],
  );
  const checks = useMemo(() => plateChecks(doc, errors), [doc, errors]);
  const errorIds = useMemo(() => new Set(errors.byElement.keys()), [errors]);

  const refuse = useCallback(
    (reason: Refusal) => toast.error(t(`editor.refused.${reason}`)),
    [t],
  );
  const forget = useCallback(
    (id?: string) => id && setErrors((e) => forgetElement(e, id)),
    [],
  );

  /** One edit as one step, with the runs following. Refused with a word
   *  when they cannot follow, a body would land on another, or a run would
   *  break a rule the backend holds it to: whatever the edit, the plate
   *  never ends up worse than it was. An edit that changes nothing makes
   *  no step. */
  const commit = useCallback(
    (change: Change, element?: string): boolean => {
      const next = change(doc);
      if (samePlate(next, doc)) return true;
      const result = rerouteChanged(doc, next);
      if (!result.ok) {
        refuse(result.reason);
        return false;
      }
      if (
        freshViolations(runViolations(result.doc), runViolations(doc)).length
      ) {
        refuse("brokenRun");
        return false;
      }
      apply(() => result.doc);
      forget(element);
      return true;
    },
    [doc, apply, refuse, forget],
  );

  /** A burst of typing in one field, as one step: each keystroke replaces
   *  the last from where the burst began. `settle` ends it. */
  const type = useCallback(
    (key: string, change: Change, element?: string) => {
      apply((base) => change(base), { merge: key });
      forget(element);
    },
    [apply, forget],
  );

  // Tools, placing, drawing.
  const setTool = useCallback((next: EditorTool) => {
    setToolState(next);
    setPoints([]);
    setPlacing(null);
    // The pipe tool's panel stands where the selection's would: a symbol
    // kept selected under it could be deleted by a key the author meant
    // for the run.
    if (next === "pipe") setSelection(null);
  }, []);
  const arm = useCallback((type: string | null) => {
    setPlacing(type);
    if (type) {
      setToolState("select");
      setPoints([]);
    }
  }, []);
  const place = useCallback(
    (type: string, placement: SymbolElement["placement"]) => {
      const id = nextId(doc, type);
      const placed = commit((d) =>
        addSymbol(d, {
          id,
          type,
          placement,
          props: defaultProps(type),
          bindings: {},
        }),
      );
      if (placed) {
        setSelection({ kind: "symbol", id });
        setPlacing(null);
      }
      return placed;
    },
    [doc, commit],
  );

  const finishDraw = useCallback(
    (route: RoutePoint[] = points) => {
      if (route.length < 2) return;
      // A tee carries its trunk's fluid, whatever the picker holds.
      const first = route[0].endpoint;
      const trunk =
        first.kind === "pipe"
          ? doc.pipes?.find((p) => p.id === first.pipe)
          : undefined;
      const runFluid = trunk?.fluid ?? fluid;
      const id = nextId(doc, runFluid);
      const added = commit((d) =>
        addPipe(d, {
          id,
          fluid: runFluid,
          from: route[0].endpoint,
          to: route[route.length - 1].endpoint,
          waypoints: routeWaypoints(route),
          flow: null,
          tags: [],
        }),
      );
      // Keep the start and bends after a refusal so the author can correct
      // the route or choose another endpoint without drawing it again.
      if (added) setPoints([]);
    },
    [points, doc, fluid, commit],
  );
  const addPoint = useCallback(
    (point: RoutePoint) => {
      const last = points[points.length - 1];
      if (last && sameEndpoint(last, point)) return;
      const next = [...points, point];
      if (!points.length && point.endpoint.kind === "pipe") {
        const trunk = doc.pipes?.find(
          (p) => point.endpoint.kind === "pipe" && p.id === point.endpoint.pipe,
        );
        if (trunk) setFluid(trunk.fluid);
      }
      // A port or a tee after the first point ends the run.
      if (next.length > 1 && point.endpoint.kind !== "cell") finishDraw(next);
      else setPoints(next);
    },
    [points, doc.pipes, finishDraw],
  );
  const undoPoint = useCallback(() => setPoints((p) => p.slice(0, -1)), []);
  // The run being drawn holds the cells it read at each click, and the
  // plate can change under it (an undo, a delete, the view turned flat).
  // It keeps up: a port it started on is read where the port now stands,
  // bends go down to the floor of a plate that turned flat, and a symbol,
  // a port or a trunk gone, or a tee cell its trunk no longer crosses,
  // drops the run in progress rather than let it end where nothing is.
  useEffect(() => {
    const symbols = new Map((doc.symbols ?? []).map((s) => [s.id, s]));
    const pipes = new Map((doc.pipes ?? []).map((p) => [p.id, p]));
    const onTrunk = (pipe: string, cell: Cell) => {
      const trunk = pipes.get(pipe);
      const corners = trunk ? runCorners(trunk, symbols) : null;
      return !!corners && cellsOf(corners).cells.has(cellKey(cell));
    };
    const current = (point: RoutePoint): RoutePoint | null => {
      const { endpoint: e } = point;
      if (e.kind === "port") {
        const anchor = portAnchorOf(e, symbols);
        if (!anchor) return null;
        return cellKey(anchor.cell) === cellKey(point.cell) &&
          anchor.side === point.side
          ? point
          : { ...point, cell: anchor.cell, side: anchor.side };
      }
      if (e.kind === "pipe") return onTrunk(e.pipe, e.cell) ? point : null;
      return flat && (point.cell.z ?? 0) !== 0
        ? {
            endpoint: { kind: "cell", cell: { ...point.cell, z: 0 } },
            cell: { ...point.cell, z: 0 },
          }
        : point;
    };
    setPoints((ps) => {
      const next = ps.map(current);
      if (next.some((p) => p === null)) return [];
      return next.every((p, i) => p === ps[i]) ? ps : (next as RoutePoint[]);
    });
  }, [doc.symbols, doc.pipes, flat]);
  const cancelDraw = useCallback(() => setPoints([]), []);

  // Moving a symbol by hand: one merged step, reverted on cancel.
  const dragTo = useCallback(
    (id: string, cell: Cell) => {
      setDragging(true);
      apply(
        withRuns((d) => moveSymbol(d, id, cell)),
        {
          merge: `drag:${id}`,
        },
      );
    },
    [apply],
  );
  /** A symbol riding a run, slid to another of its cells. */
  const slideTo = useCallback(
    (id: string, cell: Cell) => {
      setDragging(true);
      apply(
        (d) =>
          updateSymbol(d, id, (s) =>
            s.placement.kind === "pipe"
              ? { ...s, placement: { ...s.placement, cell } }
              : s,
          ),
        { merge: `drag:${id}` },
      );
    },
    [apply],
  );
  const dragEnd = useCallback(
    (id: string) => {
      setDragging(false);
      seal();
      forget(id);
    },
    [seal, forget],
  );
  const dragCancel = useCallback(() => {
    setDragging(false);
    discardOpen();
  }, [discardOpen]);

  // Edits on the selection.
  const remove = useCallback(
    (which: Selection = selected) => {
      if (!which) return;
      commit(
        (d) =>
          which.kind === "symbol"
            ? removeSymbol(d, which.id)
            : removePipe(d, which.id),
        which.id,
      );
      setSelection(null);
    },
    [selected, commit],
  );
  const rotate = useCallback(
    (id: string) => commit((d) => rotateSymbol(d, id), id),
    [commit],
  );
  const duplicate = useCallback(
    (id: string) => {
      // A symbol riding a run has no copy: the panel offers none, and the
      // shortcut is no reason to blame the room.
      const original = doc.symbols?.find((s) => s.id === id);
      if (original?.placement.kind !== "cell") return;
      const copy = duplicateSymbol(doc, id);
      if (!copy) {
        refuse("noRoom");
        return;
      }
      if (commit(() => copy.doc)) setSelection({ kind: "symbol", id: copy.id });
    },
    [doc, commit, refuse],
  );
  const changeSymbol = useCallback(
    (id: string, patch: (s: SymbolElement) => SymbolElement) =>
      commit((d) => updateSymbol(d, id, patch), id),
    [commit],
  );
  const changePipe = useCallback(
    (id: string, patch: (p: PipeElement) => PipeElement) =>
      commit((d) => updatePipe(d, id, patch), id),
    [commit],
  );
  const setDevice = useCallback(
    (id: string, deviceId: string | null) =>
      changeSymbol(id, (s) => withDevice(s, deviceId)),
    [changeSymbol],
  );
  const setAxis = useCallback(
    (id: string, axis: "x" | "y") =>
      commit((d) => setCollectorAxis(d, id, axis), id),
    [commit],
  );
  /** Typing in one of a symbol's text fields (a slot's unit or wording, a
   *  literal, a text prop): one step per field while the typing lasts. */
  const typeSymbol = useCallback(
    (key: string, id: string, patch: (s: SymbolElement) => SymbolElement) =>
      type(`${key}:${id}`, (d) => updateSymbol(d, id, patch), id),
    [type],
  );
  const typeLabel = useCallback(
    (id: string, text: string) =>
      type(
        `label:${id}`,
        (d) => updateSymbol(d, id, (s) => ({ ...s, label: text || null })),
        id,
      ),
    [type],
  );

  // The plate itself.
  const typeName = useCallback(
    (name: string) => {
      type("plate:name", (d) => ({ ...d, name }));
      // What the last save said of the name is being fixed; the rest of
      // what it said of the plate still stands.
      setErrors((e) => forgetField(e, "name"));
    },
    [type],
  );
  const typeDescription = useCallback(
    (description: string) => {
      type("plate:description", (d) => ({
        ...d,
        description: description || null,
      }));
      setErrors((e) => forgetField(e, "description"));
    },
    [type],
  );
  const setProjection = useCallback(
    (projection: Projection) => commit((d) => ({ ...d, projection })),
    [commit],
  );
  /** Starts over from `next`, as the New dialog does: no history behind,
   *  nothing to save until the author changes something. */
  const start = useCallback(
    (next: PlateDocument) => {
      reset(next);
      setBaseline(next);
      setSelection(null);
      setPoints([]);
      setErrors(NO_SAVE_ERRORS);
    },
    [reset],
  );

  const togglePreview = useCallback(() => {
    setPreviewOpen((open) => {
      writePreviewOpen(!open);
      return !open;
    });
  }, []);

  // Unsaved means saying something else than the plate loaded, whatever
  // the steps taken to get here.
  const dirty = useMemo(() => !samePlate(doc, baseline), [doc, baseline]);
  // Unsaved work is held in this page alone: a reload or a close warns, as
  // the dashboard layout editor does, and leaving through the editor asks
  // first. The browser's back button does not: the app runs on
  // BrowserRouter, which has no blocker.
  useUnsavedChangesWarning(dirty);

  const leave = useCallback(() => {
    if (dirty && !window.confirm(t("editor.discard"))) return;
    navigate(
      target ? `/synoptics/${encodeURIComponent(target.id)}` : "/synoptics",
    );
  }, [dirty, t, navigate, target]);

  const onSave = useCallback(async () => {
    seal();
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
  }, [seal, save, doc, navigate, t]);

  return {
    doc,
    dirty,
    history: { canUndo, canRedo, undo, redo, settle: seal },
    selection: selected,
    symbol,
    pipe,
    select: setSelection,
    tool,
    setTool,
    placing,
    arm,
    dragType,
    setDragType,
    place,
    draw: {
      points,
      fluid,
      setFluid,
      level: bendLevel,
      setLevel,
      addPoint,
      undoPoint,
      finish: finishDraw,
      cancel: cancelDraw,
    },
    drag: {
      active: dragging,
      to: dragTo,
      slide: slideTo,
      end: dragEnd,
      cancel: dragCancel,
    },
    remove,
    rotate,
    duplicate,
    refuse,
    changeSymbol,
    changePipe,
    setDevice,
    setAxis,
    typeSymbol,
    typeLabel,
    typeName,
    typeDescription,
    setProjection,
    start,
    preview: { open: previewOpen, toggle: togglePreview },
    checks,
    errors,
    errorIds,
    message,
    saving: save.isPending,
    save: onSave,
    leave,
  };
}

export type SynopticEditorState = ReturnType<typeof useSynopticEditor>;
