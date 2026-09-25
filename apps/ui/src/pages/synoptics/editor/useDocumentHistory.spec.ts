import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  apply,
  discardOpen,
  HISTORY_LIMIT,
  historyOf,
  redo,
  seal,
  undo,
  useDocumentHistory,
  type History,
} from "./useDocumentHistory";

type Doc = { x: number; label?: string };

const set = (x: number) => (d: Doc) => ({ ...d, x });

describe("apply", () => {
  it("makes a step of each change and clears what redo held", () => {
    let h: History<Doc> = historyOf({ x: 0 });
    h = apply(h, set(1));
    h = apply(h, set(2));
    expect(h.past.map((d) => d.x)).toEqual([0, 1]);
    h = undo(h);
    expect(h.future.map((d) => d.x)).toEqual([2]);
    h = apply(h, set(5));
    expect(h.future).toEqual([]);
    expect(h.present.x).toBe(5);
  });

  it("leaves the history alone for a refused or empty change", () => {
    const h = historyOf<Doc>({ x: 0 });
    expect(apply(h, () => null)).toBe(h);
    expect(apply(h, (d) => d)).toBe(h);
  });

  it("works a merged change from the open step's start, so the path does not matter", () => {
    const start = { x: 0 };
    let h = historyOf<Doc>(start);
    const seen: Doc[] = [];
    const step = (x: number) => (d: Doc) => {
      seen.push(d);
      return { ...d, x };
    };
    h = apply(h, step(1), "drag");
    h = apply(h, step(2), "drag");
    h = apply(h, step(3), "drag");
    // Mutant: applying each cell to the previous result would pass 1 and 2
    // in; a re-route computed from them depends on the way the drag went.
    expect(seen).toEqual([start, start, start]);
    expect(h.past).toEqual([start]);
    expect(h.present.x).toBe(3);
  });

  it("keeps the last accepted result when a merged change is refused", () => {
    let h = apply(historyOf<Doc>({ x: 0 }), set(1), "drag");
    h = apply(h, () => null, "drag");
    expect(h.present.x).toBe(1);
  });

  it("closes the open step on a change under another key or none", () => {
    let h = apply(historyOf<Doc>({ x: 0 }), set(1), "drag:a");
    h = apply(h, set(2), "drag:b");
    expect(h.past.map((d) => d.x)).toEqual([0, 1]);
    h = apply(h, set(3));
    expect(h.past.map((d) => d.x)).toEqual([0, 1, 2]);
    expect(h.open).toBeNull();
  });

  it("forgets the oldest steps past the limit", () => {
    let h = historyOf<Doc>({ x: 0 });
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) h = apply(h, set(i));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0].x).toBe(5);
  });
});

describe("seal", () => {
  it("keeps a step that changed something", () => {
    const h = seal(apply(historyOf<Doc>({ x: 0 }), set(4), "drag"));
    expect(h.open).toBeNull();
    expect(h.past.map((d) => d.x)).toEqual([0]);
    expect(h.present.x).toBe(4);
  });

  it("drops a step that came back to where it started, with its start as it was", () => {
    const start = { x: 0 };
    let h = apply(historyOf<Doc>(start), set(3), "drag");
    h = apply(h, set(0), "drag");
    h = seal(h);
    expect(h.past).toEqual([]);
    // Mutant: keeping the equal copy would read as an unsaved change.
    expect(h.present).toBe(start);
  });
});

describe("discardOpen", () => {
  it("restores the start and the redo steps the open step cleared", () => {
    let h = apply(historyOf<Doc>({ x: 0 }), set(1));
    h = undo(h);
    const before = h;
    h = apply(h, set(7), "drag");
    expect(h.future).toEqual([]);
    h = discardOpen(h);
    expect(h.present).toBe(before.present);
    expect(h.future).toEqual(before.future);
    expect(h.past).toEqual(before.past);
  });

  it("does nothing when no step is open", () => {
    const h = apply(historyOf<Doc>({ x: 0 }), set(1));
    expect(discardOpen(h)).toBe(h);
  });
});

describe("undo and redo", () => {
  it("walk the steps both ways and stop at the ends", () => {
    let h = apply(apply(historyOf<Doc>({ x: 0 }), set(1)), set(2));
    h = undo(undo(undo(h)));
    expect(h.present.x).toBe(0);
    h = redo(redo(redo(h)));
    expect(h.present.x).toBe(2);
  });

  it("close an open step first, so undo takes the whole gesture back", () => {
    let h = apply(historyOf<Doc>({ x: 0 }), set(1), "drag");
    h = apply(h, set(2), "drag");
    h = undo(h);
    expect(h.present.x).toBe(0);
    h = redo(h);
    expect(h.present.x).toBe(2);
  });
});

describe("useDocumentHistory", () => {
  it("exposes the document and what undo and redo can do", () => {
    const { result } = renderHook(() => useDocumentHistory<Doc>({ x: 0 }));
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.apply(set(1)));
    expect(result.current.doc.x).toBe(1);
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.doc.x).toBe(0);
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    expect(result.current.doc.x).toBe(1);
  });

  it("makes one step of a drag and none of a cancelled one", () => {
    const { result } = renderHook(() => useDocumentHistory<Doc>({ x: 0 }));
    act(() => result.current.apply(set(1), { merge: "drag" }));
    act(() => result.current.apply(set(2), { merge: "drag" }));
    act(() => result.current.seal());
    act(() => result.current.apply(set(9), { merge: "drag" }));
    act(() => result.current.discardOpen());
    expect(result.current.doc.x).toBe(2);
    act(() => result.current.undo());
    expect(result.current.doc.x).toBe(0);
  });

  it("starts over from a new document on reset", () => {
    const { result } = renderHook(() => useDocumentHistory<Doc>({ x: 0 }));
    act(() => result.current.apply(set(1)));
    act(() => result.current.reset({ x: 42 }));
    expect(result.current.doc.x).toBe(42);
    expect(result.current.canUndo).toBe(false);
  });
});

describe("a change that changes nothing", () => {
  it("makes no step, by the document's value or by the sameness given", () => {
    // A new object saying the same thing is no change.
    expect(apply(historyOf({ x: 1 }), (d) => ({ ...d })).past).toEqual([]);
    // With a sameness of its own, the caller says what "the same" is.
    const whole = (a: { x: number }, b: { x: number }) =>
      Math.trunc(a.x) === Math.trunc(b.x);
    const h = apply(historyOf({ x: 1 }), () => ({ x: 1.5 }), undefined, whole);
    expect(h.past).toEqual([]);
    expect(h.present).toEqual({ x: 1 });
  });
});

describe("the history's limit", () => {
  it("keeps every undo step when a gesture opened at the limit comes to nothing", () => {
    let h: History<{ x: number }> = historyOf({ x: 0 });
    for (let i = 1; i <= HISTORY_LIMIT; i++)
      h = apply(h, (d) => ({ ...d, x: i }));
    const oldest = h.past[0];
    // Opening the drag pushes the oldest step out; the drag ends where it
    // began, and gives it back.
    h = apply(h, (d) => ({ ...d, x: -1 }), "drag");
    h = apply(h, (d) => ({ ...d }), "drag");
    h = seal(h);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(oldest);
    // Discarded, the same.
    h = apply(h, (d) => ({ ...d, x: -1 }), "drag");
    h = discardOpen(h);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(oldest);
  });
});

describe("further cases, each pinned by a mutation", () => {
  type Doc = { x: number };

  const set = (x: number) => (d: Doc) => ({ ...d, x });
  const xs = (list: Doc[]) => list.map((d) => d.x);

  describe("a gesture that comes back to where it started", () => {
    it("gives back the redo steps its opening had cleared", () => {
      // Two steps, one undone: redo holds x = 2. A drag that ends where it
      // began must leave redo as it found it.
      let h: History<Doc> = apply(apply(historyOf({ x: 0 }), set(1)), set(2));
      h = undo(h);
      expect(xs(h.future)).toEqual([2]);
      h = apply(h, set(5), "drag");
      h = apply(h, set(1), "drag");
      expect(h.future).toEqual([]);
      h = seal(h);
      // Mutant: sealing with the history's own (empty) future loses x = 2.
      expect(xs(h.future)).toEqual([2]);
      expect(xs(h.past)).toEqual([0]);
      expect(redo(h).present.x).toBe(2);
    });

    it("leaves no step for undo to take, so undo goes to the step before it", () => {
      let h = apply(apply(historyOf<Doc>({ x: 0 }), set(1)), set(2));
      h = apply(h, set(9), "drag");
      h = apply(h, set(2), "drag");
      h = undo(h);
      expect(h.present.x).toBe(1);
    });
  });

  describe("apply", () => {
    it("opens no step when a gesture's first change is refused, so the next one starts from the document", () => {
      const start = historyOf<Doc>({ x: 0 });
      const refused = apply(start, () => null, "drag");
      expect(refused).toBe(start);
      const seen: Doc[] = [];
      const h = apply(
        refused,
        (d) => {
          seen.push(d);
          return { ...d, x: 4 };
        },
        "drag",
      );
      expect(seen).toEqual([{ x: 0 }]);
      expect(h.open?.base).toBe(start.present);
      expect(xs(h.past)).toEqual([0]);
    });

    it("closes a burst of typing when a change under no key arrives, even one that changes nothing", () => {
      let h = apply(historyOf<Doc>({ x: 0 }), set(3), "label");
      h = apply(h, (d) => d);
      expect(h.open).toBeNull();
      // The typing stays one step of its own, and the next burst under the
      // same key is a new step, not merged into the closed one.
      h = apply(h, set(4), "label");
      expect(xs(h.past)).toEqual([0, 3]);
    });

    it("makes the next gesture under another key a step of its own", () => {
      let h = apply(historyOf<Doc>({ x: 0 }), set(1), "drag:a");
      h = apply(h, set(2), "drag:a");
      h = apply(h, set(7), "drag:b");
      expect(xs(h.past)).toEqual([0, 2]);
      expect(h.open?.key).toBe("drag:b");
      expect(undo(h).present.x).toBe(2);
    });
  });

  describe("discardOpen", () => {
    it("puts back the very document the gesture started from", () => {
      const start = { x: 0 };
      let h = apply(historyOf<Doc>(start), set(3), "drag");
      h = apply(h, set(0), "drag");
      h = discardOpen(h);
      expect(h.present).toBe(start);
      expect(h.past).toEqual([]);
      expect(h.open).toBeNull();
    });
  });

  describe("useDocumentHistory", () => {
    it("tells undo and redo apart after a cancelled gesture that had cleared redo", () => {
      const { result } = renderHook(() => useDocumentHistory<Doc>({ x: 0 }));
      act(() => result.current.apply(set(1)));
      act(() => result.current.undo());
      expect(result.current.canRedo).toBe(true);
      act(() => result.current.apply(set(8), { merge: "drag" }));
      expect(result.current.canRedo).toBe(false);
      act(() => result.current.discardOpen());
      expect(result.current.doc.x).toBe(0);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });
  });
});
