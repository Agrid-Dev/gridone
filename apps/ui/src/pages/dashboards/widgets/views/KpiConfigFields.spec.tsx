import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { useForm, type Control, type FieldValues } from "react-hook-form";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.kpi.temporal.live": "Live",
    "widgets.kpi.temporal.period": "Over the period",
    "widgets.kpi.operator.label": "Aggregation",
    "widgets.kpi.operator.placeholder": "Select…",
    "widgets.kpi.unit.label": "Unit",
    "widgets.kpi.precision.label": "Precision",
    "widgets.kpi.attributeLabel.label": "Label",
    "widgets.kpi.attribute.label": "Attribute {{index}}",
    "widgets.kpi.attribute.add": "Add attribute",
    "widgets.kpi.attribute.remove": "Remove attribute",
    "widgets.chart.agg.captions.avg": "mean of the bucket",
    "widgets.chart.agg.captions.sum": "total of the bucket",
    "widgets.chart.agg.captions.mode": "most frequent value",
    "widgets.chart.agg.unsupported": "not supported",
    "widgets.kpi.singleDeviceRequired":
      "Pick a single device, or a fold operator below to combine several",
  }),
);

vi.mock("@/components/forms/targetPicker", () => ({
  DevicesFilterTabs: ({
    onDeviceIdsChange,
    onTypesFilterChange,
  }: {
    onDeviceIdsChange: (ids: string[]) => void;
    onTypesFilterChange: (types: string[] | undefined) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onDeviceIdsChange(["dev1"])}>
        pick one device
      </button>
      <button type="button" onClick={() => onDeviceIdsChange(["dev1", "dev2"])}>
        pick two devices
      </button>
      <button type="button" onClick={() => onTypesFilterChange(["thermostat"])}>
        pick criteria
      </button>
    </div>
  ),
  AttributeCoverageSelect: ({
    onChange,
  }: {
    onChange: (attribute: string, dataType: string) => void;
  }) => (
    <div>
      {["temperature", "mode"].map((attr) => (
        <button
          key={attr}
          type="button"
          onClick={() =>
            onChange(attr, attr === "temperature" ? "float" : "str")
          }
        >
          pick attribute {attr}
        </button>
      ))}
    </div>
  ),
  useAttributeCoverage: () => ({
    coverage: [
      {
        attribute: "temperature",
        data_types: ["float"],
        device_count: 1,
        writable_count: 0,
      },
      {
        attribute: "mode",
        data_types: ["str"],
        device_count: 1,
        writable_count: 0,
      },
    ],
    totalDevices: 1,
    isLoading: false,
    error: null,
  }),
  useSkippedDeviceCount: () => ({ skipped: 0, totalDevices: 1 }),
}));

vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: () => ({ devices: [], loading: false, error: null }),
}));

// Real Radix Tabs need pointer-event sequencing jsdom does not emulate for a
// plain `fireEvent.click`; a minimal context-backed stand-in keeps the mode
// switch testable the same way the select mock below does for operators.
const TabsCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
}>({ value: "", onValueChange: () => {} });

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <TabsCtx.Provider value={{ value, onValueChange }}>
      {children}
    </TabsCtx.Provider>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TabsTrigger: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => {
    const ctx = React.useContext(TabsCtx);
    return (
      <button type="button" onClick={() => ctx.onValueChange(value)}>
        {children}
      </button>
    );
  },
  TabsContent: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => {
    const ctx = React.useContext(TabsCtx);
    return ctx.value === value ? <div>{children}</div> : null;
  },
}));

const MATRIX = {
  float: { avg: "float", sum: "float", mode: null },
  str: { avg: null, sum: null, mode: "str" },
};

vi.mock("@/hooks/useAggregateOptions", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/useAggregateOptions")
  >("@/hooks/useAggregateOptions");
  return {
    operatorsFor: actual.operatorsFor,
    operatorsForAll: actual.operatorsForAll,
    spaceOperatorsFor: actual.spaceOperatorsFor,
    useResetRefusedOperator: actual.useResetRefusedOperator,
    useAggregateOptions: () => ({
      data: {
        operators_by_data_type: MATRIX,
        space_operators_by_data_type: MATRIX,
      },
    }),
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
      data-testid="operator"
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
import {
  BLANK_ATTRIBUTE,
  KpiConfigFields,
  kpiConfigCheck,
  kpiPreviewSize,
} from "./KpiConfigFields";

function Harness({
  onValues,
  defaultAttributes = [BLANK_ATTRIBUTE],
  defaultDevices = {},
  defaultConfig = {},
}: {
  onValues: (config: Record<string, unknown>) => void;
  defaultAttributes?: Record<string, unknown>[];
  defaultDevices?: Record<string, unknown>;
  defaultConfig?: Record<string, unknown>;
}) {
  const form = useForm({
    defaultValues: {
      config: {
        type: "kpi",
        devices: defaultDevices,
        attributes: defaultAttributes,
        temporal: "live",
        ...defaultConfig,
      },
    },
  });
  onValues(form.watch("config"));
  return (
    <KpiConfigFields
      control={form.control as unknown as Control<FieldValues>}
    />
  );
}

function renderFields(
  defaultAttributes?: Record<string, unknown>[],
  defaultDevices?: Record<string, unknown>,
  defaultConfig?: Record<string, unknown>,
) {
  const values: Record<string, unknown>[] = [];
  render(
    <Harness
      onValues={(c) => values.push(c)}
      defaultAttributes={defaultAttributes}
      defaultDevices={defaultDevices}
      defaultConfig={defaultConfig}
    />,
  );
  return () => values[values.length - 1];
}

function firstAttribute(config: Record<string, unknown>) {
  return (config.attributes as Record<string, unknown>[])[0];
}

const SINGLE_DEVICE = { ids: ["dev1"] };
const TWO_DEVICE_IDS = { ids: ["dev1", "dev2"] };
const CRITERIA_DEVICES = { types: ["thermostat"] };

afterEach(cleanup);

describe("KpiConfigFields", () => {
  it("emits the picked device set", () => {
    const latest = renderFields();

    fireEvent.click(screen.getByText("pick one device"));

    expect((latest().devices as { ids?: string[] }).ids).toEqual(["dev1"]);
  });

  it("emits the picked attribute on a row", () => {
    const latest = renderFields();

    fireEvent.click(screen.getByText("pick attribute temperature"));

    expect(firstAttribute(latest()).attribute).toBe("temperature");
  });

  it("prefills the unit from the attribute-name heuristic", () => {
    const latest = renderFields();

    fireEvent.click(screen.getByText("pick attribute temperature"));

    expect(firstAttribute(latest()).unit).toBe("°");
  });

  it("leaves the unit blank for an attribute the heuristic doesn't recognize", () => {
    const latest = renderFields();

    fireEvent.click(screen.getByText("pick attribute mode"));

    expect(firstAttribute(latest()).unit).toBeNull();
  });

  it("does not overwrite a manually-entered unit when the attribute changes", () => {
    const latest = renderFields([{ ...BLANK_ATTRIBUTE, unit: "custom" }]);

    fireEvent.click(screen.getByText("pick attribute temperature"));

    expect(firstAttribute(latest()).unit).toBe("custom");
  });

  it("replaces a unit it auto-filled when the attribute changes again", () => {
    const latest = renderFields();

    fireEvent.click(screen.getByText("pick attribute temperature"));
    expect(firstAttribute(latest()).unit).toBe("°");

    fireEvent.click(screen.getByText("pick attribute mode"));

    expect(firstAttribute(latest()).unit).toBeNull();
  });

  it("starts in live mode with no operator select shown", () => {
    renderFields();

    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.queryByTestId("operator")).not.toBeInTheDocument();
  });

  it("switches to period mode and shows the operator select", () => {
    const latest = renderFields(
      [{ ...BLANK_ATTRIBUTE, attribute: "temperature" }],
      SINGLE_DEVICE,
    );

    fireEvent.click(screen.getByText("Over the period"));

    expect(latest().temporal).toEqual({});
    expect(screen.getByTestId("operator")).toBeInTheDocument();
  });

  it("remembers the picked operator across a Live/Period round trip", () => {
    const latest = renderFields(
      [{ ...BLANK_ATTRIBUTE, attribute: "temperature" }],
      SINGLE_DEVICE,
    );

    fireEvent.click(screen.getByText("Over the period"));
    fireEvent.change(screen.getByTestId("operator"), {
      target: { value: "avg" },
    });
    expect(latest().temporal).toEqual({ operator: "avg" });

    fireEvent.click(screen.getByText("Live"));
    expect(latest().temporal).toBe("live");

    fireEvent.click(screen.getByText("Over the period"));
    expect(latest().temporal).toEqual({ operator: "avg" });
  });

  it("disables operators the attribute's data type refuses", () => {
    renderFields([{ ...BLANK_ATTRIBUTE, attribute: "mode" }], SINGLE_DEVICE, {
      temporal: {},
    });

    const options = Array.from(
      screen.getByTestId("operator").querySelectorAll("option"),
    );
    const enabled = options.filter((o) => !o.disabled).map((o) => o.value);
    expect(enabled).toEqual(["mode"]);
  });

  it("disables an operator every attribute shares no support for", () => {
    // temperature (float) accepts avg/sum; mode (str) accepts only mode —
    // the intersection across both attributes is empty.
    renderFields(
      [
        { ...BLANK_ATTRIBUTE, attribute: "temperature" },
        { ...BLANK_ATTRIBUTE, attribute: "mode" },
      ],
      SINGLE_DEVICE,
      { temporal: {} },
    );

    const options = Array.from(
      screen.getByTestId("operator").querySelectorAll("option"),
    );
    const enabled = options.filter((o) => !o.disabled).map((o) => o.value);
    expect(enabled).toEqual([]);
  });

  it("keeps an operator enabled when every attribute's data type accepts it", () => {
    renderFields(
      [
        { ...BLANK_ATTRIBUTE, attribute: "temperature" },
        { ...BLANK_ATTRIBUTE, attribute: "temperature" },
      ],
      SINGLE_DEVICE,
      { temporal: {} },
    );

    const options = Array.from(
      screen.getByTestId("operator").querySelectorAll("option"),
    );
    const enabled = options.filter((o) => !o.disabled).map((o) => o.value);
    expect(enabled).toEqual(["avg", "sum"]);
  });

  it("keeps an operator enabled for a valid attribute while another attribute's data type isn't known yet", () => {
    // A freshly-added row has no attribute picked, so its data type is
    // unknown — that must not be treated as a refusal for the whole tile.
    renderFields(
      [
        { ...BLANK_ATTRIBUTE, attribute: "temperature" },
        { ...BLANK_ATTRIBUTE, attribute: "" },
      ],
      SINGLE_DEVICE,
      { temporal: {} },
    );

    const options = Array.from(
      screen.getByTestId("operator").querySelectorAll("option"),
    );
    const enabled = options.filter((o) => !o.disabled).map((o) => o.value);
    expect(enabled).toEqual(["avg", "sum"]);
  });

  it("clears the operator when an attribute's data type refuses it", () => {
    const latest = renderFields(
      [{ ...BLANK_ATTRIBUTE, attribute: "mode" }],
      SINGLE_DEVICE,
      { temporal: { operator: "avg" } },
    );

    expect(
      (latest().temporal as { operator?: string }).operator,
    ).toBeUndefined();
  });

  it("names the constraint when the device set picks more than one device and no operator is chosen", () => {
    renderFields();

    fireEvent.click(screen.getByText("pick two devices"));

    expect(
      screen.getByText(
        "Pick a single device, or a fold operator below to combine several",
      ),
    ).toBeInTheDocument();
  });

  it("shows no constraint warning before anything is picked", () => {
    renderFields();

    expect(
      screen.queryByText(
        "Pick a single device, or a fold operator below to combine several",
      ),
    ).not.toBeInTheDocument();
  });

  it("clears the constraint warning once a fold operator is picked", () => {
    renderFields(
      [{ ...BLANK_ATTRIBUTE, attribute: "temperature", space_agg: "avg" }],
      TWO_DEVICE_IDS,
    );

    expect(
      screen.queryByText(
        "Pick a single device, or a fold operator below to combine several",
      ),
    ).not.toBeInTheDocument();
  });

  it("hides the space select for a single explicit device id", () => {
    renderFields(
      [{ ...BLANK_ATTRIBUTE, attribute: "temperature" }],
      SINGLE_DEVICE,
    );

    expect(screen.queryByTestId("operator")).not.toBeInTheDocument();
  });

  it("shows the space select once the device set can match more than one device", () => {
    renderFields(
      [{ ...BLANK_ATTRIBUTE, attribute: "temperature" }],
      CRITERIA_DEVICES,
    );

    const select = screen.getByTestId("operator");
    const enabled = Array.from(select.querySelectorAll("option"))
      .filter((o) => !o.disabled)
      .map((o) => o.value);
    expect(enabled).toEqual(["avg", "sum"]);
  });

  it("emits the picked space operator on the attribute", () => {
    const latest = renderFields(
      [{ ...BLANK_ATTRIBUTE, attribute: "temperature" }],
      CRITERIA_DEVICES,
    );

    fireEvent.change(screen.getByTestId("operator"), {
      target: { value: "sum" },
    });

    expect(firstAttribute(latest()).space_agg).toBe("sum");
  });

  it("clears space_agg once the device set narrows to a single device", () => {
    const latest = renderFields(
      [
        {
          ...BLANK_ATTRIBUTE,
          attribute: "temperature",
          space_agg: "avg",
        },
      ],
      CRITERIA_DEVICES,
    );

    fireEvent.click(screen.getByText("pick one device"));

    expect(firstAttribute(latest()).space_agg).toBeNull();
  });

  // Space folds what the period operator yields, so there's nothing to
  // offer until one is picked — showing a populated-but-fully-disabled
  // select there would look broken rather than merely premature.
  it("hides the space select in period mode until a time operator is chosen", () => {
    renderFields(
      [{ ...BLANK_ATTRIBUTE, attribute: "temperature" }],
      CRITERIA_DEVICES,
      { temporal: {} },
    );

    expect(screen.getAllByTestId("operator")).toHaveLength(1);
  });

  it("shows the space select in period mode once a time operator is chosen", () => {
    renderFields(
      [{ ...BLANK_ATTRIBUTE, attribute: "temperature" }],
      CRITERIA_DEVICES,
      { temporal: { operator: "avg" } },
    );

    expect(screen.getAllByTestId("operator")).toHaveLength(2);
  });

  it("starts with one blank attribute when the array is empty", () => {
    const latest = renderFields([]);

    expect((latest().attributes as unknown[]).length).toBe(1);
  });

  it("adds another blank attribute row on Add attribute", () => {
    const latest = renderFields();

    fireEvent.click(screen.getByText("Add attribute"));

    const attributes = latest().attributes as { attribute: string }[];
    expect(attributes).toHaveLength(2);
    expect(attributes[1].attribute).toBe("");
  });

  it("shows one device picker shared by every row", () => {
    renderFields([
      { ...BLANK_ATTRIBUTE, attribute: "temperature" },
      { ...BLANK_ATTRIBUTE, attribute: "mode" },
    ]);

    expect(screen.getAllByText("pick two devices")).toHaveLength(1);
    // Both rows offer their own attribute pick, against the same shared set.
    expect(screen.getAllByText("pick attribute temperature")).toHaveLength(2);
  });

  it("removes an attribute row, keeping each row's own attribute", () => {
    const latest = renderFields([
      { ...BLANK_ATTRIBUTE, attribute: "temperature" },
      { ...BLANK_ATTRIBUTE, attribute: "mode" },
    ]);

    fireEvent.click(screen.getAllByLabelText("Remove attribute")[0]);

    const attributes = latest().attributes as { attribute: string }[];
    expect(attributes).toHaveLength(1);
    expect(attributes[0].attribute).toBe("mode");
  });

  it("disables removal of the last remaining attribute", () => {
    renderFields();

    expect(screen.getByLabelText("Remove attribute")).toBeDisabled();
  });
});

describe("kpiConfigCheck", () => {
  it("accepts a single explicit device id", () => {
    const result = kpiConfigCheck.safeParse({
      devices: SINGLE_DEVICE,
      attributes: [{}],
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than one device id with no fold operator", () => {
    const result = kpiConfigCheck.safeParse({
      devices: TWO_DEVICE_IDS,
      attributes: [{}],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a type-filter device set with no fold operator", () => {
    const result = kpiConfigCheck.safeParse({
      devices: CRITERIA_DEVICES,
      attributes: [{}],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a type-filter device set with a fold operator on every attribute", () => {
    const result = kpiConfigCheck.safeParse({
      devices: CRITERIA_DEVICES,
      attributes: [{ space_agg: "avg" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts several device ids with a fold operator on every attribute", () => {
    const result = kpiConfigCheck.safeParse({
      devices: TWO_DEVICE_IDS,
      attributes: [{ space_agg: "sum" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects when only some attributes have a fold operator", () => {
    const result = kpiConfigCheck.safeParse({
      devices: CRITERIA_DEVICES,
      attributes: [{ space_agg: "avg" }, {}],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty device set", () => {
    const result = kpiConfigCheck.safeParse({
      devices: {},
      attributes: [{}],
    });
    expect(result.success).toBe(false);
  });
});

describe("kpiPreviewSize", () => {
  const base = { w: 2, h: 1 };

  it("grows height to the attribute count", () => {
    const config = { attributes: [1, 2, 3] };

    expect(kpiPreviewSize(config, base)).toEqual({ w: 2, h: 3 });
  });

  it("keeps the base size for a single attribute", () => {
    const config = { attributes: [1] };

    expect(kpiPreviewSize(config, base)).toEqual({ w: 2, h: 1 });
  });

  it("keeps the base size when there is no config yet", () => {
    expect(kpiPreviewSize(undefined, base)).toEqual(base);
  });
});
