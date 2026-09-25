import { useCallback, useState } from "react";

/** How many steps undo reaches back. */
export const HISTORY_LIMIT = 200;

/**
 * The document with the steps behind and ahead of it. An `open` step is one
 * still being shaped (a drag, a burst of typing): later changes under the
 * same key are applied to its starting document, not piled up, and the
 * step closes when something else happens. Opening it at the limit pushed
 * the oldest step out: `dropped` holds it, so a step that comes to nothing
 * gives it back.
 */
export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  open: { key: string; base: T; future: T[]; dropped: T[] } | null;
};

/** A change to the document; `null` refuses it and leaves the plate be. */
export type Change<T> = (doc: T) => T | null;

/** Whether two documents say the same thing. */
export type Same<T> = (a: T, b: T) => boolean;

const sameJson = <T>(a: T, b: T) =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

export const historyOf = <T>(doc: T): History<T> => ({
  past: [],
  present: doc,
  future: [],
  open: null,
});

/** The history as it was before the open step began. */
const withoutOpen = <T>(
  h: History<T>,
  open: NonNullable<History<T>["open"]>,
): History<T> => ({
  past: [...open.dropped, ...h.past.slice(0, -1)],
  present: open.base,
  future: open.future,
  open: null,
});

/** Closes the open step. One that came back to where it started (a drag
 *  dropped where it began) leaves no step at all, and gives the starting
 *  document back as it was, so a plate edited back to its stored state
 *  reads as unchanged. */
export function seal<T>(h: History<T>, same: Same<T> = sameJson): History<T> {
  if (!h.open) return h;
  if (same(h.present, h.open.base)) return withoutOpen(h, h.open);
  return { ...h, open: null };
}

/** Throws the open step away, the redo steps it cleared included: a drag
 *  cancelled with Escape leaves the history as it found it. */
export function discardOpen<T>(h: History<T>): History<T> {
  return h.open ? withoutOpen(h, h.open) : h;
}

/**
 * Applies `change`. With a `merge` key matching the open step, the change
 * is applied to that step's starting document and replaces its result, so
 * a drag across ten cells is one step whose outcome depends only on where
 * the drag is now. Any other change closes the open step first and makes a
 * step of its own, opening it when it carries a key; one that leaves the
 * document saying what it said makes none.
 */
export function apply<T>(
  h: History<T>,
  change: Change<T>,
  merge?: string,
  same: Same<T> = sameJson,
): History<T> {
  if (merge && h.open?.key === merge) {
    const next = change(h.open.base);
    return next === null ? h : { ...h, present: next };
  }
  const closed = seal(h, same);
  const next = change(closed.present);
  if (next === null || same(next, closed.present)) return closed;
  const past = [...closed.past, closed.present];
  const kept = past.slice(-HISTORY_LIMIT);
  return {
    past: kept,
    present: next,
    future: [],
    open: merge
      ? {
          key: merge,
          base: closed.present,
          future: closed.future,
          dropped: past.slice(0, past.length - kept.length),
        }
      : null,
  };
}

export function undo<T>(h: History<T>, same: Same<T> = sameJson): History<T> {
  const closed = seal(h, same);
  const previous = closed.past.at(-1);
  if (previous === undefined) return closed;
  return {
    past: closed.past.slice(0, -1),
    present: previous,
    future: [closed.present, ...closed.future],
    open: null,
  };
}

export function redo<T>(h: History<T>, same: Same<T> = sameJson): History<T> {
  const closed = seal(h, same);
  const [next, ...rest] = closed.future;
  if (next === undefined) return closed;
  return {
    past: [...closed.past, closed.present].slice(-HISTORY_LIMIT),
    present: next,
    future: rest,
    open: null,
  };
}

/** The document being edited, with undo and redo. See `apply` for how a
 *  gesture makes one step; `same` says when a change changed nothing. */
export function useDocumentHistory<T>(initial: T, same: Same<T> = sameJson) {
  const [history, setHistory] = useState(() => historyOf(initial));
  const applyChange = useCallback(
    (change: Change<T>, options?: { merge?: string }) =>
      setHistory((h) => apply(h, change, options?.merge, same)),
    [same],
  );
  return {
    doc: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    apply: applyChange,
    seal: useCallback(() => setHistory((h) => seal(h, same)), [same]),
    discardOpen: useCallback(() => setHistory(discardOpen), []),
    undo: useCallback(() => setHistory((h) => undo(h, same)), [same]),
    redo: useCallback(() => setHistory((h) => redo(h, same)), [same]),
    reset: useCallback((doc: T) => setHistory(historyOf(doc)), []),
  };
}
