import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SynopticSummary } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { LinkTargetList } from "./LinkTargetList";

vi.mock("react-i18next", () =>
  createI18nMock({
    "editor.link.target": "Target view",
    "editor.link.search": "Search a view",
    "editor.link.none": "No view",
  }),
);

afterEach(cleanup);

const VIEWS = [
  { id: "ouest", name: "ECS Ouest", description: "Hot water, west" },
  { id: "chaud", name: "Production chaud", description: null },
] as unknown as SynopticSummary[];

/** Whether the row's check mark shows. */
const checked = (row: HTMLElement) =>
  row.querySelector("svg")!.classList.contains("opacity-100");

describe("LinkTargetList", () => {
  it("offers no view first, checked while the link leads nowhere", () => {
    render(
      <LinkTargetList value={null} synoptics={VIEWS} onChange={vi.fn()} />,
    );
    const rows = screen.getAllByRole("option");
    expect(rows.map((r) => r.textContent)).toEqual([
      "No view",
      "ECS Ouest",
      "Production chaud",
    ]);
    expect(rows.map(checked)).toEqual([true, false, false]);
  });

  it("offers no 'no view' where a view is required", () => {
    render(
      <LinkTargetList
        value={null}
        synoptics={VIEWS}
        onChange={vi.fn()}
        allowNone={false}
      />,
    );
    // The twin above finds the row with this query.
    expect(screen.queryByRole("option", { name: "No view" })).toBeNull();
  });

  it("checks the view the link leads to, and hands back the one picked", () => {
    const onChange = vi.fn();
    render(
      <LinkTargetList value="ouest" synoptics={VIEWS} onChange={onChange} />,
    );
    const rows = screen.getAllByRole("option");
    expect(rows.map(checked)).toEqual([false, true, false]);
    fireEvent.click(screen.getByRole("option", { name: "Production chaud" }));
    expect(onChange).toHaveBeenLastCalledWith("chaud");
    fireEvent.click(screen.getByRole("option", { name: "No view" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("finds a view by its description", () => {
    render(
      <LinkTargetList value={null} synoptics={VIEWS} onChange={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Search a view"), {
      target: { value: "west" },
    });
    expect(
      screen
        .getAllByRole("option")
        .map((o) => o.getAttribute("data-link-option")),
    ).toEqual(["ouest"]);
  });
});
