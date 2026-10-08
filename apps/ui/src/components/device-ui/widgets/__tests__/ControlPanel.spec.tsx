import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui";
import { createI18nMock } from "@/test/i18nMock";
import type { OptionReasonDisplay, PresentationV1 } from "../../document";
import { controlSpecsOf } from "../../presentationControls";
import { resolvePresentation } from "../../resolvePresentation";
import type { BoundControlState, DeviceUiRuntime } from "../../runtime";
import { ControlPanel } from "../ControlPanel";

vi.mock("react-i18next", () => createI18nMock({}));
afterEach(cleanup);

const explanation = "Chauffage indisponible : vérifier la configuration.";

function setup(display?: OptionReasonDisplay) {
  const document: PresentationV1 = {
    schema_version: 1,
    requires: ["controls/1", "option-reason-display/1"],
    assets: {},
    bindings: { mode: { attribute: "mode" } },
    controls: {
      mode: {
        kind: "select",
        binding: "mode",
        label: { default: "Mode" },
        option_reason_display: display,
      },
    },
    page: { kind: "control-panel", controls: ["mode"] },
  };
  expect(resolvePresentation(document)?.status).toBe("available");
  const state: BoundControlState = {
    spec: controlSpecsOf(document).mode,
    attribute: null,
    reported: "fan",
    displayed: "fan",
    writable: true,
    write: { kind: "idle" },
    pending: false,
    constraints: { step: null, minimum: null, maximum: null, unknown: false },
    options: ["fan", "heat", "cool"],
    optionStates: [
      { value: "fan", available: true, reasons: [] },
      {
        value: "heat",
        available: false,
        reasons: [
          {
            code: "heat_unavailable",
            message: {
              default: "Heating unavailable: check the configuration.",
              translations: { fr: explanation },
            },
          },
        ],
      },
      { value: "cool", available: true, reasons: [] },
    ],
    canIncrement: false,
    canDecrement: false,
    canToggle: false,
    canCycle: true,
  };
  const runtime: DeviceUiRuntime = {
    readControl: () => state,
    setValue: vi.fn(),
    activate: vi.fn(),
    reported: () => "fan",
  };
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <ControlPanel controls={["mode"]} runtime={runtime} language="fr" />
    </TooltipProvider>,
  );
  return { user, runtime, options: screen.getAllByRole("radio") };
}

describe("select option reasons", () => {
  it.each([undefined, "inline"] as const)(
    "keeps inline reasons with display=%s",
    (display) => {
      const { options } = setup(display);
      expect(screen.getByText(explanation)).toBeVisible();
      expect(options[1]).toHaveAccessibleDescription(explanation);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    },
  );

  it.each(["hover", "focus"])(
    "shows localized reasons on %s and closes with Escape",
    async (trigger) => {
      const { user, options } = setup("tooltip");
      expect(screen.queryByText(explanation)).not.toBeInTheDocument();
      if (trigger === "hover") await user.hover(options[1]);
      else {
        await user.tab();
        await user.tab();
        expect(options[1]).toHaveFocus();
      }
      expect(await screen.findByRole("tooltip")).toHaveTextContent(explanation);
      expect(options[1]).toHaveAccessibleDescription(explanation);
      expect(
        within(screen.getByRole("radiogroup")).queryByText(explanation),
      ).not.toBeInTheDocument();
      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
      );
    },
  );

  it("keeps unavailable options focusable without allowing commands", async () => {
    const { user, runtime, options } = setup("tooltip");
    expect(options[1]).toHaveAttribute("aria-disabled", "true");
    await user.tab();
    await user.tab();
    expect(options[1]).toHaveFocus();
    await user.keyboard("{Enter} ");
    await user.click(options[1]);
    expect(runtime.setValue).not.toHaveBeenCalled();
    await user.click(options[0]);
    vi.mocked(runtime.setValue).mockClear();
    await user.keyboard("{ArrowRight}");
    expect(options[2]).toHaveFocus();
    expect(runtime.setValue).toHaveBeenCalledExactlyOnceWith("mode", "cool");
  });

  it("does not show a tooltip for an option without reasons", async () => {
    const { user, options } = setup("tooltip");
    await user.tab();
    await user.hover(options[0]);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(options[0]).not.toHaveAttribute("aria-describedby");
  });
});
