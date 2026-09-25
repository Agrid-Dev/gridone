import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { MeterTreeNode } from "@gridone/sdk";
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

function renderTree(root: MeterTreeNode, attributes: MeterAttributes) {
  useMeterTreeAttributes.mockReturnValue(attributes);
  useMeterTreeValues.mockReturnValue({
    values: new Map([
      [meterKey(MAIN) as string, 100],
      [meterKey(HVAC) as string, 40],
    ]),
    loading: false,
  });
  return render(
    <MemoryRouter>
      <MeterTreeWidgetView config={{ type: "meter_tree", root }} />
    </MemoryRouter>,
  );
}

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

  it("has no breakdown for a node without children", () => {
    renderTree(tree, new Map());

    fireEvent.click(screen.getByRole("button", { name: "HVAC" }));

    expect(screen.getByRole("dialog").textContent).not.toContain("Breakdown");
  });
});
