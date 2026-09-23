import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { CommandSummary } from "./summaries";
import type { WizardFormValues } from "./types";

vi.mock("react-i18next", () =>
  createI18nMock({ "common.true": "Vrai", "common.false": "Faux" }),
);

afterEach(cleanup);

const values = (
  command: Pick<WizardFormValues, "attribute" | "attributeDataType" | "value">,
): WizardFormValues => ({
  targetMode: "devices",
  deviceIds: ["d1"],
  targetFilter: {},
  ...command,
});

describe("CommandSummary", () => {
  it("words a boolean like the switch: declared label, else True / False", () => {
    const { rerender } = render(
      <CommandSummary
        values={values({
          attribute: "onoff_state",
          attributeDataType: "bool",
          value: true,
        })}
        valueLabels={[
          { value: false, label: { default: "Arrêt" } },
          { value: true, label: { default: "Marche" } },
        ]}
      />,
    );
    expect(screen.getByText("Marche")).toBeInTheDocument();

    rerender(
      <CommandSummary
        values={values({
          attribute: "radar_enable",
          attributeDataType: "bool",
          value: false,
        })}
      />,
    );
    // Never the raw wire value.
    expect(screen.getByText("Faux")).toBeInTheDocument();
    expect(screen.queryByText("false")).toBeNull();
  });

  it("keeps formatting other values by data type", () => {
    render(
      <CommandSummary
        values={values({
          attribute: "setpoint",
          attributeDataType: "float",
          value: 21,
        })}
      />,
    );
    expect(screen.getByText("21.00")).toBeInTheDocument();
  });
});
