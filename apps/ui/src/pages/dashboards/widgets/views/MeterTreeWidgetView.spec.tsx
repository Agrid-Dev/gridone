import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { MeterTreeNode } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { meterKey, type MeterAttributes } from "./meterTree";

vi.mock("react-i18next", () =>
  createI18nMock({ "widgets.meterTree.unmetered": "Unmetered" }),
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
