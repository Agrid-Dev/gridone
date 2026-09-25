import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import type { GridoneClient, PipeElement, Synoptic } from "@gridone/sdk";
import {
  PageContainer,
  PageLayoutProvider,
} from "@/components/layout/PageLayout";
import { ShellFrame } from "@/components/layout/ShellFrame";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { createI18nMock } from "@/test/i18nMock";
import { SYMBOL_DRAG_TYPE } from "./library";
import { SynopticCreate, SynopticEdit } from "./SynopticEditor";

const { DEVICE, toast } = vi.hoisted(() => ({
  DEVICE: {
    id: "dev-new",
    name: "PAC 01 new",
    type: "heat_pump",
    attributes: {
      onoff_state: {
        name: "onoff_state",
        data_type: "bool",
        current_value: true,
      },
    },
  },
  toast: { error: vi.fn(), info: vi.fn() },
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Synoptics",
    "editor.untitled": "Untitled plate",
    "editor.name": "Name",
    "editor.label": "Label",
    "editor.unsaved": "Unsaved changes",
    "editor.undo": "Undo",
    "editor.redo": "Redo",
    "editor.discard": "Discard the unsaved changes?",
    "editor.tools.label": "Tools",
    "editor.tools.select": "Select",
    "editor.tools.pipe": "Pipe",
    "editor.tools.preview": "3D preview",
    "editor.keys.click": "Click",
    "editor.keys.enter": "Enter",
    "editor.keys.escape": "Esc",
    "editor.keys.delete": "Del",
    "editor.hints.pan": "Drag to pan",
    "editor.hints.place": "Click on the plan to place the symbol",
    "editor.hints.placeOnPipe": "This symbol goes on a pipe",
    "editor.hints.portOrBend": "a port, a pipe or a point to pass by",
    "editor.hints.finish": "finish here",
    "editor.hints.undoPoint": "take the last point back",
    "editor.hints.cancel": "cancel",
    "editor.shortcuts.rotate": "Rotate",
    "editor.shortcuts.delete": "Delete",
    "editor.library.title": "Symbols",
    "editor.library.search": "Search a symbol",
    "editor.library.empty": "No symbol matches.",
    "editor.library.onPipe": "goes on a pipe",
    "editor.library.groups.production": "Production",
    "editor.library.groups.storage": "Storage and expansion",
    "editor.library.groups.distribution": "Distribution",
    "editor.library.groups.onPipe": "On a pipe",
    "editor.library.groups.navigation": "Navigation",
    "editor.pipeTool.title": "Draw a pipe",
    "editor.checks.title": "{{count}} to check",
    "editor.checks.none": "Nothing to check",
    "editor.checks.note": "None of them stops a save.",
    "editor.checks.show": "Show",
    "editor.checks.bind": "Bind",
    "editor.checks.unbound": "No device: its readings will not show.",
    "editor.checks.rules.diagonal_segment": "A segment is not straight.",
    "editor.settings.title": "View settings",
    "editor.settings.view": "Opens as",
    "editor.settings.viewHint": "Operators can switch between the two.",
    "editor.settings.raised": "Something is raised: not the plan.",
    "editor.create.submit": "Create the view",
    "description.title": "Description",
    "view.plan": "Plan",
    "view.isometric": "Isometric",
    "view.zoomIn": "Zoom in",
    "view.zoomOut": "Zoom out",
    "view.fit": "Fit",
    "types.plate_exchanger": "Échangeur à plaques",
    "common:common.save": "Save",
    "common:common.saving": "Saving…",
    "common:common.cancel": "Cancel",
  }),
);
vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: () => ({ devices: [DEVICE], loading: false, error: null }),
}));
vi.mock("@/hooks/useDeviceById", () => ({
  useDeviceById: (id?: string) => ({
    data: id === DEVICE.id ? DEVICE : undefined,
  }),
}));
vi.mock("@/hooks/useCanSeeConnectionStatus", () => ({
  useCanSeeConnectionStatus: () => false,
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/layout/ShellNavigation", () => ({
  ShellNavigation: () => <nav aria-label="shell" />,
}));
// The card and the dialog draw a second plate; the card has its own spec.
vi.mock("./PreviewCard", () => ({
  PreviewCard: () => <div data-testid="preview-card" />,
}));
vi.mock("./PreviewDialog", () => ({ PreviewDialog: () => null }));

const UPDATED_AT = "2026-09-17T12:00:00+00:00";
const PLATE: Synoptic = {
  ...JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        "../../../../../../docs/specs/synoptic/ecs-ouest.json",
      ),
      "utf8",
    ),
  ),
  id: "ouest",
  metadata: { created_at: UPDATED_AT, updated_at: UPDATED_AT },
};
/** PAC 01 (bound to its device) and the tank b01 (bound to nothing). */
const SMALL: Synoptic = {
  ...PLATE,
  symbols: PLATE.symbols!.filter((s) => ["pac-01", "b01"].includes(s.id)),
  pipes: [],
  labels: [],
};
/** PAC 01 alone: nothing on it to check. */
const BOUND: Synoptic = {
  ...SMALL,
  symbols: SMALL.symbols!.filter((s) => s.id === "pac-01"),
};
/** A run from PAC 01's supply straight to the tank's inlet: a diagonal
 *  the backend refuses. */
const CROOKED: PipeElement = {
  id: "feed",
  fluid: "primary_supply",
  from: { kind: "port", symbol: "pac-01", port: "supply" },
  to: { kind: "port", symbol: "b01", port: "primary_in" },
  waypoints: [],
  flow: null,
  tags: [],
};

Object.defineProperty(SVGElement.prototype, "getScreenCTM", {
  configurable: true,
  value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
});

function renderEditor(
  path: string,
  stored: Synoptic = SMALL,
  get: () => Promise<Synoptic> = async () => stored,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const client = {
    synoptics: {
      list: vi.fn(async () => ({
        items: [
          {
            id: PLATE.id,
            name: PLATE.name,
            description: null,
            projection: "isometric",
            metadata: {},
          },
        ],
      })),
      get: vi.fn(get),
      create: vi.fn(async (doc: unknown) => ({ ...(doc as object), id: "p1" })),
      replace: vi.fn(async () => stored),
    },
  } as unknown as GridoneClient;
  render(
    <GridoneClientProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <PageLayoutProvider>
            <ShellFrame>
              <main>
                <PageContainer>
                  <Routes>
                    <Route path="/synoptics" element={<p>index</p>} />
                    <Route path="/synoptics/new" element={<SynopticCreate />} />
                    <Route
                      path="/synoptics/:synopticId/edit"
                      element={<SynopticEdit />}
                    />
                    <Route
                      path="/synoptics/:synopticId"
                      element={<p>detail</p>}
                    />
                  </Routes>
                </PageContainer>
              </main>
            </ShellFrame>
          </PageLayoutProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </GridoneClientProvider>,
  );
  return client.synoptics as unknown as {
    replace: ReturnType<typeof vi.fn>;
  };
}

const opened = () => screen.findByDisplayValue(PLATE.name);
const hit = (id: string) =>
  document.querySelector(
    `[data-editor-symbol='${id}'] rect[fill='transparent']`,
  )!;
const hints = () => document.querySelector("[data-editor-hints]")!.textContent;
const library = () => screen.getByRole("complementary", { name: "Symbols" });
const row = (name: string) => within(library()).getByRole("button", { name });
const save = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("detail");
};
const nav = () => screen.queryByRole("navigation", { name: "shell" });

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the editor in the app's shell", () => {
  it("takes the whole window, and gives it back once left", async () => {
    renderEditor("/synoptics/ouest/edit");
    await opened();
    // Mutant: an editor that does not ask for focus sits under the app's
    // sidebar and top bar, with a second way back and half the room.
    expect(nav()).toBeNull();
    expect(document.querySelector(".max-w-7xl")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Synoptics" }));
    await screen.findByText("detail");
    // Mutant: a focus never handed back leaves every other page bare.
    expect(nav()).not.toBeNull();
    expect(document.querySelector(".max-w-7xl")).not.toBeNull();
  });

  it("takes it under the New dialog as well", async () => {
    renderEditor("/synoptics/new");
    await screen.findByRole("dialog");
    // The modal hides the rest of the page from the accessibility tree: a
    // plain query would miss the shell even where it is drawn.
    const shell = () =>
      screen.queryByRole("navigation", { name: "shell", hidden: true });
    expect(shell()).toBeNull();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    await screen.findByText("index");
    expect(shell()).not.toBeNull();
  });
  it("takes the window while the plate loads, and gives it back to an error", async () => {
    let fail: (error: Error) => void = () => {};
    renderEditor(
      "/synoptics/ouest/edit",
      SMALL,
      () =>
        new Promise<Synoptic>((_, reject) => {
          fail = reject;
        }),
    );
    // Loading: the editor's own frame already, never the shell under it
    // for a moment.
    await waitFor(() =>
      expect(document.querySelector("[aria-busy]")).not.toBeNull(),
    );
    expect(nav()).toBeNull();
    // An error page keeps the app's way out.
    await act(async () => fail(new Error("down")));
    await waitFor(() => expect(nav()).not.toBeNull());
    expect(document.querySelector("[aria-busy]")).toBeNull();
  });
});

describe("EditorTopBar", () => {
  it("marks unsaved work, and clears the mark once the edit is undone", async () => {
    renderEditor("/synoptics/ouest/edit");
    await opened();
    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    expect(undo).toHaveProperty("disabled", true);
    fireEvent.click(hit("b01"));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(undo).toHaveProperty("disabled", false);
    expect(redo).toHaveProperty("disabled", true);
    fireEvent.click(undo);
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    expect(redo).toHaveProperty("disabled", false);
    fireEvent.click(redo);
    expect(document.querySelector("[data-editor-symbol='b01']")).toBeNull();
  });

  it("shows the save in flight, and takes no second press", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await opened();
    let done: (plate: Synoptic) => void = () => {};
    api.replace.mockImplementationOnce(
      () => new Promise<Synoptic>((resolve) => (done = resolve)),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const saving = await screen.findByRole("button", { name: "Saving…" });
    expect(saving).toHaveProperty("disabled", true);
    done(SMALL);
    await screen.findByText("detail");
    expect(api.replace).toHaveBeenCalledOnce();
  });

  it("leaves the name field on Enter, so the next keys are the plate's again", async () => {
    renderEditor("/synoptics/ouest/edit");
    const name = await opened();
    name.focus();
    fireEvent.change(name, { target: { value: "ECS Ouest bis" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(document.activeElement).not.toBe(name);
  });
});

describe("EditorToolbar", () => {
  it("presses the tool in hand, and the panel follows it", async () => {
    renderEditor("/synoptics/ouest/edit");
    await opened();
    const tools = screen.getByRole("toolbar", { name: "Tools" });
    const select = within(tools).getByRole("button", { name: /Select/ });
    const pipe = within(tools).getByRole("button", { name: /Pipe/ });
    expect(select).toHaveAttribute("aria-pressed", "true");
    expect(pipe).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pipe);
    expect(pipe).toHaveAttribute("aria-pressed", "true");
    expect(select).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("heading", { name: "Draw a pipe" }),
    ).toBeInTheDocument();
  });

  it("shows and hides the 3D preview, and remembers it for the next plate", async () => {
    renderEditor("/synoptics/ouest/edit");
    await opened();
    const preview = screen.getByRole("button", { name: "3D preview" });
    expect(preview).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("preview-card")).toBeInTheDocument();
    fireEvent.click(preview);
    expect(preview).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("preview-card")).toBeNull();
    cleanup();
    renderEditor("/synoptics/ouest/edit");
    await opened();
    expect(screen.queryByTestId("preview-card")).toBeNull();
    expect(screen.getByRole("button", { name: "3D preview" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("EditorStatusBar", () => {
  it("tells the keys that apply to what is in hand", async () => {
    renderEditor("/synoptics/ouest/edit");
    await opened();
    expect(hints()).toContain("Rotate");
    fireEvent.click(row("Pump"));
    // Mutant: the floor's hint for a pump sends the author clicking on
    // cells where it cannot land.
    expect(hints()).toContain("This symbol goes on a pipe");
    expect(hints()).not.toContain("Click on the plan to place the symbol");
    fireEvent.click(row("Heat pump"));
    expect(hints()).toContain("Click on the plan to place the symbol");
    expect(hints()).not.toContain("This symbol goes on a pipe");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(hints()).toContain("Rotate");
    fireEvent.click(screen.getByRole("button", { name: /Pipe/ }));
    expect(hints()).toContain("a port, a pipe or a point to pass by");
    expect(hints()).toContain("finish here");
    expect(hints()).not.toContain("Rotate");
  });

  it("reads the view's zoom and puts it back", async () => {
    renderEditor("/synoptics/ouest/edit");
    await opened();
    const zoom = () => screen.getByText(/^\d+ %$/).textContent;
    expect(zoom()).toBe("100 %");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(zoom()).toBe("125 %");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(zoom()).toBe("156 %");
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(zoom()).toBe("125 %");
    fireEvent.click(screen.getByRole("button", { name: /Fit/ }));
    expect(zoom()).toBe("100 %");
  });

  it("counts what to check, and binds a symbol from the list", async () => {
    renderEditor("/synoptics/ouest/edit");
    await opened();
    const pill = screen.getByRole("button", { name: /1 to check/ });
    fireEvent.click(pill);
    const note = await screen.findByText("None of them stops a save.");
    const list = note.closest("[data-checks]") as HTMLElement;
    const entry = within(list).getByText("b01").closest("li")!;
    expect(
      within(entry).getByText("No device: its readings will not show."),
    ).toBeInTheDocument();
    // Mutant: "Show" on a symbol without a device hides what to do.
    fireEvent.click(within(entry).getByRole("button", { name: "Bind" }));
    expect(screen.queryByText("None of them stops a save.")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveAttribute(
      "placeholder",
      "b01",
    );
  });

  it("leads from a check on a run to the run, out of the pipe tool", async () => {
    renderEditor("/synoptics/ouest/edit", { ...SMALL, pipes: [CROOKED] });
    await opened();
    fireEvent.click(screen.getByRole("button", { name: /Pipe/ }));
    fireEvent.click(screen.getByRole("button", { name: /2 to check/ }));
    const rule = await screen.findByText("A segment is not straight.");
    const entry = rule.closest("li")!;
    expect(within(entry).getByText("feed")).toBeInTheDocument();
    fireEvent.click(within(entry).getByRole("button", { name: "Show" }));
    expect(screen.getByRole("heading", { name: "feed" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("toolbar", { name: "Tools" })).getByRole(
        "button",
        { name: /Select/ },
      ),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("says when there is nothing to check", async () => {
    renderEditor("/synoptics/ouest/edit", BOUND);
    await opened();
    expect(screen.getByText("Nothing to check")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /to check/ })).toBeNull();
  });
});

describe("ViewSettings", () => {
  const settings = () =>
    fireEvent.click(screen.getByRole("button", { name: "View settings" }));
  const plan = () =>
    within(screen.getByRole("group", { name: "Opens as" })).getByRole(
      "button",
      { name: "Plan" },
    );

  it("refuses the plan as the view while anything stands raised", async () => {
    renderEditor("/synoptics/ouest/edit", PLATE);
    await opened();
    settings();
    // feed-col-2 passes overhead; the plate opens isometric.
    expect(plan()).toHaveProperty("disabled", true);
    expect(
      screen.getAllByText("Something is raised: not the plan.").length,
    ).toBeGreaterThan(0);
  });

  it("offers the plan as the view when nothing is raised, and saves it", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await opened();
    settings();
    // The same isometric plate, without its raised run.
    expect(plan()).toHaveProperty("disabled", false);
    expect(
      screen.getByText("Operators can switch between the two."),
    ).toBeInTheDocument();
    fireEvent.click(plan());
    expect(plan()).toHaveAttribute("aria-pressed", "true");
    await save();
    expect(api.replace.mock.calls[0][1].projection).toBe("flat");
  });

  it("saves the description operators read", async () => {
    const api = renderEditor("/synoptics/ouest/edit");
    await opened();
    settings();
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "West wing" },
    });
    await save();
    expect(api.replace.mock.calls[0][1].description).toBe("West wing");
  });
});

describe("SymbolLibrary", () => {
  const shelves = () =>
    within(library())
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);

  it("files the types on shelves, and says which ride a pipe", async () => {
    renderEditor("/synoptics/ouest/edit");
    await opened();
    expect(shelves()).toEqual([
      "Production",
      "Storage and expansion",
      "Distribution",
      "On a pipe",
      "Navigation",
    ]);
    const onPipe = within(library())
      .getByRole("heading", { name: "On a pipe" })
      .closest("section")!;
    expect(within(onPipe).getByText("goes on a pipe")).toBeInTheDocument();
    expect(within(onPipe).getByRole("button", { name: "Pump" })).toBeTruthy();
    // Mutant: the note on every shelf says a tank rides a pipe.
    expect(within(library()).getAllByText("goes on a pipe")).toHaveLength(1);
  });

  it("finds a type by the name the author reads, accents and case aside", async () => {
    renderEditor("/synoptics/ouest/edit");
    await opened();
    const search = screen.getByRole("searchbox", { name: "Search a symbol" });
    fireEvent.change(search, { target: { value: "ECHANGEUR" } });
    // Mutant: a search over the registry id alone finds nothing here.
    expect(
      within(library())
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Échangeur à plaques"]);
    expect(shelves()).toEqual(["Production"]);
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("No symbol matches.")).toBeInTheDocument();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(search).toHaveValue("");
    expect(shelves()).toHaveLength(5);
  });

  it("arms a type on a click, and disarms it on a second", async () => {
    renderEditor("/synoptics/ouest/edit");
    await opened();
    fireEvent.click(row("Heat pump"));
    expect(row("Heat pump")).toHaveAttribute("aria-pressed", "true");
    expect(hints()).toContain("Click on the plan to place the symbol");
    fireEvent.click(row("Heat pump"));
    // Mutant: a row that only ever arms leaves the author no way back but
    // Escape.
    expect(row("Heat pump")).toHaveAttribute("aria-pressed", "false");
    expect(hints()).not.toContain("Click on the plan to place the symbol");
  });

  it("hands its type to a drag, with the hint for as long as the drag lasts", async () => {
    renderEditor("/synoptics/ouest/edit");
    await opened();
    const data: Record<string, string> = {};
    const transfer = {
      effectAllowed: "all",
      setData: (k: string, v: string) => {
        data[k] = v;
      },
    };
    fireEvent.dragStart(row("Pump"), { dataTransfer: transfer });
    expect(data[SYMBOL_DRAG_TYPE]).toBe("pump");
    expect(transfer.effectAllowed).toBe("copy");
    expect(hints()).toContain("This symbol goes on a pipe");
    fireEvent.dragEnd(row("Pump"), { dataTransfer: transfer });
    expect(hints()).not.toContain("This symbol goes on a pipe");
    expect(hints()).toContain("Rotate");
  });

  it("goes to the search on /", async () => {
    renderEditor("/synoptics/ouest/edit");
    await opened();
    fireEvent.keyDown(window, { key: "/" });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("searchbox", { name: "Search a symbol" }),
      ),
    );
  });
});
