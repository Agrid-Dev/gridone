import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { GridoneClient, Synoptic, SynopticSummary } from "@gridone/sdk";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { createI18nMock } from "@/test/i18nMock";
import { NewSynopticDialog } from "./NewSynopticDialog";

const { toast } = vi.hoisted(() => ({
  toast: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    "editor.create.title": "New synoptic",
    "editor.create.name": "Name",
    "editor.create.nameRequired": "Give the view a name.",
    "editor.create.blank": "Blank view",
    "editor.create.duplicate": "Copy a view of the site",
    "editor.create.source": "View to copy",
    "editor.create.sourceRequired": "Pick the view to copy.",
    "editor.create.submit": "Create the view",
    "editor.create.loading": "Loading…",
    "editor.create.failed": "The view to copy could not be read.",
    "editor.create.raised":
      "The copied view has raised elements: it will open isometric.",
    "editor.create.views.flat": "The diagram, as drawn",
    "editor.create.views.isometric": "In volume",
    "editor.link.none": "No view",
    "view.plan": "Plan",
    "view.isometric": "Isometric",
    "common:common.cancel": "Cancel",
  }),
);
vi.mock("sonner", () => ({ toast }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SUMMARIES: SynopticSummary[] = [
  {
    id: "ouest",
    name: "ECS Ouest",
    description: null,
    projection: "isometric",
    metadata: {},
  } as unknown as SynopticSummary,
  {
    id: "est",
    name: "ECS Est",
    description: null,
    projection: "flat",
    metadata: {},
  } as unknown as SynopticSummary,
];

/** A stored plate with one tank and one run on the floor. */
const STORED: Synoptic = {
  id: "ouest",
  metadata: { created_at: "2026-09-01", updated_at: "2026-09-02" },
  version: 1,
  name: "ECS Ouest",
  description: "Hot water, west wing",
  projection: "isometric",
  symbols: [
    {
      id: "b01",
      type: "tank",
      placement: { kind: "cell", cell: { x: 4, y: 0 }, rotation: 0 },
      props: { capacity: "500 L" },
      bindings: {},
    },
  ],
  pipes: [
    {
      id: "run",
      fluid: "dhw",
      from: { kind: "cell", cell: { x: 0, y: 0 } },
      to: { kind: "port", symbol: "b01", port: "primary_in" },
      waypoints: [],
      flow: null,
      tags: [],
    },
  ],
  labels: [],
} as unknown as Synoptic;
/** The same plate with its run passing overhead. */
const RAISED: Synoptic = {
  ...STORED,
  pipes: [
    {
      ...STORED.pipes![0],
      waypoints: [
        { x: 1, y: 0, z: 1 },
        { x: 3, y: 0, z: 1 },
      ],
    },
  ],
} as Synoptic;

function renderDialog({
  synoptics = SUMMARIES,
  get = vi.fn(async () => STORED),
}: {
  synoptics?: SynopticSummary[];
  get?: ReturnType<typeof vi.fn>;
} = {}) {
  const client = { synoptics: { get } } as unknown as GridoneClient;
  const onStart = vi.fn();
  const onCancel = vi.fn();
  render(
    <GridoneClientProvider client={client}>
      <NewSynopticDialog
        open
        synoptics={synoptics}
        onStart={onStart}
        onCancel={onCancel}
      />
    </GridoneClientProvider>,
  );
  return { onStart, onCancel, get };
}

const name = () => screen.getByRole("textbox", { name: "Name" });
const typeName = (value: string) =>
  fireEvent.change(name(), { target: { value } });
const submit = () => screen.getByRole("button", { name: "Create the view" });
const copy = () =>
  screen.getByRole("button", { name: /Copy a view of the site/ });
async function create() {
  await waitFor(() => expect(submit()).toHaveProperty("disabled", false));
  fireEvent.click(submit());
}
/** The authored document of `plate`, as the editor starts from it. */
function documentOf(plate: Synoptic) {
  const doc: Partial<Synoptic> = { ...plate };
  delete doc.id;
  delete doc.metadata;
  return doc;
}

describe("NewSynopticDialog", () => {
  it("starts a blank plate under the name typed, trimmed, on the view chosen", async () => {
    const { onStart, get } = renderDialog();
    typeName("  Cold production  ");
    fireEvent.click(screen.getByRole("button", { name: /Plan/ }));
    await create();
    await waitFor(() => expect(onStart).toHaveBeenCalledOnce());
    expect(onStart).toHaveBeenCalledWith({
      version: 1,
      name: "Cold production",
      description: null,
      projection: "flat",
      symbols: [],
      pipes: [],
      labels: [],
    });
    expect(get).not.toHaveBeenCalled();
  });

  it("starts isometric when the view is left as it is", async () => {
    const { onStart } = renderDialog();
    typeName("Cold production");
    await create();
    await waitFor(() => expect(onStart).toHaveBeenCalledOnce());
    expect(onStart.mock.calls[0][0].projection).toBe("isometric");
  });

  it("holds the plate back while its name is blank, and says why", async () => {
    const { onStart } = renderDialog();
    typeName("   ");
    // Mutant: a name of spaces is refused at save as string_too_short.
    await screen.findByText("Give the view a name.");
    // The button stays pressable: a press says what is missing.
    expect(submit()).toHaveProperty("disabled", false);
    fireEvent.click(submit());
    await screen.findByText("Give the view a name.");
    expect(onStart).not.toHaveBeenCalled();
    typeName("Cold production");
    await waitFor(() =>
      expect(screen.queryByText("Give the view a name.")).toBeNull(),
    );
  });

  it("holds a copy back until its source is picked, and says so when pressed", async () => {
    const { onStart } = renderDialog();
    typeName("ECS Ouest bis");
    expect(copy()).toHaveProperty("disabled", false);
    fireEvent.click(copy());
    expect(screen.queryByText("Pick the view to copy.")).toBeNull();
    fireEvent.click(submit());
    await screen.findByText("Pick the view to copy.");
    expect(onStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("option", { name: "ECS Est" }));
    await waitFor(() =>
      expect(screen.queryByText("Pick the view to copy.")).toBeNull(),
    );
  });

  it("offers no copy on a site without another view", () => {
    renderDialog({ synoptics: [] });
    // The twin above finds this button enabled with a view to copy.
    expect(copy()).toHaveProperty("disabled", true);
  });

  it("lists the views to copy, and no 'no view' among them", () => {
    renderDialog();
    fireEvent.click(copy());
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "ECS Ouest",
      "ECS Est",
    ]);
    expect(screen.queryByRole("option", { name: "No view" })).toBeNull();
  });

  it("starts from a copy of the source, under the new name, on the view chosen", async () => {
    const { onStart, get } = renderDialog();
    typeName("ECS Ouest bis");
    fireEvent.click(screen.getByRole("button", { name: /Plan/ }));
    fireEvent.click(copy());
    fireEvent.click(screen.getByRole("option", { name: "ECS Ouest" }));
    await create();
    await waitFor(() => expect(onStart).toHaveBeenCalledOnce());
    expect(get).toHaveBeenCalledExactlyOnceWith("ouest");
    // Mutant: the stored envelope (id, stamps) handed on is refused by
    // create as extra fields.
    expect(onStart).toHaveBeenCalledWith({
      ...documentOf(STORED),
      name: "ECS Ouest bis",
      projection: "flat",
    });
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("opens a copy with raised runs isometric, and says so", async () => {
    const { onStart } = renderDialog({ get: vi.fn(async () => RAISED) });
    typeName("ECS Ouest bis");
    fireEvent.click(screen.getByRole("button", { name: /Plan/ }));
    fireEvent.click(copy());
    fireEvent.click(screen.getByRole("option", { name: "ECS Ouest" }));
    await create();
    await waitFor(() => expect(onStart).toHaveBeenCalledOnce());
    // Mutant: keeping the plan saves a height on a flat plate, refused as
    // flat_depth.
    expect(onStart.mock.calls[0][0].projection).toBe("isometric");
    expect(toast.info).toHaveBeenCalledExactlyOnceWith(
      "The copied view has raised elements: it will open isometric.",
    );
  });

  it("says nothing of a raised copy when it opens isometric anyway", async () => {
    const { onStart } = renderDialog({ get: vi.fn(async () => RAISED) });
    typeName("ECS Ouest bis");
    fireEvent.click(copy());
    fireEvent.click(screen.getByRole("option", { name: "ECS Ouest" }));
    await create();
    await waitFor(() => expect(onStart).toHaveBeenCalledOnce());
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("holds the dialog while the source loads", async () => {
    let answer: (plate: Synoptic) => void = () => {};
    const get = vi.fn(
      () => new Promise<Synoptic>((resolve) => (answer = resolve)),
    );
    const { onStart } = renderDialog({ get });
    typeName("ECS Ouest bis");
    fireEvent.click(copy());
    fireEvent.click(screen.getByRole("option", { name: "ECS Ouest" }));
    await create();
    // The form is valid: only the load in flight holds the button.
    const loading = await screen.findByRole("button", { name: "Loading…" });
    expect(loading).toHaveProperty("disabled", true);
    answer(STORED);
    await waitFor(() => expect(onStart).toHaveBeenCalledOnce());
  });

  it("says when the source cannot be read, and starts nothing", async () => {
    const get = vi.fn(async () => {
      throw new Error("503");
    });
    const { onStart } = renderDialog({ get });
    typeName("ECS Ouest bis");
    fireEvent.click(copy());
    fireEvent.click(screen.getByRole("option", { name: "ECS Ouest" }));
    await create();
    expect(
      await screen.findByText("The view to copy could not be read."),
    ).toBeInTheDocument();
    expect(onStart).not.toHaveBeenCalled();
    // The author can try again.
    await waitFor(() => expect(submit()).toHaveProperty("disabled", false));
  });

  it("goes back when cancelled or dismissed", () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
