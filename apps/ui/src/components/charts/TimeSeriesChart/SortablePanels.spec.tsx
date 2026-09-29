import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

/** dnd-kit kept real, but with the sortable transform under our control:
 *  at rest it is null, so only a mid-drag value shows how it is applied. */
const sortable = vi.hoisted(() => ({
  transform: null as {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
  } | null,
}));
vi.mock("@dnd-kit/sortable", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/sortable")>();
  return {
    ...actual,
    useSortable: (args: Parameters<typeof actual.useSortable>[0]) => ({
      ...actual.useSortable(args),
      transform: sortable.transform,
    }),
  };
});

import { SortablePanels } from "./SortablePanels";
import type { PanelEntry } from "./types";

const float = (
  key: string,
  unit: string | null,
  label: string,
): PanelEntry => ({
  type: "float",
  key,
  unit,
  series: [{ key: label.toLowerCase(), label }],
  values: {},
  stepKeys: [],
  height: 100,
  colorOffset: 0,
});

const band = (key: string, label: string): PanelEntry => ({
  type: "boolean",
  key,
  series: { key, label },
  values: [],
  height: 60,
});

function renderPanels(
  props: Partial<ComponentProps<typeof SortablePanels>> = {},
) {
  return render(
    <SortablePanels
      panels={[
        float("float:°", "°", "Temperature"),
        band("heater_on", "Heater"),
      ]}
      onReorder={() => {}}
      onDraggingChange={() => {}}
      handleLabel={(label) => `Move ${label}`}
      {...props}
    >
      {(panel) => <div data-testid={panel.key}>{panel.key}</div>}
    </SortablePanels>,
  );
}

afterEach(() => {
  cleanup();
  sortable.transform = null;
});

describe("SortablePanels", () => {
  // Mid-drag dnd-kit hands out a scale computed from the slot entered — a
  // 60px band over a 100px panel's slot would be stretched to it. Only the
  // translation is applied.
  it("moves a panel by translation only, never scaling it to the slot it enters", () => {
    sortable.transform = { x: 0, y: 40, scaleX: 1, scaleY: 0.3 };
    renderPanels();

    const wrapper = screen.getByTestId("heater_on").parentElement!;
    expect(wrapper.style.transform).toBe("translate3d(0px, 40px, 0)");
    expect(wrapper.style.transform).not.toMatch(/scale/);
  });

  it("names each handle after its panel", () => {
    renderPanels();
    expect(
      screen
        .getAllByRole("button")
        .map((handle) => handle.getAttribute("aria-label")),
    ).toEqual(["Move Temperature", "Move Heater"]);
  });

  it("tells a screen reader how to operate a handle in the caller's words", () => {
    renderPanels({
      wording: {
        instructions: "Espace pour saisir, flèches pour déplacer.",
        pickedUp: (panel) => `${panel} saisi`,
        movedOver: (panel, over) => `${panel} sur ${over}`,
        dropped: (panel) => `${panel} déposé`,
        cancelled: (panel) => `${panel} annulé`,
      },
    });
    expect(
      screen.getByText("Espace pour saisir, flèches pour déplacer."),
    ).toBeInTheDocument();
  });
});
