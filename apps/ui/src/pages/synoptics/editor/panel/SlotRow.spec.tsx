import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AttributeSlot, Device, SlotValue } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { SlotRow } from "./SlotRow";

vi.mock("react-i18next", () =>
  createI18nMock({
    "editor.slot.none": "No reading",
    "editor.slot.text": "Fixed text",
    "editor.slot.other": "Another device…",
    "editor.slot.textLabel": "Text shown for {{slot}}",
    "editor.slot.format": "Unit and format",
    "editor.slot.unit": "Unit",
    "editor.slot.decimals": "Decimals",
    "editor.slot.label.true": "Reads when true",
    "editor.slot.label.false": "Reads when false",
    "common:common.currentValue": "Current value",
    "common.true": "True",
    "common.false": "False",
  }),
);
// The full picker has its own spec and its own queries; the row only hands
// it a target and takes one back.
vi.mock("@/components/forms/targetPicker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/forms/targetPicker")>()),
  AttributeTargetPicker: ({
    value,
    onChange,
  }: {
    value: unknown;
    onChange: (target: unknown) => void;
  }) => (
    <div data-testid="target-picker" data-value={JSON.stringify(value)}>
      <button
        type="button"
        onClick={() =>
          onChange({ devices: { ids: ["sensor"] }, attribute: "flow" })
        }
      >
        pick in the picker
      </button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DEVICE = {
  id: "pac",
  name: "PAC 01",
  type: "heat_pump",
  attributes: {
    temperature: {
      name: "temperature",
      data_type: "float",
      current_value: 52.4,
      unit: "°C",
    },
    power: { name: "power", data_type: "int", current_value: 12, unit: "kW" },
    onoff_state: {
      name: "onoff_state",
      data_type: "bool",
      current_value: true,
    },
    mode: { name: "mode", data_type: "str", current_value: "eco" },
    connection_status: {
      name: "connection_status",
      data_type: "str",
      current_value: "connected",
    },
  },
} as unknown as Device;
const SENSOR = {
  id: "sensor",
  name: "Sensor",
  type: "sensor",
  attributes: {},
} as unknown as Device;

/** A reading of the symbol's own device, as the row writes one. */
const own = (
  attribute: string,
  extra: Partial<AttributeSlot> = {},
): SlotValue => ({
  kind: "attribute",
  target: { devices: { ids: [DEVICE.id] }, attribute },
  ...extra,
});

function renderRow(props: Partial<ComponentProps<typeof SlotRow>> = {}) {
  const handlers = {
    onChange: vi.fn(),
    onType: vi.fn(),
    onSettle: vi.fn(),
  };
  render(
    <SlotRow
      label="State"
      value={undefined}
      device={DEVICE}
      devices={[DEVICE, SENSOR]}
      errors={[]}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

const source = () => screen.getByRole("combobox", { name: "State" });
async function choose(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(source());
  await user.click(screen.getByRole("option", { name }));
}
const openFormat = () =>
  fireEvent.click(screen.getByRole("button", { name: "Unit and format" }));

describe("SlotRow", () => {
  it("offers its device's readings by name, the connection status aside", async () => {
    const user = userEvent.setup();
    renderRow();
    await user.click(source());
    // Mutant: without the filter, the connection status (which the plate
    // reads by its own badge) is offered as a reading.
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "No reading",
      "Mode",
      "Onoff State",
      "Power",
      "Temperature",
      "Fixed text",
      "Another device…",
    ]);
  });

  it("binds a reading of its own device by id, keeping the format that fits it", async () => {
    const user = userEvent.setup();
    const { onChange } = renderRow({
      value: own("temperature", {
        unit: "°F",
        decimals: 1,
        labels: { true: "ON" },
      }),
    });
    await choose(user, "Power");
    expect(onChange).toHaveBeenLastCalledWith({
      kind: "attribute",
      target: { devices: { ids: ["pac"] }, attribute: "power" },
      unit: "°F",
      decimals: 1,
      labels: null,
    });
    // Mutant: decimals carried onto a bool are refused at save, and a unit
    // after a state is noise the panel offers no field to take off.
    await choose(user, "Onoff State");
    expect(onChange).toHaveBeenLastCalledWith({
      kind: "attribute",
      target: { devices: { ids: ["pac"] }, attribute: "onoff_state" },
      unit: null,
      decimals: null,
      labels: { true: "ON" },
    });
  });

  it("switches to a literal, to nothing, or to another device's reading", async () => {
    const user = userEvent.setup();
    const { onChange } = renderRow({ value: own("power") });
    await choose(user, "Fixed text");
    expect(onChange).toHaveBeenLastCalledWith({ kind: "text", text: "" });
    await choose(user, "No reading");
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    await choose(user, "Another device…");
    expect(onChange).toHaveBeenLastCalledWith({
      kind: "attribute",
      target: { devices: {}, attribute: "" },
    });
  });

  it("shows the reading's current value as the plate prints it, in the slot's own unit and words", () => {
    // The plate draws the slot's unit alone: the device's kW is no more
    // than a hint in the empty unit field.
    renderRow({ value: own("power") });
    expect(screen.getByText("12")).toBeInTheDocument();
    cleanup();
    // Mutant: the device's unit read before the slot's shows "12 kW".
    renderRow({ value: own("power", { unit: "W" }) });
    expect(screen.getByText("12 W")).toBeInTheDocument();
    cleanup();
    // As many decimals as the plate keeps: all of 52.4 when none are set,
    // two when two are.
    renderRow({ value: own("temperature") });
    expect(screen.getByText("52.4")).toBeInTheDocument();
    cleanup();
    renderRow({ value: own("temperature", { decimals: 2, unit: "°C" }) });
    expect(screen.getByText("52.40 °C")).toBeInTheDocument();
    cleanup();
    renderRow({ value: own("onoff_state", { labels: { true: "MARCHE" } }) });
    expect(screen.getByText("MARCHE")).toBeInTheDocument();
    cleanup();
    renderRow({ value: own("onoff_state") });
    expect(screen.getByText("True")).toBeInTheDocument();
  });

  it.each([
    ["temperature", "float"],
    ["power", "int"],
  ])("offers a unit and decimals for %s (%s), and no words", (attribute) => {
    renderRow({ value: own(attribute) });
    openFormat();
    expect(screen.getByLabelText("Unit")).toBeInTheDocument();
    expect(screen.getByLabelText("Decimals")).toBeInTheDocument();
    expect(screen.queryByLabelText("Reads when true")).toBeNull();
  });

  it("offers a bool its two words, and no decimals", () => {
    renderRow({ value: own("onoff_state") });
    openFormat();
    // The twin above proves both queries find their field when offered.
    expect(screen.getByLabelText("Reads when true")).toBeInTheDocument();
    expect(screen.getByLabelText("Reads when false")).toBeInTheDocument();
    expect(screen.queryByLabelText("Decimals")).toBeNull();
  });

  it("offers no format for a text reading", () => {
    renderRow({ value: own("mode") });
    expect(screen.getByText("eco")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unit and format" }),
    ).toBeNull();
  });

  it("offers every field for another device's reading, whose type it cannot know", () => {
    renderRow({
      value: {
        kind: "attribute",
        target: { devices: { ids: ["sensor"] }, attribute: "flow" },
      },
    });
    openFormat();
    expect(screen.getByLabelText("Decimals")).toBeInTheDocument();
    expect(screen.getByLabelText("Reads when true")).toBeInTheDocument();
  });

  it("reads a binding on another device through the full picker, and takes its target back", () => {
    const value: SlotValue = {
      kind: "attribute",
      target: { devices: { ids: ["sensor"] }, attribute: "flow" },
      unit: "m³/h",
    };
    const { onChange } = renderRow({ value });
    expect(source()).toHaveTextContent("Another device…");
    const picker = screen.getByTestId("target-picker");
    expect(JSON.parse(picker.getAttribute("data-value")!)).toEqual(
      value.target,
    );
    fireEvent.click(
      within(picker).getByRole("button", { name: "pick in the picker" }),
    );
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      ...value,
      target: { devices: { ids: ["sensor"] }, attribute: "flow" },
    });
  });

  it("names its own device's reading in the select, with no picker", () => {
    renderRow({ value: own("power") });
    expect(source()).toHaveTextContent("Power");
    // The twin above finds the picker with this query.
    expect(screen.queryByTestId("target-picker")).toBeNull();
  });

  it("reads through the picker when the symbol has no device", () => {
    renderRow({ value: own("power"), device: undefined });
    expect(screen.getByTestId("target-picker")).toBeInTheDocument();
  });

  it("keeps a bound attribute the device no longer lists", () => {
    renderRow({ value: own("setpoint") });
    expect(source()).toHaveTextContent("setpoint");
  });

  it("types a literal as one merged field, settled when left", () => {
    const { onChange, onType, onSettle } = renderRow({
      value: { kind: "text", text: "Hors service" },
    });
    const text = screen.getByRole("textbox", { name: "Text shown for State" });
    fireEvent.change(text, { target: { value: "Hors service !" } });
    expect(onType).toHaveBeenCalledExactlyOnceWith(
      { kind: "text", text: "Hors service !" },
      "text",
    );
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(text);
    expect(onSettle).toHaveBeenCalledOnce();
  });

  it("types the unit and a bool's words each in a field of its own", () => {
    const reading = own("temperature", { unit: "x" });
    const number = renderRow({ value: reading });
    openFormat();
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "" } });
    expect(number.onType).toHaveBeenLastCalledWith(
      { ...reading, unit: null },
      "unit",
    );
    cleanup();
    const value = own("onoff_state", { labels: { false: "OFF" } });
    const { onType, onSettle } = renderRow({ value });
    openFormat();
    // A state shows as a state or as its words: no unit to type.
    expect(screen.queryByLabelText("Unit")).toBeNull();
    fireEvent.change(screen.getByLabelText("Reads when true"), {
      target: { value: "ON" },
    });
    // Mutant: one key for both words merges a burst in one into the other.
    expect(onType).toHaveBeenLastCalledWith(
      { ...value, labels: { false: "OFF", true: "ON" } },
      "label-true",
    );
    fireEvent.change(screen.getByLabelText("Reads when false"), {
      target: { value: "" },
    });
    expect(onType).toHaveBeenLastCalledWith(
      { ...value, labels: null },
      "label-false",
    );
    fireEvent.blur(screen.getByLabelText("Reads when false"));
    expect(onSettle).toHaveBeenCalledOnce();
  });

  it("commits decimals as one step, whole and at most six", () => {
    const value = own("temperature", { decimals: 1 });
    const { onChange, onType } = renderRow({ value });
    openFormat();
    const decimals = screen.getByLabelText("Decimals");
    expect(decimals).toHaveValue(1);
    fireEvent.change(decimals, { target: { value: "9" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(decimals);
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...value, decimals: 6 });
    expect(onType).not.toHaveBeenCalled();
  });

  it.each(["blur", "Enter"])(
    "restores automatic decimals when cleared with %s",
    (commit) => {
      const value = own("temperature", { decimals: 2, unit: "°C" });
      const { onChange, onType } = renderRow({ value });
      openFormat();
      const decimals = screen.getByLabelText("Decimals");
      fireEvent.change(decimals, { target: { value: "" } });
      expect(onChange).not.toHaveBeenCalled();
      if (commit === "Enter") fireEvent.keyDown(decimals, { key: "Enter" });
      fireEvent.blur(decimals);
      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        ...value,
        decimals: null,
      });
      expect(onType).not.toHaveBeenCalled();
    },
  );

  it("lists the errors the last save left on the slot", () => {
    renderRow({ value: own("power"), errors: ["no device exposes power"] });
    expect(screen.getByText("no device exposes power")).toBeInTheDocument();
  });
  it("sets no decimals on a reading whose decimals were left unset", () => {
    const value = own("temperature", { decimals: null });
    const { onChange } = renderRow({ value });
    openFormat();
    const decimals = screen.getByLabelText("Decimals");
    // Unset reads blank ("auto", as many as the plate keeps): a 0 typed
    // there is a change, not the number already shown.
    expect(decimals).toHaveValue(null);
    fireEvent.change(decimals, { target: { value: "0" } });
    fireEvent.blur(decimals);
    expect(onChange).toHaveBeenCalledWith({ ...value, decimals: 0 });
  });

  it("carries no unit onto a text reading, which offers none to clear", async () => {
    const user = userEvent.setup();
    const { onChange } = renderRow({
      value: own("temperature", { unit: "°F" }),
    });
    await choose(user, "Mode");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ unit: null, decimals: null }),
    );
  });
});
