import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AttributeCoverage,
  AttributeCoverageResponse,
} from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

const { mockUseQuery, mockListAttributes } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockListAttributes: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: { listAttributes: mockListAttributes },
  }),
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    "pickers.attribute.placeholder": "Select an attribute",
    "pickers.attribute.search": "Search attributes",
    "pickers.attribute.noMatching": "No matching attributes",
    "pickers.attribute.coverage": "{{count}}/{{total}} devices",
    "pickers.attribute.mixedTypes": "mixed data types",
    "attributes.flow_rate": "Débit",
  }),
);

import { AttributeCoverageSelect } from "./AttributeCoverageSelect";

const response: AttributeCoverageResponse = {
  total_devices: 12,
  attributes: [
    {
      attribute: "temperature_setpoint",
      data_types: ["float"],
      device_count: 8,
      writable_count: 8,
    },
    {
      attribute: "temperature",
      data_types: ["float"],
      device_count: 12,
      writable_count: 0,
    },
    {
      attribute: "mode",
      data_types: ["str", "int"],
      device_count: 5,
      writable_count: 5,
    },
  ],
};

function writable(attribute: string, fr?: string): AttributeCoverage {
  return {
    attribute,
    data_types: ["float"],
    device_count: 5,
    writable_count: 5,
    label: fr ? { default: attribute, translations: { fr } } : undefined,
  };
}

/** Declared out of label order; labels cover a driver translation, a standard
 *  translation and the prettified fallback. */
const labelled: AttributeCoverageResponse = {
  total_devices: 5,
  attributes: [
    writable("supply_air_temperature", "Température air soufflé"),
    writable("setpoint_mode_pump", "Mode consigne pompe"),
    writable("flow_rate"),
    writable("fan_speed"),
    writable("deviation", "Écart consigne"),
  ],
};

const ALPHABETICAL = [
  "Débit",
  "Écart consigne",
  "Fan Speed",
  "Mode consigne pompe",
  "Température air soufflé",
];

/** Each option's label: the first text of its row, before the coverage note. */
function optionLabels() {
  return screen
    .getAllByRole("option")
    .map((option) => option.querySelector("span")?.firstChild?.textContent);
}

afterEach(() => {
  cleanup();
  mockUseQuery.mockReset();
  mockListAttributes.mockReset();
});

describe("AttributeCoverageSelect", () => {
  it("renders the attribute union annotated with device coverage", () => {
    mockUseQuery.mockReturnValue({ data: response, isLoading: false });

    render(
      <AttributeCoverageSelect
        filter={{ ids: ["d1", "d2"] }}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    const setpoint = screen.getByRole("option", {
      name: /Temperature Setpoint/,
    });
    expect(setpoint.textContent).toContain("8/12 devices");
    // Not an intersection: temperature (read-only) is still offered here.
    expect(
      screen.getByRole("option", { name: /^Temperature\s*\(/ }),
    ).toBeInTheDocument();
  });

  it("disables mixed-data-type rows and shows the reason", () => {
    mockUseQuery.mockReturnValue({ data: response, isLoading: false });

    render(
      <AttributeCoverageSelect
        filter={{ ids: ["d1", "d2"] }}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    const mixed = screen.getByRole("option", {
      name: /Mode/,
    });
    expect(mixed).toHaveAttribute("aria-disabled", "true");
    expect(mixed.textContent).toContain("mixed data types");
  });

  it("offers only attributes writable somewhere when writableOnly", () => {
    mockUseQuery.mockReturnValue({ data: response, isLoading: false });

    render(
      <AttributeCoverageSelect
        filter={{ ids: ["d1", "d2"] }}
        onChange={vi.fn()}
        writableOnly
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    expect(
      screen.getByRole("option", { name: /Temperature Setpoint/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /^Temperature\s*\(/ }),
    ).not.toBeInTheDocument();
  });

  it("counts writable devices and uses the declared label and unit", () => {
    mockUseQuery.mockReturnValue({
      data: {
        ...response,
        attributes: [
          {
            ...response.attributes[0],
            writable_count: 3,
            label: { default: "Setpoint", translations: { fr: "Consigne" } },
            unit: "°C",
          },
        ],
      },
      isLoading: false,
    });
    render(
      <AttributeCoverageSelect
        filter={{ ids: ["d1"] }}
        writableOnly
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    expect(
      screen.getByRole("option", { name: /Consigne/ }).textContent,
    ).toContain("3/12 devices · °C");
  });

  it("emits the attribute with its single data type on change", () => {
    mockUseQuery.mockReturnValue({ data: response, isLoading: false });
    const onChange = vi.fn();

    render(
      <AttributeCoverageSelect
        filter={{ ids: ["d1", "d2"] }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(
      screen.getByRole("option", { name: /Temperature Setpoint/ }),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("temperature_setpoint", "float");
  });
  it.each(["Consigne", "TEMPERATURE_SETPOINT"])(
    "finds a localized attribute using %s and selects it with the keyboard",
    async (query) => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      mockUseQuery.mockReturnValue({
        data: {
          ...response,
          attributes: response.attributes.map((row, index) =>
            index === 0
              ? {
                  ...row,
                  label: {
                    default: "Setpoint",
                    translations: { fr: "Consigne" },
                  },
                }
              : row,
          ),
        },
        isLoading: false,
      });
      const { rerender } = render(
        <AttributeCoverageSelect
          filter={{ ids: ["d1"] }}
          onChange={onChange}
        />,
      );
      await user.click(screen.getByRole("combobox"));
      const search = screen.getByRole("combobox", {
        name: "Search attributes",
      });
      expect(search).toHaveFocus();
      await user.type(search, query);
      expect(screen.getAllByRole("option")).toHaveLength(1);
      expect(
        screen.getByRole("option", { name: /Consigne/ }),
      ).toBeInTheDocument();
      await user.keyboard("{ArrowDown}{Enter}");
      expect(onChange).toHaveBeenCalledWith("temperature_setpoint", "float");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      rerender(
        <AttributeCoverageSelect
          filter={{ ids: ["d1"] }}
          value="temperature_setpoint"
          onChange={onChange}
        />,
      );
      expect(screen.getByRole("combobox", { name: "Consigne" })).toHaveFocus();
      await user.click(screen.getByRole("combobox"));
      expect(
        screen.getByRole("combobox", { name: "Search attributes" }),
      ).toHaveValue("");
      expect(screen.getAllByRole("option")).toHaveLength(3);
    },
  );

  it("shows an empty result and lets the user clear the search", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mockUseQuery.mockReturnValue({ data: response, isLoading: false });
    render(
      <AttributeCoverageSelect filter={{ ids: ["d1"] }} onChange={onChange} />,
    );
    await user.click(screen.getByRole("combobox"));
    const search = screen.getByRole("combobox", { name: "Search attributes" });
    await user.type(search, "zzzzzz");
    expect(screen.getByText("No matching attributes")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    await user.clear(search);
    expect(screen.getAllByRole("option")).toHaveLength(3);
    await user.type(search, "mode");
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  // Entries are sorted alphabetically by the label shown in the user's language.
  it("lists attributes alphabetically by their displayed label", async () => {
    mockUseQuery.mockReturnValue({ data: labelled, isLoading: false });
    render(
      <AttributeCoverageSelect filter={{ ids: ["d1"] }} onChange={vi.fn()} />,
    );
    await userEvent.setup().click(screen.getByRole("combobox"));
    expect(optionLabels()).toEqual(ALPHABETICAL);
  });

  // Search matches the label in the user's language or the raw name, and keeps
  // the label order (the full matching rule is covered in textSearch.spec).
  it.each([
    ["debit", ["Débit"]],
    ["SUPPLY_AIR", ["Température air soufflé"]],
    ["e", ALPHABETICAL],
  ])("searching %j shows %j", async (query, expected) => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue({ data: labelled, isLoading: false });
    render(
      <AttributeCoverageSelect filter={{ ids: ["d1"] }} onChange={vi.fn()} />,
    );
    await user.click(screen.getByRole("combobox"));
    await user.type(
      screen.getByRole("combobox", { name: "Search attributes" }),
      query,
    );
    expect(optionLabels()).toEqual(expected);
  });

  it("names the selected attribute before its coverage has loaded", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(
      <AttributeCoverageSelect
        filter={{ ids: ["d1"] }}
        value="flow_rate"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Débit" })).toBeInTheDocument();
  });

  it("names the selected attribute with its standard translation", () => {
    mockUseQuery.mockReturnValue({ data: labelled, isLoading: false });
    render(
      <AttributeCoverageSelect
        filter={{ ids: ["d1"] }}
        value="flow_rate"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Débit" })).toBeInTheDocument();
  });

  it("cannot open while disabled", async () => {
    mockUseQuery.mockReturnValue({ data: response, isLoading: false });
    render(
      <AttributeCoverageSelect
        filter={{ ids: ["d1"] }}
        onChange={vi.fn()}
        disabled
      />,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
