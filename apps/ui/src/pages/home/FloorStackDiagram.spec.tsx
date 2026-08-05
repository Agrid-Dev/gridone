import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
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

function row(id: string, name: string): FloorRow {
  return {
    floor: { id, name, type: "floor" } as Asset,
    zoneCount: 0,
    deviceCount: 0,
  };
}

describe("FloorStackDiagram", () => {
  it("draws one layer per floor from top floor to ground floor", () => {
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
});
