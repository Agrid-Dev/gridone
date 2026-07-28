import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { useForm, type Control, type FieldValues } from "react-hook-form";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.chart.agg.label": "Aggregation",
    "widgets.chart.agg.description": "Bucket width follows the period.",
    "widgets.chart.agg.captions.raw": "every recorded point",
    "widgets.chart.agg.captions.avg": "mean of the bucket",
  }),
);

// Stand in for the picker, exposing a button per attribute so a switch can be
// driven without reaching into its internals.
vi.mock("@/components/forms/resourcePickers/DeviceAttributePicker", () => ({
  DeviceAttributePicker: ({
    onChange,
  }: {
    onChange: (next: { deviceId: string; attribute: string }) => void;
  }) => (
    <div>
      {["temperature", "mode"].map((attr) => (
        <button
          key={attr}
          type="button"
          onClick={() => onChange({ deviceId: "dev1", attribute: attr })}
        >
          pick {attr}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/hooks/useDeviceById", () => ({
  useDeviceById: () => ({
    data: {
      id: "dev1",
      attributes: {
        temperature: { data_type: "float" },
        mode: { data_type: "str" },
      },
    },
  }),
}));

// Mirrors the backend matrix: numbers admit avg/min, strings only mode.
vi.mock("@/hooks/useAggregateOptions", () => ({
  useAggregateOptions: () => ({
    data: {
      operators_by_data_type: { float: ["avg", "min"], str: ["mode"] },
    },
  }),
  operatorsFor: (
    options: { operators_by_data_type: Record<string, string[]> } | undefined,
    dataType: string | undefined,
  ) =>
    !options || !dataType
      ? []
      : (options.operators_by_data_type[dataType] ?? []),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      data-testid="agg"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

// Imported after the mocks are registered.
import { ChartConfigFields } from "./ChartConfigFields";

/** Renders the fields in a real form and exposes the live config values. */
function Harness({
  onValues,
  defaultConfig = {},
}: {
  onValues: (config: Record<string, unknown>) => void;
  defaultConfig?: Record<string, unknown>;
}) {
  const form = useForm({
    defaultValues: {
      config: { device_id: "", attribute: "", agg: null, ...defaultConfig },
    },
  });
  onValues(form.watch("config"));
  return (
    <ChartConfigFields
      control={form.control as unknown as Control<FieldValues>}
    />
  );
}

function renderFields(defaultConfig?: Record<string, unknown>) {
  const values: Record<string, unknown>[] = [];
  render(
    <Harness onValues={(c) => values.push(c)} defaultConfig={defaultConfig} />,
  );
  return () => values[values.length - 1];
}

/** The offered operators, by stored value. Raw is stored as `null`, which the
 *  select keys as the string "null". */
const options = () =>
  Array.from(screen.getByTestId("agg").querySelectorAll("option")).map((o) =>
    o.getAttribute("value"),
  );

afterEach(cleanup);

describe("ChartConfigFields", () => {
  it("offers raw only until an attribute is picked", () => {
    renderFields();
    expect(options()).toEqual(["null"]);
  });

  it("offers the operators the attribute's data type admits", () => {
    renderFields({ device_id: "dev1", attribute: "temperature" });
    expect(options()).toEqual(["null", "avg", "min"]);
  });

  // The operator's own name leads; the gloss sits beside it.
  it("captions each operator without displacing its name", () => {
    renderFields({ device_id: "dev1", attribute: "temperature" });
    const labels = Array.from(
      screen.getByTestId("agg").querySelectorAll("option"),
    ).map((o) => o.textContent);
    expect(labels[0]).toBe("rawevery recorded point");
    expect(labels[1]).toBe("avgmean of the bucket");
  });

  it("offers a different set for a string attribute", () => {
    renderFields({ device_id: "dev1", attribute: "mode" });
    expect(options()).toEqual(["null", "mode"]);
  });

  // Keeping `avg` across a switch to a string attribute would save a pair the
  // API refuses, and the widget would render an error instead of a chart.
  it("clears the operator when the attribute changes", () => {
    const latest = renderFields({
      device_id: "dev1",
      attribute: "temperature",
      agg: "avg",
    });
    expect(latest().agg).toBe("avg");

    fireEvent.click(screen.getByText("pick mode"));

    expect(latest().attribute).toBe("mode");
    expect(latest().agg).toBeNull();
  });

  it("keeps the operator when the same attribute is re-picked", () => {
    const latest = renderFields({
      device_id: "dev1",
      attribute: "temperature",
      agg: "avg",
    });

    fireEvent.click(screen.getByText("pick temperature"));

    expect(latest().agg).toBe("avg");
  });
});
