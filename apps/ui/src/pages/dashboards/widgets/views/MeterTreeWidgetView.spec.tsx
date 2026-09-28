import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { MeterMedium, MeterTreeNode } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { meterKey, type MeterAttributes } from "./meterTree";

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.meterTree.unmetered": "Unmetered",
    "widgets.meterTree.dailyConsumption": "Consumption per day",
    "widgets.meterTree.breakdown": "Breakdown",
    "widgets.meterTree.openDevice": "Open device",
  }),
);

const useMeterTreeValues = vi.fn();
vi.mock("./useMeterTreeValues", () => ({
  useMeterTreeValues: (...args: unknown[]) => useMeterTreeValues(...args),
}));

const useMeterTreeAttributes = vi.fn();
vi.mock("./useMeterTreeAttributes", () => ({
  useMeterTreeAttributes: (...args: unknown[]) =>
    useMeterTreeAttributes(...args),
}));

// The chart's own rendering is covered where it lives; here only whether the
// dialog asks for it matters.
vi.mock("./useDailyConsumption", () => ({
  useDailyConsumption: () => ({
    points: [],
    unbounded: false,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../../useDashboardPeriod", () => ({
  useDashboardPeriod: () => ({ query: {}, refetchInterval: false }),
}));

// Imported after the mocks are registered.
import { MeterTreeWidgetView } from "./MeterTreeWidgetView";

const meter = (id: string, attribute: string) => ({
  devices: { ids: [id] },
  attribute,
});

const MAIN = meter("main", "active_energy");
const HVAC = meter("hvac", "hvac_energy");
const LIGHTS = meter("lights", "lights_energy");

function renderTree(
  root: MeterTreeNode,
  attributes: MeterAttributes,
  {
    pending = false,
    medium,
  }: { pending?: boolean; medium?: MeterMedium | null } = {},
) {
  useMeterTreeAttributes.mockReturnValue(attributes);
  useMeterTreeValues.mockReturnValue({
    values: new Map([
      [meterKey(MAIN) as string, 100],
      [meterKey(HVAC) as string, 40],
      [meterKey(LIGHTS) as string, 0],
    ]),
    loading: false,
    pending,
  });
  return render(
    <MemoryRouter>
      <MeterTreeWidgetView config={{ type: "meter_tree", root, medium }} />
    </MemoryRouter>,
  );
}

/** Building 100 feeds HVAC 40 and Lights 0, plus the 60 they leave unmetered. */
const board: MeterTreeNode = {
  label: "Building",
  meter: MAIN,
  children: [
    { label: "HVAC", meter: HVAC },
    { label: "Lights", meter: LIGHTS },
  ],
};

/** The tree's resting edges, not the focused path drawn over them. */
const edges = (container: HTMLElement) =>
  [...container.querySelectorAll("path")].filter(
    (path) =>
      path.getAttribute("fill") === "none" &&
      !path.parentElement!.hasAttribute("data-focus-path"),
  );

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("MeterTreeWidgetView", () => {
  it("names an unlabelled node after its attribute's declared label", () => {
    renderTree(
      { label: "Building", meter: MAIN, children: [{ meter: HVAC }] },
      new Map([
        [
          meterKey(HVAC) as string,
          { label: { default: "HVAC", translations: { fr: "CVC" } } },
        ],
      ]),
    );

    expect(screen.getByText("Building")).toBeTruthy();
    expect(screen.getByText("CVC")).toBeTruthy();
  });

  it("falls back to the attribute's name when its driver declares no label", () => {
    renderTree({ meter: HVAC }, new Map());

    expect(screen.getByText("Hvac Energy")).toBeTruthy();
  });

  it("shows each node's figure in its declared unit", () => {
    const { container } = renderTree(
      { label: "Building", meter: MAIN, children: [{ meter: HVAC }] },
      new Map([
        [meterKey(MAIN) as string, { unit: "kWh" }],
        [meterKey(HVAC) as string, { unit: "kWh" }],
      ]),
    );

    // Building, HVAC, and the unmetered residual measured in its parent's unit.
    const units = [...container.querySelectorAll("tspan")].map((el) =>
      el.textContent?.trim(),
    );
    expect(units).toEqual(["kWh", "kWh", "kWh"]);
  });
});

describe("MeterTreeWidgetView node details", () => {
  const tree: MeterTreeNode = {
    label: "Building",
    meter: MAIN,
    children: [{ label: "HVAC", meter: HVAC }],
  };

  it("opens a dialog on the node's name, not a navigation to its device", () => {
    renderTree(tree, new Map());

    fireEvent.click(screen.getByRole("button", { name: "Building" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Consumption per day");
    const link = screen.getByRole("link", { name: "Open device" });
    expect(link.getAttribute("href")).toBe("/devices/main");
  });

  it("shares the node out among its children", () => {
    renderTree(tree, new Map());

    fireEvent.click(screen.getByRole("button", { name: "Building" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Breakdown");
    // HVAC 40 of 100, and the 60 its children leave unmetered.
    expect(dialog.textContent).toContain("40.0%");
    expect(dialog.textContent).toContain("60.0%");
  });

  it("holds the breakdown's place while its children's readings load", () => {
    renderTree(tree, new Map(), { pending: true });

    fireEvent.click(screen.getByRole("button", { name: "Building" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Breakdown");
    expect(dialog.textContent).not.toContain("40.0%");
  });

  it("has no breakdown for a node without children", () => {
    renderTree(tree, new Map());

    fireEvent.click(screen.getByRole("button", { name: "HVAC" }));

    expect(screen.getByRole("dialog").textContent).not.toContain("Breakdown");
  });
});

describe("MeterTreeWidgetView medium", () => {
  it.each([
    ["electricity", "stroke-meter-electricity"],
    ["water", "stroke-meter-water"],
  ] as const)("draws a %s tree's edges in its colour", (medium, cls) => {
    const { container } = renderTree(board, new Map(), { medium });

    const classes = edges(container).map((edge) => edge.getAttribute("class"));
    expect(classes).toEqual([cls, cls, cls]);
  });

  it("keeps today's drawing for a tree without a medium", () => {
    const { container } = renderTree(board, new Map(), { medium: null });

    for (const edge of edges(container)) {
      expect(edge.getAttribute("class")).toBe("stroke-border");
      expect(edge.getAttribute("stroke-dasharray")).toBeNull();
      expect(edge.parentElement!.getAttribute("opacity")).toBeNull();
    }
    expect(container.querySelector("rect[data-accent]")).toBeNull();
    expect(container.querySelector("svg svg")).toBeNull();
    expect(container.querySelector("circle")!.getAttribute("class")).toBeNull();
    expect(container.querySelector("rect")!.getAttribute("class")).toBe(
      "fill-card stroke-border",
    );
  });

  it("does not animate: the tree shows a period, not live values", () => {
    const { container } = renderTree(board, new Map(), { medium: "water" });

    expect(container.querySelector("[class*='animate']")).toBeNull();
  });

  it("draws every level at the same strength", () => {
    const { container } = renderTree(
      {
        label: "Building",
        meter: MAIN,
        children: [
          { label: "Riser", children: [{ label: "HVAC", meter: HVAC }] },
        ],
      },
      new Map(),
      { medium: "electricity" },
    );

    // Riser and the unmetered remainder hang off the root; HVAC one level down.
    const all = edges(container);
    expect(all).toHaveLength(3);
    const groups = new Set(all.map((edge) => edge.parentElement));
    expect(groups.size).toBe(1);
    expect([...groups][0]!.getAttribute("opacity")).toBe("0.6");
    for (const edge of all) expect(edge.getAttribute("opacity")).toBeNull();
  });

  it("dots only the edge into what the children leave unmetered", () => {
    const { container } = renderTree(board, new Map(), { medium: "water" });

    const dotted = edges(container).filter((edge) =>
      edge.hasAttribute("stroke-dasharray"),
    );
    expect(dotted).toHaveLength(1);
    expect(dotted[0]).toBe(edges(container).at(-1));
  });

  it("marks every meter's box, but not the unmetered remainder", () => {
    const { container } = renderTree(board, new Map(), { medium: "water" });

    const accents = container.querySelectorAll("rect[data-accent]");
    // Building, HVAC and Lights, all at one strength.
    expect(accents).toHaveLength(3);
    for (const accent of accents) {
      expect(accent.getAttribute("class")).toBe("fill-meter-water");
      expect(accent.getAttribute("opacity")).toBeNull();
    }
  });

  it("tints the root and marks it with the medium's icon", () => {
    const { container } = renderTree(board, new Map(), {
      medium: "electricity",
    });

    const boxes = [...container.querySelectorAll("rect:not([data-accent])")];
    expect(boxes[0].getAttribute("class")).toBe(
      "fill-meter-electricity/10 stroke-border",
    );
    expect(boxes[1].getAttribute("class")).toBe("fill-card stroke-border");
    expect(container.querySelectorAll("svg svg")).toHaveLength(1);
    expect(container.querySelector("svg svg.lucide-zap")).not.toBeNull();
  });

  it("draws the fold button in the colour of the run it sits on", () => {
    const { container } = renderTree(board, new Map(), { medium: "water" });

    const circle = container.querySelector("circle")!;
    expect(circle.getAttribute("class")).toBe("stroke-meter-water");
    expect(circle.getAttribute("stroke-opacity")).toBeNull();
  });
});

describe("MeterTreeWidgetView focus", () => {
  const node = (container: HTMLElement, key: string) =>
    container.querySelector(`g[data-node="${key}"]`)!;
  const hover = (container: HTMLElement, key: string) =>
    fireEvent.pointerEnter(node(container, key), { pointerType: "mouse" });
  const leaveTree = (container: HTMLElement) =>
    fireEvent.pointerLeave(container.querySelector("svg")!, {
      pointerType: "mouse",
    });
  const ringed = (container: HTMLElement) =>
    [...container.querySelectorAll("rect[data-focus-ring]")].map((ring) =>
      ring.getAttribute("data-focus-ring"),
    );
  const pathEdges = (container: HTMLElement) => [
    ...container.querySelectorAll("g[data-focus-path] > path"),
  ];
  /** Focus as the browser reports it: from the keyboard, or put back by a tap
   *  or a closing dialog. */
  const focusName = (name: HTMLElement, fromKeyboard: boolean) => {
    vi.spyOn(name, "matches").mockImplementation(
      (selector) => selector === ":focus-visible" && fromKeyboard,
    );
    act(() => name.focus());
  };

  it("draws the path to the hovered node stronger, leaving the rest as it was", () => {
    const { container } = renderTree(board, new Map(), { medium: "water" });
    const before = edges(container).map((edge) => edge.outerHTML);
    const boxes = () =>
      [...container.querySelectorAll("g[data-node]")].map((g) => g.outerHTML);
    const boxesBefore = boxes();

    hover(container, "0.0");

    // HVAC is "0.0" under the root "0": both ringed, its edge drawn again on top.
    expect(ringed(container)).toEqual(["0", "0.0"]);
    expect(pathEdges(container)).toHaveLength(1);
    expect(pathEdges(container)[0].getAttribute("class")).toBe(
      "stroke-meter-water",
    );
    expect(
      pathEdges(container)[0].parentElement!.getAttribute("opacity"),
    ).toBeNull();
    // Under the boxes, so the path does not cover their fold buttons.
    expect(
      container
        .querySelector("g[data-focus-path]")!
        .compareDocumentPosition(node(container, "0")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Nothing off the path changes, so hovering does not make the tree blink.
    expect(edges(container).map((edge) => edge.outerHTML)).toEqual(before);
    expect(boxes()).toEqual(boxesBefore);

    leaveTree(container);

    expect(ringed(container)).toEqual([]);
    expect(pathEdges(container)).toHaveLength(0);
  });

  it("keeps the path while the mouse crosses the gap to the next row", () => {
    const { container } = renderTree(board, new Map(), { medium: "water" });

    hover(container, "0.0");
    // Out of the box into the gap: still on the tree's own canvas.
    fireEvent.pointerOut(node(container, "0.0"), {
      pointerType: "mouse",
      relatedTarget: container.querySelector("svg"),
    });
    expect(ringed(container)).toEqual(["0", "0.0"]);

    hover(container, "0.1");
    expect(ringed(container)).toEqual(["0", "0.1"]);
  });

  it("draws the path of a tree without a medium darker than its faint edges", () => {
    const { container } = renderTree(board, new Map(), { medium: null });

    hover(container, "0.1");

    expect(pathEdges(container)[0].getAttribute("class")).toBe(
      "stroke-muted-foreground",
    );
    expect(
      container.querySelector("rect[data-focus-ring]")!.getAttribute("class"),
    ).toBe("stroke-muted-foreground");
  });

  it("does not focus a sibling whose key the hovered one starts with", () => {
    const wide: MeterTreeNode = {
      label: "Building",
      children: Array.from({ length: 11 }, (_, i) => ({
        label: `C${i}`,
        meter: HVAC,
      })),
    };
    const { container } = renderTree(wide, new Map(), { medium: "water" });

    hover(container, "0.10");

    expect(ringed(container)).toEqual(["0", "0.10"]);
  });

  it("ignores a touch, which would leave the path focused", () => {
    const { container } = renderTree(board, new Map(), { medium: "water" });

    fireEvent.pointerEnter(node(container, "0.0"), { pointerType: "touch" });

    expect(ringed(container)).toEqual([]);
  });

  it("traces the path of the node whose name has keyboard focus", () => {
    const { container } = renderTree(board, new Map(), { medium: "water" });
    const name = screen.getByRole("button", { name: "HVAC" });

    focusName(name, true);
    expect(ringed(container)).toEqual(["0", "0.0"]);

    act(() => name.blur());
    expect(ringed(container)).toEqual([]);
  });

  it("ignores focus a tap or a closing dialog puts back on a name", () => {
    const { container } = renderTree(board, new Map(), { medium: "water" });

    focusName(screen.getByRole("button", { name: "HVAC" }), false);

    expect(ringed(container)).toEqual([]);
  });

  it("returns to the keyboard's path when the mouse leaves the tree", () => {
    const { container } = renderTree(board, new Map(), { medium: "water" });
    focusName(screen.getByRole("button", { name: "HVAC" }), true);

    hover(container, "0.1");
    expect(ringed(container)).toEqual(["0", "0.1"]);

    leaveTree(container);
    expect(ringed(container)).toEqual(["0", "0.0"]);
  });
});
