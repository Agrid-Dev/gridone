import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CollectorProps } from "@/components/synoptic/symbols/ports";
import { createI18nMock } from "@/test/i18nMock";
import { CollectorEditor } from "./CollectorEditor";

vi.mock("react-i18next", () =>
  createI18nMock({
    "editor.collector.axis": "Direction",
    "editor.collector.horizontal": "Horizontal",
    "editor.collector.vertical": "Vertical",
    "editor.collector.length": "Length",
    "editor.collector.shorter": "Shorten",
    "editor.collector.longer": "Lengthen",
    "editor.collector.ports": "Ports",
    "editor.collector.addAt": "Add a port ({{side}}, cell {{position}})",
    "editor.collector.kinds.in": "inlet",
    "editor.collector.kinds.out": "outlet",
    "editor.collector.side": "Face of port {{port}}",
    "editor.collector.offset": "Cell of port {{port}}",
    "editor.collector.removePort": "Remove",
    "editor.collector.portAttached": "A run is attached",
    "editor.collector.noPorts": "No port yet",
    "editor.sides.up": "Top",
    "editor.sides.down": "Bottom",
    "editor.sides.left": "Left",
    "editor.sides.right": "Right",
    "editor.sides.above": "Above (3D view)",
    "editor.sides.below": "Below (3D view)",
  }),
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** A bar five cells long: an inlet across it at its third cell, one out of
 *  its start, an outlet across the other face at its fourth cell. */
const SHAPE: CollectorProps = {
  axis: "x",
  length: 5,
  ports: {
    in_1: { offset: 2, side: "-y" },
    in_3: { offset: 0, side: "-x" },
    out_1: { offset: 3, side: "+y" },
  },
};

function renderEditor(props: Partial<ComponentProps<typeof CollectorEditor>>) {
  const handlers = { onAxis: vi.fn(), onShape: vi.fn(), onTaken: vi.fn() };
  const view = render(
    <CollectorEditor
      shape={SHAPE}
      attached={new Set()}
      fluids={new Map()}
      flat={false}
      {...handlers}
      {...props}
    />,
  );
  return { ...handlers, ...view };
}

const shorten = () => screen.getByRole("button", { name: "Shorten" });
const lengthen = () => screen.getByRole("button", { name: "Lengthen" });
const row = (port: string) =>
  document.querySelector(`[data-collector-port='${port}']`) as HTMLElement;
/** Every "+" the diagram offers, by what it says. */
const slots = () =>
  [...document.querySelectorAll("[data-collector-slot]")].map((b) =>
    b.getAttribute("aria-label"),
  );

describe("CollectorEditor", () => {
  it("shortens the bar down to the cell of its last port, never past it", () => {
    const { onShape, rerender } = renderEditor({});
    expect(shorten()).toHaveProperty("disabled", false);
    fireEvent.click(shorten());
    expect(onShape).toHaveBeenCalledExactlyOnceWith({ ...SHAPE, length: 4 });
    // out_1 sits on the fourth cell: a bar of four still holds it.
    rerender(
      <CollectorEditor
        shape={{ ...SHAPE, length: 4 }}
        attached={new Set()}
        fluids={new Map()}
        flat={false}
        onAxis={vi.fn()}
        onShape={onShape}
        onTaken={vi.fn()}
      />,
    );
    // Mutant: a floor at the last port's offset lets a bar of three drop
    // out_1, refused at save as a port past the bar's end.
    expect(shorten()).toHaveProperty("disabled", true);
    expect(lengthen()).toHaveProperty("disabled", false);
  });

  it("clamps a typed length to the last port's cell", () => {
    const { onShape } = renderEditor({});
    const length = screen.getByLabelText("Length");
    fireEvent.change(length, { target: { value: "1" } });
    fireEvent.blur(length);
    expect(onShape).toHaveBeenCalledExactlyOnceWith({ ...SHAPE, length: 4 });
  });

  it("keeps a bar without ports two cells long at least", () => {
    const bare: CollectorProps = { axis: "x", length: 3, ports: {} };
    const { onShape, rerender } = renderEditor({ shape: bare });
    expect(screen.getByText("No port yet")).toBeInTheDocument();
    fireEvent.click(shorten());
    expect(onShape).toHaveBeenCalledExactlyOnceWith({ ...bare, length: 2 });
    rerender(
      <CollectorEditor
        shape={{ ...bare, length: 2 }}
        attached={new Set()}
        fluids={new Map()}
        flat={false}
        onAxis={vi.fn()}
        onShape={onShape}
        onTaken={vi.fn()}
      />,
    );
    expect(shorten()).toHaveProperty("disabled", true);
  });

  it("lengthens the bar a cell at a time", () => {
    const { onShape } = renderEditor({});
    fireEvent.click(lengthen());
    expect(onShape).toHaveBeenCalledExactlyOnceWith({ ...SHAPE, length: 6 });
  });

  it("offers a port across the bar at every cell and out of each end, where none stands", () => {
    renderEditor({
      shape: {
        axis: "y",
        length: 3,
        ports: { in_1: { offset: 1, side: "+x" } },
      },
    });
    // Mutant: the faces of the other axis put the "+" across a bar that
    // runs down the sheet, where the plate draws no port.
    expect(slots().sort()).toEqual(
      [
        "Add a port (Left, cell 1)",
        "Add a port (Right, cell 1)",
        "Add a port (Left, cell 2)",
        "Add a port (Left, cell 3)",
        "Add a port (Right, cell 3)",
        "Add a port (Top, cell 1)",
        "Add a port (Bottom, cell 3)",
      ].sort(),
    );
  });

  it("adds an inlet or an outlet under the first free name of its kind", async () => {
    const user = userEvent.setup();
    const { onShape } = renderEditor({});
    await user.click(
      screen.getByRole("button", { name: "Add a port (Top, cell 4)" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "inlet" }));
    // in_1 and in_3 are taken: the new inlet fills the gap.
    expect(onShape).toHaveBeenLastCalledWith({
      ...SHAPE,
      ports: { ...SHAPE.ports, in_2: { offset: 3, side: "-y" } },
    });
    await user.click(
      screen.getByRole("button", { name: "Add a port (Right, cell 5)" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "outlet" }));
    expect(onShape).toHaveBeenLastCalledWith({
      ...SHAPE,
      ports: { ...SHAPE.ports, out_2: { offset: 4, side: "+x" } },
    });
  });

  it("lists the ports along the bar, each at its cell counted from one", () => {
    renderEditor({});
    const rows = [...document.querySelectorAll("[data-collector-port]")];
    expect(rows.map((r) => r.getAttribute("data-collector-port"))).toEqual([
      "in_3",
      "in_1",
      "out_1",
    ]);
    expect(within(row("in_1")).getByText("inlet")).toBeInTheDocument();
    expect(within(row("out_1")).getByText("outlet")).toBeInTheDocument();
    expect(screen.getByLabelText("Cell of port in_1")).toHaveValue(3);
  });

  it("moves a port to the cell typed, within the bar", () => {
    const { onShape } = renderEditor({});
    const cell = screen.getByLabelText("Cell of port in_1");
    fireEvent.change(cell, { target: { value: "1" } });
    fireEvent.blur(cell);
    expect(onShape).toHaveBeenLastCalledWith({
      ...SHAPE,
      ports: { ...SHAPE.ports, in_1: { offset: 0, side: "-y" } },
    });
    fireEvent.change(cell, { target: { value: "9" } });
    fireEvent.blur(cell);
    // The bar is five cells long: the fifth is the furthest a port goes.
    expect(onShape).toHaveBeenLastCalledWith({
      ...SHAPE,
      ports: { ...SHAPE.ports, in_1: { offset: 4, side: "-y" } },
    });
  });

  it("removes a free port, and offers no removal for one a run is attached to", () => {
    const { onShape } = renderEditor({ attached: new Set(["in_1"]) });
    expect(
      within(row("in_1")).queryByRole("button", { name: "Remove in_1" }),
    ).toBeNull();
    expect(within(row("in_1")).getByText("A run is attached")).toBeTruthy();
    fireEvent.click(
      within(row("out_1")).getByRole("button", { name: "Remove out_1" }),
    );
    expect(onShape).toHaveBeenCalledExactlyOnceWith({
      ...SHAPE,
      ports: { in_1: SHAPE.ports.in_1, in_3: SHAPE.ports.in_3 },
    });
  });

  it("offers every face on a plate that opens isometric", async () => {
    const user = userEvent.setup();
    const { onShape } = renderEditor({ flat: false });
    await user.click(
      screen.getByRole("combobox", { name: "Face of port in_1" }),
    );
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Top",
      "Bottom",
      "Left",
      "Right",
      "Above (3D view)",
      "Below (3D view)",
    ]);
    await user.click(screen.getByRole("option", { name: "Left" }));
    expect(onShape).toHaveBeenCalledExactlyOnceWith({
      ...SHAPE,
      ports: { ...SHAPE.ports, in_1: { offset: 2, side: "-x" } },
    });
  });

  it("offers no vertical face on a plate that opens flat", async () => {
    const user = userEvent.setup();
    renderEditor({ flat: true });
    await user.click(
      screen.getByRole("combobox", { name: "Face of port in_1" }),
    );
    // The twin above finds the vertical faces with this query.
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Top",
      "Bottom",
      "Left",
      "Right",
    ]);
  });

  it("still names the vertical face a port already has on a flat plate", async () => {
    const user = userEvent.setup();
    renderEditor({
      flat: true,
      shape: { ...SHAPE, ports: { in_1: { offset: 2, side: "+z" } } },
    });
    const face = screen.getByRole("combobox", { name: "Face of port in_1" });
    expect(face).toHaveTextContent("Above (3D view)");
    await user.click(face);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Top",
      "Bottom",
      "Left",
      "Right",
      "Above (3D view)",
    ]);
  });

  it("turns the bar with its direction", () => {
    const { onAxis } = renderEditor({});
    const direction = screen.getByRole("group", { name: "Direction" });
    expect(
      within(direction).getByRole("button", { name: "Horizontal" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      within(direction).getByRole("button", { name: "Vertical" }),
    );
    expect(onAxis).toHaveBeenCalledExactlyOnceWith("y");
  });
  it("puts no port on the face and cell another port has, and says so", async () => {
    const user = userEvent.setup();
    const shape: CollectorProps = {
      axis: "x",
      length: 5,
      ports: {
        in_1: { offset: 1, side: "-y" },
        in_2: { offset: 1, side: "+y" },
        out_1: { offset: 3, side: "-y" },
      },
    };
    const { onShape, onTaken } = renderEditor({ shape });
    // The face in_2 holds on the second cell is not in_1's to pick.
    await user.click(
      screen.getByRole("combobox", { name: "Face of port in_1" }),
    );
    expect(screen.getByRole("option", { name: "Bottom" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.keyboard("{Escape}");
    // Nor is in_1's cell out_1's, on the same face: refused, and the field
    // shows the cell out_1 still has.
    const cell = screen.getByLabelText("Cell of port out_1");
    fireEvent.change(cell, { target: { value: "2" } });
    fireEvent.blur(cell);
    expect(onTaken).toHaveBeenCalledOnce();
    expect(onShape).not.toHaveBeenCalled();
    expect(cell).toHaveValue(4);
  });

  it("offers no longer bar past the longest the editor draws", () => {
    // 100 cells: the longest bar on the site's plates is 41.
    const { onShape } = renderEditor({});
    const length = screen.getByLabelText("Length");
    fireEvent.change(length, { target: { value: "5000" } });
    fireEvent.blur(length);
    expect(onShape).toHaveBeenCalledExactlyOnceWith({ ...SHAPE, length: 100 });
    cleanup();
    renderEditor({ shape: { ...SHAPE, length: 100 } });
    expect(lengthen()).toHaveProperty("disabled", true);
  });
});
