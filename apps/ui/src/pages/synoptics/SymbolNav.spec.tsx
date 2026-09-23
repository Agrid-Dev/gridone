import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SymbolElement } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { SymbolNav, type NavEntry } from "./SymbolNav";

vi.mock("react-i18next", () =>
  createI18nMock({
    "nav.title": "Équipements",
    "nav.search": "Rechercher un équipement",
    "nav.empty": "Aucun équipement ne correspond.",
  }),
);

afterEach(cleanup);

const symbol = (id: string, type: string): SymbolElement => ({
  id,
  type,
  placement: { kind: "cell", cell: { x: 0, y: 0 } },
  label: id,
});

const entry = (
  id: string,
  name: string,
  type: string,
  rest: Partial<NavEntry> = {},
): NavEntry => ({
  symbol: symbol(id, type.replace(/ /g, "_")),
  name,
  type,
  fault: null,
  device: false,
  ...rest,
});

const ENTRIES: NavEntry[] = [
  entry("pac", "PAC 03", "heat pump", { state: "on", device: true }),
  entry("heater", "RÉCHAUFFEUR", "loop heater", {
    state: "on",
    fault: "alert",
    device: true,
  }),
  entry("b01", "B01", "tank"),
  entry("v03", "V-03", "valve isolation", { state: "off" }),
];

function renderNav(props: Partial<Parameters<typeof SymbolNav>[0]> = {}) {
  const onHover = vi.fn();
  const onSelect = vi.fn();
  render(
    <SymbolNav
      entries={ENTRIES}
      highlightId={null}
      onHover={onHover}
      onSelect={onSelect}
      {...props}
    />,
  );
  return { onHover, onSelect };
}

const rows = () =>
  [...document.querySelectorAll("[data-nav-symbol]")].map((row) =>
    row.getAttribute("data-nav-symbol"),
  );
const row = (id: string) =>
  document.querySelector<HTMLButtonElement>(`[data-nav-symbol='${id}']`)!;
const search = () => screen.getByLabelText("Rechercher un équipement");

describe("SymbolNav", () => {
  it("lists every entry as given, with its name and type", () => {
    renderNav();
    expect(
      screen.getByRole("navigation", { name: "Équipements" }),
    ).toBeTruthy();
    expect(rows()).toEqual(["pac", "heater", "b01", "v03"]);
    expect(row("pac").textContent).toBe("PAC 03heat pump");
    expect(screen.queryByText("Aucun équipement ne correspond.")).toBeNull();
  });

  it.each([
    // Accents and case are folded on both sides: a keyboard without them
    // still finds RÉCHAUFFEUR.
    ["rechauffeur", ["heater"]],
    ["Réch", ["heater"]],
    // The type is searchable too, so "tank" finds B01.
    ["tank", ["b01"]],
    // Surrounding blanks are not part of the search.
    ["  pac  ", ["pac"]],
    // "on" is in "isolation" only, not a state.
    ["ion", ["v03"]],
  ])(
    "filters the list by name or type, folding accents and case: %j",
    (query, shown) => {
      renderNav();
      fireEvent.change(search(), { target: { value: query } });
      expect(rows()).toEqual(shown);
    },
  );

  it("says so when nothing matches, and lists everything again once the search is cleared", () => {
    renderNav();
    fireEvent.change(search(), { target: { value: "zzz" } });
    expect(rows()).toEqual([]);
    expect(screen.getByText("Aucun équipement ne correspond.")).toBeTruthy();
    fireEvent.change(search(), { target: { value: "" } });
    expect(rows()).toEqual(["pac", "heater", "b01", "v03"]);
    expect(screen.queryByText("Aucun équipement ne correspond.")).toBeNull();
  });

  it("lights each row by its fault first, then its run state, else unknown", () => {
    renderNav();
    const dot = (id: string) =>
      row(id).querySelector("[data-state]")!.getAttribute("data-state");
    expect(dot("pac")).toBe("on");
    // A faulty machine reads as a fault even while it runs.
    expect(dot("heater")).toBe("fault");
    expect(dot("b01")).toBe("unknown");
    expect(dot("v03")).toBe("off");
  });

  it("reports the row under the pointer or the focus, and null once it leaves", () => {
    const { onHover } = renderNav();
    fireEvent.mouseEnter(row("pac"));
    expect(onHover).toHaveBeenLastCalledWith("pac");
    fireEvent.mouseLeave(row("pac"));
    expect(onHover).toHaveBeenLastCalledWith(null);
    fireEvent.focus(row("b01"));
    expect(onHover).toHaveBeenLastCalledWith("b01");
    fireEvent.blur(row("b01"));
    expect(onHover).toHaveBeenLastCalledWith(null);
    expect(onHover).toHaveBeenCalledTimes(4);
  });

  it("hands the whole entry to the selection, so the caller knows whether it is a device", () => {
    const { onSelect } = renderNav();
    fireEvent.click(row("heater"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toBe(ENTRIES[1]);
  });

  it("marks the highlighted row alone, following the plate's own hover", () => {
    renderNav({ highlightId: "b01" });
    const highlighted = [
      ...document.querySelectorAll("[data-highlighted]"),
    ].map((el) => el.getAttribute("data-nav-symbol"));
    expect(highlighted).toEqual(["b01"]);
    // The bare token, not the hover/focus variants every row carries.
    expect(row("b01").classList.contains("bg-muted")).toBe(true);
    expect(row("pac").classList.contains("bg-muted")).toBe(false);
  });
});
