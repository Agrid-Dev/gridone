import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "zonesByLevel.viewer.breadcrumb.label": "Where you are in the model",
    "zonesByLevel.viewer.breadcrumb.allLevels": "All levels",
    "zonesByLevel.viewer.breadcrumb.plan": "Floor plan",
  }),
);

import { ViewerBreadcrumb } from "./ViewerBreadcrumb";

function renderCrumbs(
  props: Partial<ComponentProps<typeof ViewerBreadcrumb>> = {},
) {
  const onGoTo = vi.fn();
  render(
    <ViewerBreadcrumb
      levelName={null}
      roomName={null}
      planActive={false}
      onGoTo={onGoTo}
      {...props}
    />,
  );
  return { onGoTo };
}

afterEach(cleanup);

describe("ViewerBreadcrumb", () => {
  it("renders nothing at the whole building — there is nothing to leave", () => {
    renderCrumbs();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("names the isolated level, which becomes the current position", () => {
    renderCrumbs({ levelName: "R+2" });
    expect(
      screen.getByRole("button", { name: "All levels" }),
    ).toBeInTheDocument();
    // The deepest crumb is where you are, so it is text, not a way out.
    expect(
      screen.queryByRole("button", { name: "R+2" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("R+2")).toHaveAttribute("aria-current", "location");
  });

  it("stacks level, plan and room as the viewer goes deeper", () => {
    renderCrumbs({
      levelName: "R+2",
      planActive: true,
      roomName: "Chambre 201",
    });
    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["All levels", "R+2", "Floor plan"]);
    expect(screen.getByText("Chambre 201")).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("pops back to the depth of the crumb that was clicked", async () => {
    const { onGoTo } = renderCrumbs({
      levelName: "R+2",
      planActive: true,
      roomName: "Chambre 201",
    });
    await userEvent.click(screen.getByRole("button", { name: "Floor plan" }));
    await userEvent.click(screen.getByRole("button", { name: "R+2" }));
    await userEvent.click(screen.getByRole("button", { name: "All levels" }));
    expect(onGoTo.mock.calls).toEqual([["plan"], ["level"], ["building"]]);
  });

  it("skips the plan crumb while the viewer is in 3D", () => {
    renderCrumbs({ levelName: "R+2", roomName: "Chambre 201" });
    expect(screen.queryByText("Floor plan")).not.toBeInTheDocument();
  });

  it("shows a room picked with no level isolated", () => {
    renderCrumbs({ roomName: "Chambre 201" });
    expect(
      screen.getByRole("button", { name: "All levels" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Chambre 201")).toBeInTheDocument();
  });
});
