import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SymbolElement } from "@gridone/sdk";
import type { RoutePoint } from "./document";
import { useEditorShortcuts } from "./useEditorShortcuts";
import type { SynopticEditorState } from "./useSynopticEditor";

const point = (x: number): RoutePoint => ({
  endpoint: { kind: "cell", cell: { x, y: 0, z: 0 } },
  cell: { x, y: 0, z: 0 },
});
const free: SymbolElement = {
  id: "tank-1",
  type: "tank",
  placement: { kind: "cell", cell: { x: 0, y: 0 }, rotation: 0 },
  props: { capacity: "" },
  bindings: {},
};
const collector: SymbolElement = {
  id: "c",
  type: "collector",
  placement: { kind: "cell", cell: { x: 0, y: 0 }, rotation: 0 },
  props: { axis: "x", length: 2, ports: {} },
  bindings: {},
};
const riding: SymbolElement = {
  id: "v",
  type: "valve_isolation",
  placement: { kind: "pipe", pipe: "r", cell: { x: 2, y: 0 } },
  props: {},
  bindings: {},
};

type Fake = {
  drag: { active: boolean };
  history: { undo: () => void; redo: () => void };
  draw: {
    points: RoutePoint[];
    cancel: () => void;
    finish: () => void;
    undoPoint: () => void;
  };
  placing: string | null;
  selection: { kind: "symbol" | "pipe"; id: string } | null;
  symbol: SymbolElement | undefined;
  arm: (type: string | null) => void;
  select: (s: unknown) => void;
  remove: () => void;
  duplicate: (id: string) => void;
  rotate: (id: string) => void;
  setTool: (tool: string) => void;
};

/** The editor as the shortcuts read it: every action a spy, the state as
 *  given. */
function fakeEditor(state: Partial<Fake> = {}): Fake {
  return {
    drag: { active: false },
    history: { undo: vi.fn(), redo: vi.fn() },
    draw: {
      points: [],
      cancel: vi.fn(),
      finish: vi.fn(),
      undoPoint: vi.fn(),
    },
    placing: null,
    selection: null,
    symbol: undefined,
    arm: vi.fn(),
    select: vi.fn(),
    remove: vi.fn(),
    duplicate: vi.fn(),
    rotate: vi.fn(),
    setTool: vi.fn(),
    ...state,
  };
}

/** Every spy the fake carries, by name, and whether it was called. */
function calls(editor: Fake, focus: () => void): string[] {
  const spies: Record<string, unknown> = {
    undo: editor.history.undo,
    redo: editor.history.redo,
    cancel: editor.draw.cancel,
    finish: editor.draw.finish,
    undoPoint: editor.draw.undoPoint,
    arm: editor.arm,
    select: editor.select,
    remove: editor.remove,
    duplicate: editor.duplicate,
    rotate: editor.rotate,
    setTool: editor.setTool,
    focus,
  };
  return Object.entries(spies)
    .filter(([, spy]) => (spy as ReturnType<typeof vi.fn>).mock.calls.length)
    .map(([name]) => name);
}

function Keys({ editor, focus }: { editor: Fake; focus: () => void }) {
  useEditorShortcuts(editor as unknown as SynopticEditorState, focus);
  return (
    <div>
      <input aria-label="field" />
      <textarea aria-label="area" />
      <div data-testid="editable" contentEditable="true" />
      <select aria-label="choice">
        <option>a</option>
      </select>
      <button type="button" role="combobox" aria-label="combo" />
      <div role="listbox" data-testid="listbox" tabIndex={0} />
      <div role="menu" data-testid="menu" tabIndex={0} />
      <div role="dialog" data-testid="dialog">
        <span data-testid="in-dialog">x</span>
      </div>
      <div role="alertdialog" data-testid="alertdialog" tabIndex={0} />
      <div data-radix-popper-content-wrapper="">
        <span data-testid="popper">x</span>
      </div>
      <aside data-editor-panel>
        <button type="button">panel</button>
      </aside>
      <button type="button">plain</button>
    </div>
  );
}

function setup(state: Partial<Fake> = {}) {
  const editor = fakeEditor(state);
  const focus = vi.fn();
  const view = render(<Keys editor={editor} focus={focus} />);
  return { editor, focus, view };
}

/** Presses a key on `target` (the page by default) and says whether the
 *  shortcut kept the browser's own response from happening. */
const press = (
  key: string,
  modifiers: Partial<
    Record<"metaKey" | "ctrlKey" | "shiftKey" | "altKey", boolean>
  > = {},
  target: Element | Window = document.body,
) => !fireEvent.keyDown(target, { key, ...modifiers });

afterEach(() => {
  cleanup();
});

describe("useEditorShortcuts: undo and redo", () => {
  it("undoes on ⌘Z or Ctrl+Z and redoes on ⇧⌘Z, Ctrl+Y or ⌘Y, keeping the browser out", () => {
    const { editor } = setup();
    expect(press("z", { metaKey: true })).toBe(true);
    expect(press("z", { ctrlKey: true })).toBe(true);
    expect(editor.history.undo).toHaveBeenCalledTimes(2);
    expect(press("z", { metaKey: true, shiftKey: true })).toBe(true);
    expect(press("Z", { metaKey: true, shiftKey: true })).toBe(true);
    expect(press("y", { ctrlKey: true })).toBe(true);
    expect(press("y", { metaKey: true })).toBe(true);
    expect(editor.history.redo).toHaveBeenCalledTimes(4);
    expect(editor.history.undo).toHaveBeenCalledTimes(2);
  });

  it("leaves ⌘Z to a text field, which keeps the browser's own undo", () => {
    const { editor, focus } = setup();
    for (const target of [
      screen.getByLabelText("field"),
      screen.getByLabelText("area"),
      screen.getByTestId("editable"),
    ]) {
      expect(press("z", { metaKey: true }, target)).toBe(false);
      expect(press("z", { metaKey: true, shiftKey: true }, target)).toBe(false);
    }
    expect(calls(editor, focus)).toEqual([]);
  });

  it("undoes from a control that is not a text field", () => {
    // A menu or a list has no undo of its own: ⌘Z there is the plate's.
    const { editor } = setup();
    press("z", { metaKey: true }, screen.getByTestId("menu"));
    press(
      "z",
      { metaKey: true },
      screen.getByRole("button", { name: "panel" }),
    );
    expect(editor.history.undo).toHaveBeenCalledTimes(2);
  });
});

describe("useEditorShortcuts: what holds every key back", () => {
  const everyKey = (target?: Element) => {
    press("z", { metaKey: true }, target);
    press("d", { metaKey: true }, target);
    press("Escape", {}, target);
    press("Enter", {}, target);
    press("Delete", {}, target);
    press("Backspace", {}, target);
    press("/", {}, target);
    press("v", {}, target);
    press("p", {}, target);
    press("r", {}, target);
  };
  /** Every key has something to act on: a run with two points, an armed
   *  type, a selected symbol that can turn. */
  const busy = (): Partial<Fake> => ({
    draw: { ...fakeEditor().draw, points: [point(0), point(3)] },
    selection: { kind: "symbol", id: free.id },
    symbol: free,
    placing: "pump",
  });

  it("does nothing while a symbol is dragged", () => {
    const { editor, focus } = setup({ ...busy(), drag: { active: true } });
    everyKey();
    expect(calls(editor, focus)).toEqual([]);
  });

  it("does nothing for a key another handler already took", () => {
    const { editor, focus } = setup(busy());
    const plain = screen.getByRole("button", { name: "plain" });
    plain.addEventListener("keydown", (e) => e.preventDefault());
    everyKey(plain);
    expect(calls(editor, focus)).toEqual([]);
  });

  it("leaves every key but undo to a field, a list, a menu, a dialog or a popover", () => {
    const found: string[] = [];
    for (const name of [
      "input",
      "textarea",
      "contenteditable",
      "select",
      "combobox",
      "listbox",
      "menu",
      "dialog",
      "alertdialog",
      "popper",
    ]) {
      cleanup();
      const { editor, focus } = setup(busy());
      const byName: Record<string, () => Element> = {
        input: () => screen.getByLabelText("field"),
        textarea: () => screen.getByLabelText("area"),
        contenteditable: () => screen.getByTestId("editable"),
        select: () => screen.getByLabelText("choice"),
        combobox: () => screen.getByLabelText("combo"),
        listbox: () => screen.getByTestId("listbox"),
        menu: () => screen.getByTestId("menu"),
        dialog: () => screen.getByTestId("in-dialog"),
        alertdialog: () => screen.getByTestId("alertdialog"),
        popper: () => screen.getByTestId("popper"),
      };
      const target = byName[name]();
      press("d", { metaKey: true }, target);
      press("Escape", {}, target);
      press("Enter", {}, target);
      press("Delete", {}, target);
      press("Backspace", {}, target);
      press("/", {}, target);
      press("v", {}, target);
      press("p", {}, target);
      press("r", {}, target);
      const fired = calls(editor, focus);
      if (fired.length) found.push(`${name}: ${fired.join(", ")}`);
    }
    expect(found).toEqual([]);
  });

  it("leaves a key with Alt, Ctrl or ⌘ to the browser", () => {
    const { editor, focus } = setup({
      selection: { kind: "symbol", id: free.id },
      symbol: free,
    });
    // A reload, a print, a find: never a turn, a pipe or a deletion.
    const prevented = [
      press("r", { ctrlKey: true }),
      press("r", { metaKey: true }),
      press("r", { altKey: true }),
      press("p", { ctrlKey: true }),
      press("v", { altKey: true }),
      press("Delete", { altKey: true }),
      press("Backspace", { metaKey: true }),
    ];
    expect(calls(editor, focus)).toEqual([]);
    expect(prevented.some(Boolean)).toBe(false);
  });
});

describe("useEditorShortcuts: the plate's keys", () => {
  it("backs out one level per Escape: the run, then the armed symbol, then the selection", () => {
    const drawing = setup({
      draw: { ...fakeEditor().draw, points: [point(0)] },
      placing: "pump",
    });
    press("Escape");
    expect(calls(drawing.editor, drawing.focus)).toEqual(["cancel"]);
    cleanup();
    const armed = setup({ placing: "pump" });
    press("Escape");
    expect(calls(armed.editor, armed.focus)).toEqual(["arm"]);
    expect(armed.editor.arm).toHaveBeenCalledWith(null);
    cleanup();
    const idle = setup({ selection: { kind: "pipe", id: "r" } });
    press("Escape");
    expect(calls(idle.editor, idle.focus)).toEqual(["select"]);
    expect(idle.editor.select).toHaveBeenCalledWith(null);
  });

  it("finishes a run on Enter once it has two points, unless Enter presses a button", () => {
    const one = setup({ draw: { ...fakeEditor().draw, points: [point(0)] } });
    press("Enter");
    expect(one.editor.draw.finish).not.toHaveBeenCalled();
    cleanup();
    const two = setup({
      draw: { ...fakeEditor().draw, points: [point(0), point(3)] },
    });
    press("Enter", {}, screen.getByRole("button", { name: "plain" }));
    expect(two.editor.draw.finish).not.toHaveBeenCalled();
    press("Enter");
    expect(two.editor.draw.finish).toHaveBeenCalledOnce();
  });

  it("takes the last point back on Backspace mid-run, deletes nothing, and swallows Delete there", () => {
    const { editor, focus } = setup({
      draw: { ...fakeEditor().draw, points: [point(0), point(3)] },
      selection: { kind: "symbol", id: free.id },
      symbol: free,
    });
    expect(press("Backspace")).toBe(true);
    expect(press("Delete")).toBe(true);
    expect(calls(editor, focus)).toEqual(["undoPoint"]);
    expect(editor.draw.undoPoint).toHaveBeenCalledOnce();
  });

  it("deletes the selection on Delete or Backspace, and nothing without one", () => {
    const idle = setup();
    expect(press("Delete")).toBe(false);
    expect(idle.editor.remove).not.toHaveBeenCalled();
    cleanup();
    const { editor } = setup({ selection: { kind: "pipe", id: "r" } });
    expect(press("Delete")).toBe(true);
    expect(press("Backspace")).toBe(true);
    expect(editor.remove).toHaveBeenCalledTimes(2);
  });

  it("deletes and turns nothing from a button of the side panel", () => {
    const { editor, focus } = setup({
      selection: { kind: "symbol", id: free.id },
      symbol: free,
    });
    const button = screen.getByRole("button", { name: "panel" });
    press("Delete", {}, button);
    press("Backspace", {}, button);
    press("r", {}, button);
    expect(calls(editor, focus)).toEqual([]);
  });

  it("turns the selected symbol on R, when it can turn", () => {
    const { editor } = setup({
      selection: { kind: "symbol", id: free.id },
      symbol: free,
    });
    press("r");
    press("R", { shiftKey: true });
    expect(editor.rotate).toHaveBeenCalledTimes(2);
    expect(editor.rotate).toHaveBeenCalledWith("tank-1");
    for (const symbol of [collector, riding]) {
      cleanup();
      const other = setup({
        selection: { kind: "symbol", id: symbol.id },
        symbol,
      });
      press("r");
      expect(other.editor.rotate).not.toHaveBeenCalled();
    }
  });

  it("copies the selected symbol on ⌘D, and keeps the browser's bookmark away either way", () => {
    const none = setup();
    expect(press("d", { metaKey: true })).toBe(true);
    expect(none.editor.duplicate).not.toHaveBeenCalled();
    cleanup();
    const { editor } = setup({
      selection: { kind: "symbol", id: free.id },
      symbol: free,
    });
    expect(press("d", { ctrlKey: true })).toBe(true);
    expect(editor.duplicate).toHaveBeenCalledWith("tank-1");
  });

  it("picks the tool on V and P, and goes to the library search on /", () => {
    const { editor, focus } = setup();
    press("v");
    press("P", { shiftKey: true });
    expect(editor.setTool).toHaveBeenNthCalledWith(1, "select");
    expect(editor.setTool).toHaveBeenNthCalledWith(2, "pipe");
    expect(press("/")).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
  });
});

describe("useEditorShortcuts: its listener", () => {
  it("reads the editor as it is at the press, not as it was mounted", () => {
    const first = fakeEditor();
    const focus = vi.fn();
    const { rerender } = render(<Keys editor={first} focus={focus} />);
    const next = fakeEditor({ selection: { kind: "pipe", id: "r" } });
    rerender(<Keys editor={next} focus={focus} />);
    press("Delete");
    expect(first.remove).not.toHaveBeenCalled();
    expect(next.remove).toHaveBeenCalledOnce();
  });

  it("stops listening once the editor is gone", () => {
    const { editor, view } = setup();
    view.unmount();
    press("z", { metaKey: true });
    expect(editor.history.undo).not.toHaveBeenCalled();
  });
});
