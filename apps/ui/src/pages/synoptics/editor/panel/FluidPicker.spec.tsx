import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { FluidPicker } from "./FluidPicker";

vi.mock("react-i18next", () =>
  createI18nMock({
    "editor.fluid": "Fluid",
    "editor.fluidRoles.supply": "Supply",
    "editor.fluidRoles.return": "Return",
    "editor.circuits.primary": "Primary",
    "editor.circuits.heating": "Heating",
    "editor.circuits.dhw": "Domestic hot water",
    "editor.circuits.coldWater": "Cold water",
    "editor.circuits.chilled": "Chilled water",
    "editor.circuits.condenser": "Condenser",
    "fluids.heating_return": "Heating return",
    "fluids.dhw": "DHW",
    "fluids.dhw_loop": "DHW loop",
  }),
);

afterEach(cleanup);

describe("FluidPicker", () => {
  it("lays the fluids out by circuit, a pair by its supply and its return", () => {
    render(<FluidPicker value="heating_return" onChange={vi.fn()} />);
    const group = screen.getByRole("group", { name: "Fluid" });
    expect(group.textContent).toMatch(
      /^Primary.*Supply.*Return.*Heating.*Supply.*Return.*Domestic hot water.*DHW.*DHW loop.*Cold water/,
    );
    // A pair's button says its role; the fluid's own name is its label.
    const heatingReturn = screen.getByRole("button", {
      name: "Heating return",
    });
    expect(heatingReturn).toHaveTextContent("Return");
    expect(screen.getByRole("button", { name: "DHW loop" })).toHaveTextContent(
      "DHW loop",
    );
  });

  it("presses the fluid held, and hands back the one picked", () => {
    const onChange = vi.fn();
    render(<FluidPicker value="heating_return" onChange={onChange} />);
    const pressed = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true")
      .map((b) => b.getAttribute("data-fluid"));
    expect(pressed).toEqual(["heating_return"]);
    fireEvent.click(screen.getByRole("button", { name: "DHW" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("dhw");
  });
});
