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
    "widgets.chart.agg.captions.min": "lowest value",
    "widgets.chart.agg.captions.mode": "most frequent value",
    "widgets.chart.agg.unsupported": "not supported",
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

// Mirrors the backend matrix: every operator against every type, mapped to
// what it yields, or null where the pair is refused.
const MATRIX = {
  float: { avg: "float", min: "float", mode: "float" },
  str: { avg: null, min: null, mode: "str" },
};

vi.mock("@/hooks/useAggregateOptions", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/useAggregateOptions")
  >("@/hooks/useAggregateOptions");
  return {
    // The real projection — this spec is about how the editor renders it.
    operatorsFor: actual.operatorsFor,
    useAggregateOptions: () => ({ data: { operators_by_data_type: MATRIX } }),
  };
});

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
    disabled,
  }: {
    value: string;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <option value={value} disabled={disabled}>
      {children}
    </option>
  ),
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

const items = () =>
  Array.from(screen.getByTestId("agg").querySelectorAll("option"));

/** The offered operators, by stored value. Raw is stored as `null`, which the
 *  select keys as the string "null". */
const options = () => items().map((o) => o.getAttribute("value"));

/** The operators a user can actually choose right now. */
const enabled = () =>
  items()
    .filter((o) => !o.disabled)
    .map((o) => o.getAttribute("value"));

afterEach(cleanup);

describe("ChartConfigFields", () => {
  // A list that silently shortens leaves you unable to tell an operator that
  // doesn't apply to this attribute from one that doesn't exist.
  it.each([
    ["a numeric attribute", "temperature"],
    ["a string attribute", "mode"],
  ])("lists every operator for %s", (_case, attribute) => {
    renderFields({ device_id: "dev1", attribute });
    expect(options()).toEqual(["null", "avg", "min", "mode"]);
  });

  it("disables the operators the data type refuses", () => {
    renderFields({ device_id: "dev1", attribute: "mode" });
    expect(enabled()).toEqual(["null", "mode"]);
  });

  it("enables the operators the data type admits", () => {
    renderFields({ device_id: "dev1", attribute: "temperature" });
    expect(enabled()).toEqual(["null", "avg", "min", "mode"]);
  });

  // Nothing can be aggregated until there is an attribute to aggregate.
  it("leaves raw the only choice until an attribute is picked", () => {
    renderFields();
    expect(options()).toEqual(["null", "avg", "min", "mode"]);
    expect(enabled()).toEqual(["null"]);
  });

  // The operator's own name leads; the gloss and the result type sit beside it.
  it("shows each operator's caption and what it would yield", () => {
    renderFields({ device_id: "dev1", attribute: "temperature" });
    const labels = items().map((o) => o.textContent);
    expect(labels[0]).toBe("rawevery recorded point");
    expect(labels[1]).toBe("avgmean of the bucketfloat");
  });

  it("marks a refused operator as unsupported rather than showing a type", () => {
    renderFields({ device_id: "dev1", attribute: "mode" });
    const labels = items().map((o) => o.textContent);
    expect(labels[1]).toBe("avgmean of the bucketnot supported");
    expect(labels[3]).toBe("modemost frequent valuestr");
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
