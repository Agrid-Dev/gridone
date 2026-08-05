import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Asset } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import type { FloorRow } from "./rollup";

vi.mock("react-i18next", () =>
  createI18nMock({
    "zonesByLevel.diagramLabel": "Building floor diagram",
    "zonesByLevel.diagramLegend": "Building floors",
  }),
);

import { FloorStackDiagram } from "./FloorStackDiagram";

afterEach(cleanup);

function row(id: string, name: string): FloorRow {
  return {
    floor: { id, name, type: "floor" } as Asset,
    zoneCount: 0,
    deviceCount: 0,
  };
}

describe("FloorStackDiagram", () => {
  it("draws and spreads floors from top floor to ground floor", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <FloorStackDiagram
          rows={[
            row("ground", "Ground floor"),
            row("first", "Floor 1"),
            row("second", "Floor 2"),
          ]}
        />
      </MemoryRouter>,
    );

    const diagram = screen.getByRole("img", {
      name: "Building floor diagram",
    });
    const layers = Array.from(diagram.querySelectorAll("[data-floor-id]"));
    expect(layers.map((layer) => layer.getAttribute("data-floor-id"))).toEqual([
      "second",
      "first",
      "ground",
    ]);
    expect(
      new Set(layers.map((layer) => layer.getAttribute("fill"))).size,
    ).toBe(3);
    await user.hover(diagram);
    expect(layers.map((layer) => layer.getAttribute("style"))).toEqual([
      "transform: translateY(-8px);",
      "transform: translateY(0px);",
      "transform: translateY(8px);",
    ]);

    const legend = screen.getByRole("list", { name: "Building floors" });
    const links = within(legend).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Floor 2 (0)",
      "Floor 1 (0)",
      "Ground floor (0)",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/assets/second",
      "/assets/first",
      "/assets/ground",
    ]);
    expect(
      new Set(
        Array.from(legend.querySelectorAll("[data-floor-marker]"), (marker) =>
          marker.getAttribute("style"),
        ),
      ).size,
    ).toBe(3);
  });

  it("highlights a layer and its legend entry together, from either side", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <FloorStackDiagram
          rows={[row("ground", "Ground floor"), row("first", "Floor 1")]}
        />
      </MemoryRouter>,
    );

    const layer = document.querySelector('[data-floor-id="first"]')!;
    const legendEntry = screen.getByRole("link", { name: "Floor 1 (0)" });
    const otherLayer = document.querySelector('[data-floor-id="ground"]')!;

    expect(layer).not.toHaveAttribute("data-active");
    expect(legendEntry).not.toHaveAttribute("data-active");

    await user.hover(layer);
    expect(layer).toHaveAttribute("data-active", "true");
    expect(legendEntry).toHaveAttribute("data-active", "true");
    expect(otherLayer).not.toHaveAttribute("data-active");

    await user.hover(legendEntry);
    expect(layer).toHaveAttribute("data-active", "true");
    expect(legendEntry).toHaveAttribute("data-active", "true");

    await user.unhover(legendEntry);
    expect(layer).not.toHaveAttribute("data-active");
    expect(legendEntry).not.toHaveAttribute("data-active");
  });

  it("opens the matching floor when a layer is clicked", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <FloorStackDiagram
                rows={[row("ground", "Ground floor"), row("first", "Floor 1")]}
              />
            }
          />
          <Route path="/assets/:id" element={<p>Floor details</p>} />
        </Routes>
      </MemoryRouter>,
    );

    const firstFloor = document.querySelector('[data-floor-id="first"]');
    expect(firstFloor).not.toBeNull();
    await user.click(firstFloor!);

    expect(screen.getByText("Floor details")).toBeInTheDocument();
  });
});
