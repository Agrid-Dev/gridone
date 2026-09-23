import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { toast } from "sonner";
import {
  GridoneError,
  type AttributeSlot,
  type Device,
  type SymbolElement,
} from "@gridone/sdk";
import type { SlotReading, SynopticValues } from "@/components/synoptic/values";
import type { WriteOutcome } from "@/components/device-ui/runtime/controlRuntime";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "popover.label": "Appareil sélectionné",
    "popover.close": "Fermer",
    "popover.open": "Ouvrir l'appareil",
    "popover.noPoints": "Aucun point lié sur ce symbole.",
    "popover.edit": "Modifier",
    "popover.apply": "Appliquer",
    "popover.cancel": "Annuler",
    "popover.writeFailed": "Écriture refusée",
    "popover.unconfirmed": "Écriture non confirmée par l'appareil",
    "legend.fault": "Défaut",
    "common.deviceNotFound": "Cet appareil n'existe plus.",
    "common.deviceLoadError": "Impossible de charger cet appareil.",
  }),
);

vi.mock("sonner", () => ({
  toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

const mockUseDeviceById = vi.fn();
vi.mock("@/hooks/useDeviceById", () => ({
  useDeviceById: (id: string | undefined) => mockUseDeviceById(id),
}));

// The writer is the device page's: preflight, warnings and consent are its
// business. Here only what the popover hands it, and what it does with
// the outcome, is under test.
const mockWrite =
  vi.fn<
    (
      deviceId: string,
      attribute: string,
      value: unknown,
    ) => Promise<WriteOutcome>
  >();
vi.mock("@/hooks/useAttributeCommandRuntime", () => ({
  useAttributeWriter:
    (deviceId: string) => (attribute: string, value: unknown) =>
      mockWrite(deviceId, attribute, value),
}));

import { DevicePopover } from "./DevicePopover";

const attribute = (name: string, fields: Record<string, unknown>) => ({
  kind: "state",
  name,
  data_type: "string",
  read_write_modes: ["read"],
  current_value: null,
  last_updated: null,
  last_changed: null,
  ...fields,
});

const DEVICE = {
  id: "PAC-03",
  name: "Pompe à chaleur 3",
  type: "awhp",
  is_faulty: false,
  config: {},
  driver_id: "d",
  transport_id: "t",
  attributes: {
    onoff_state: attribute("onoff_state", {
      data_type: "bool",
      read_write_modes: ["read", "write"],
      current_value: true,
    }),
    outlet_temperature: attribute("outlet_temperature", {
      data_type: "float",
      current_value: 52.4,
      unit: "°C",
      label: { default: "Outlet", translations: { fr: "Départ" } },
    }),
    speed: attribute("speed", {
      data_type: "int",
      read_write_modes: ["read", "write"],
      current_value: 3,
    }),
    ratio: attribute("ratio", {
      data_type: "float",
      read_write_modes: ["read", "write"],
      current_value: 0.5,
    }),
    // A boolean the driver words: the backend allows value labels on
    // booleans only.
    mode: attribute("mode", {
      data_type: "bool",
      read_write_modes: ["read", "write"],
      current_value: true,
      value_labels: [
        {
          value: true,
          label: { default: "Running", translations: { fr: "Marche" } },
        },
        {
          value: false,
          label: { default: "Stopped", translations: { fr: "Arrêt" } },
        },
      ],
    }),
    profile: attribute("profile", {
      read_write_modes: ["read", "write"],
      current_value: "a",
      value_options: ["a", "b"],
    }),
    name_tag: attribute("name_tag", {
      read_write_modes: ["read", "write"],
      current_value: "old",
    }),
    // Writable by mode, but the device says a write is blocked right now.
    locked: attribute("locked", {
      data_type: "int",
      read_write_modes: ["read", "write"],
      current_value: 1,
      write_state: { status: "blocked" },
    }),
  },
} as unknown as Device;

const CELL = { kind: "cell", cell: { x: 0, y: 0 } } as const;
const attr = (name: string): AttributeSlot => ({
  kind: "attribute",
  target: { devices: { ids: ["PAC-03"] }, attribute: name },
});

const PAC: SymbolElement = {
  id: "pac",
  type: "heat_pump",
  placement: CELL,
  label: "PAC 03",
  device_id: "PAC-03",
  // Declared out of the type's slot order (state, fault, supply_temp,
  // power) on purpose, with `fault` left unbound.
  bindings: {
    power: { kind: "text", text: "12 kW" },
    supply_temp: attr("outlet_temperature"),
    state: attr("onoff_state"),
  },
};

/** A pump whose `speed` slot reads (and edits) the attribute given. */
const pump = (slot: string, name: string): SymbolElement => ({
  id: "p1",
  type: "pump",
  placement: CELL,
  label: "P1",
  device_id: "PAC-03",
  bindings: { [slot]: attr(name) },
});

const live = (
  text: string,
  raw: SlotReading["raw"],
  unit: string | null = null,
): SlotReading => ({ text, unit, raw, stale: false, faulty: false });

const VALUES: SynopticValues = {
  slots: {
    "symbol.pac.state": live("MARCHE", true),
    "symbol.pac.supply_temp": live("52.4", 52.4, "°C"),
  },
  faultyDevices: {},
};

function renderPopover(symbol = PAC, values = VALUES) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <DevicePopover symbol={symbol} values={values} onClose={onClose} />
    </MemoryRouter>,
  );
  return { onClose };
}

const popover = () => screen.getByLabelText("Appareil sélectionné");
const point = (slot: string) =>
  document.querySelector<HTMLElement>(`[data-point='${slot}']`)!;
const points = () =>
  [...document.querySelectorAll("[data-point]")].map((el) =>
    el.getAttribute("data-point"),
  );
const reading = (slot: string) => point(slot).querySelector("[data-reading]")!;
const pencil = (slot: string) =>
  within(point(slot)).queryByRole("button", { name: "Modifier" });
const editor = () => document.querySelector("[data-point-editor]");
/** Opens the editor of a point and returns its field. */
const edit = (slot: string) => {
  fireEvent.click(pencil(slot)!);
  return within(editor() as HTMLElement).getByLabelText("Modifier");
};
const apply = () =>
  fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));

beforeEach(() => {
  mockUseDeviceById.mockReturnValue({
    data: DEVICE,
    isLoading: false,
    error: null,
  });
  mockWrite.mockResolvedValue({ kind: "ok" });
});

afterEach(() => {
  cleanup();
  mockUseDeviceById.mockReset();
  mockWrite.mockReset();
  vi.mocked(toast.warning).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe("DevicePopover", () => {
  describe("header", () => {
    it("names the symbol, then the device when its name differs, and links to its page", () => {
      renderPopover();
      expect(mockUseDeviceById).toHaveBeenLastCalledWith("PAC-03");
      expect(popover().getAttribute("data-device-popover")).toBe("pac");
      expect(popover().textContent).toContain("PAC 03");
      expect(popover().textContent).toContain("Pompe à chaleur 3");
      expect(
        screen
          .getByRole("link", { name: "Ouvrir l'appareil" })
          .getAttribute("href"),
      ).toBe("/devices/PAC-03");
    });

    it("falls back to the symbol's type when the device is named as the symbol is", () => {
      mockUseDeviceById.mockReturnValue({
        data: { ...DEVICE, name: "PAC 03" },
        isLoading: false,
        error: null,
      });
      renderPopover();
      expect(popover().textContent).toContain("heat pump");
    });

    it("flags a faulty device, and not a healthy one", () => {
      renderPopover();
      expect(screen.queryByText("Défaut")).toBeNull();
      cleanup();
      mockUseDeviceById.mockReturnValue({
        data: { ...DEVICE, is_faulty: true },
        isLoading: false,
        error: null,
      });
      renderPopover();
      expect(screen.getByText("Défaut")).toBeInTheDocument();
    });

    it("closes from its own button", () => {
      const { onClose } = renderPopover();
      fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("device states", () => {
    it("shows a placeholder while the device loads, with no message and no points", () => {
      mockUseDeviceById.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      });
      renderPopover();
      expect(popover().querySelector(".animate-pulse")).not.toBeNull();
      expect(points()).toEqual([]);
      expect(screen.queryByText("Cet appareil n'existe plus.")).toBeNull();
      expect(
        screen.queryByText("Impossible de charger cet appareil."),
      ).toBeNull();
    });

    it.each([
      [new GridoneError(404, "gone"), "Cet appareil n'existe plus."],
      [new Error("boom"), "Impossible de charger cet appareil."],
      // No error and no device is a failed load too, never a blank.
      [null, "Impossible de charger cet appareil."],
    ])("tells a deleted device from a failed load: %s", (error, message) => {
      mockUseDeviceById.mockReturnValue({
        data: undefined,
        isLoading: false,
        error,
      });
      renderPopover();
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(points()).toEqual([]);
      // The device page link stays: the id is known even when the device
      // cannot be read.
      expect(
        screen.getByRole("link", { name: "Ouvrir l'appareil" }),
      ).toBeInTheDocument();
    });
  });

  describe("points", () => {
    it("lists the bound slots in the order the type declares them, skipping unbound ones", () => {
      renderPopover();
      expect(points()).toEqual(["state", "supply_temp", "power"]);
    });

    it("says so when the symbol binds no point", () => {
      renderPopover({ ...PAC, bindings: {} });
      expect(
        screen.getByText("Aucun point lié sur ce symbole."),
      ).toBeInTheDocument();
      expect(points()).toEqual([]);
    });

    it("draws a live reading in the reading colour with its unit after it, and a literal as a note", () => {
      renderPopover();
      const state = reading("state");
      expect(state.getAttribute("data-reading")).toBe("live");
      expect(state.textContent).toBe("MARCHE");
      expect(state.className).toContain("text-synoptic-reading");

      const temp = reading("supply_temp");
      expect(temp.getAttribute("data-reading")).toBe("live");
      expect(temp.textContent).toBe("52.4°C");
      expect(temp.querySelector("span")?.textContent).toBe("°C");

      const power = reading("power");
      expect(power.getAttribute("data-reading")).toBe("note");
      expect(power.textContent).toBe("12 kW");
      expect(power.className).toContain("italic");
      expect(power.className).not.toContain("text-synoptic-reading");
    });

    it.each([
      ["silent", {}, "–"],
      [
        "stale",
        {
          "symbol.b01.temperature": { ...live("50.0", 50, "°C"), stale: true },
        },
        "50.0°C",
      ],
    ])("mutes a reading that is %s", (state, slots, text) => {
      renderPopover(
        {
          id: "b01",
          type: "tank",
          placement: CELL,
          label: "B01",
          device_id: "PAC-03",
          bindings: { temperature: attr("outlet_temperature") },
        },
        { slots, faultyDevices: {} },
      );
      const temperature = reading("temperature");
      expect(temperature.getAttribute("data-reading")).toBe(state);
      expect(temperature.textContent).toBe(text);
      expect(temperature.className).toContain("text-muted-foreground");
      expect(temperature.className).not.toContain("text-synoptic-reading");
    });

    it("labels a point by the driver's label in the current language, else by its attribute, and a literal by its slot", () => {
      renderPopover();
      const label = (slot: string) =>
        point(slot).querySelector("dt")?.textContent;
      expect(label("supply_temp")).toBe("Départ");
      expect(label("state")).toBe("Onoff State");
      expect(label("power")).toBe("power");
    });

    it("offers the pencil on a writable attribute only", () => {
      renderPopover();
      expect(pencil("state")).not.toBeNull();
      // Read-only attribute, and a literal nothing writes.
      expect(pencil("supply_temp")).toBeNull();
      expect(pencil("power")).toBeNull();
    });

    it("offers no pencil while the device blocks the write", () => {
      renderPopover(pump("speed", "locked"));
      expect(pencil("speed")).toBeNull();
    });
  });

  describe("editing", () => {
    it("writes a boolean the moment the switch is toggled, and closes the editor once confirmed", async () => {
      renderPopover();
      const toggle = edit("state");
      expect(toggle.getAttribute("role")).toBe("switch");
      expect(toggle.getAttribute("aria-checked")).toBe("true");
      expect(pencil("state")).toBeNull();

      fireEvent.click(toggle);

      expect(mockWrite).toHaveBeenCalledWith("PAC-03", "onoff_state", false);
      await waitFor(() => expect(editor()).toBeNull());
      expect(pencil("state")).not.toBeNull();
    });

    it("words a boolean's switch as the driver words its states, in the current language", async () => {
      renderPopover(pump("speed", "mode"));
      const toggle = edit("speed");
      expect(toggle.getAttribute("role")).toBe("switch");
      // The wording of the state the switch is in, not a bare true.
      expect(
        (editor() as HTMLElement).querySelector("[data-state-label]")
          ?.textContent,
      ).toBe("Marche");

      fireEvent.click(toggle);

      await waitFor(() =>
        expect(mockWrite).toHaveBeenCalledWith("PAC-03", "mode", false),
      );
    });

    it("never writes an emptied number field, nor one that is no number", () => {
      renderPopover(pump("speed", "speed"));
      const input = edit("speed") as HTMLInputElement;
      const applyButton = () =>
        screen.getByRole("button", { name: "Appliquer" }) as HTMLButtonElement;
      expect(applyButton().disabled).toBe(false);

      fireEvent.change(input, { target: { value: "" } });
      expect(applyButton().disabled).toBe(true);
      fireEvent.submit(input.closest("form")!);
      expect(mockWrite).not.toHaveBeenCalled();

      fireEvent.change(input, { target: { value: "  " } });
      expect(applyButton().disabled).toBe(true);

      fireEvent.change(input, { target: { value: "7" } });
      expect(applyButton().disabled).toBe(false);
      apply();
      expect(mockWrite).toHaveBeenCalledWith("PAC-03", "speed", 7);
    });

    it("lists bare value options as themselves", async () => {
      const user = userEvent.setup();
      renderPopover(pump("speed", "profile"));
      await user.click(edit("speed"));
      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual(["a", "b"]);
    });

    it.each([
      ["speed", "number", null, "4", 4],
      ["ratio", "number", "any", "0.75", 0.75],
      ["name_tag", "text", null, "hello", "hello"],
    ])(
      "edits %s in a %s field and writes what it parses to",
      async (name, type, step, typed, written) => {
        renderPopover(pump("speed", name));
        const input = edit("speed") as HTMLInputElement;
        expect(input.getAttribute("type")).toBe(type);
        expect(input.getAttribute("step")).toBe(step);
        expect(input.value).toBe(
          String(DEVICE.attributes![name].current_value),
        );

        fireEvent.change(input, { target: { value: typed } });
        apply();

        await waitFor(() =>
          expect(mockWrite).toHaveBeenCalledWith("PAC-03", name, written),
        );
        await waitFor(() => expect(editor()).toBeNull());
      },
    );

    it("cancels an edit without writing", () => {
      renderPopover(pump("speed", "name_tag"));
      edit("speed");
      fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
      expect(editor()).toBeNull();
      expect(mockWrite).not.toHaveBeenCalled();
    });

    it("locks the field and the button while the write is in flight", async () => {
      let settle!: (outcome: WriteOutcome) => void;
      mockWrite.mockReturnValue(
        new Promise<WriteOutcome>((resolve) => {
          settle = resolve;
        }),
      );
      renderPopover(pump("speed", "name_tag"));
      const input = edit("speed");
      apply();
      expect(input).toBeDisabled();
      expect(screen.getByRole("button", { name: "Appliquer" })).toBeDisabled();

      await act(async () => settle({ kind: "ok" }));
      expect(editor()).toBeNull();
    });

    it("keeps the editor open and warns when the device did not confirm", async () => {
      mockWrite.mockResolvedValue({ kind: "unconfirmed", message: "late" });
      renderPopover(pump("speed", "name_tag"));
      const input = edit("speed");
      apply();
      await waitFor(() =>
        expect(toast.warning).toHaveBeenCalledWith(
          "Écriture non confirmée par l'appareil",
        ),
      );
      expect(editor()).not.toBeNull();
      expect(input).not.toBeDisabled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it.each([
      ["the device's own reason", "boom", "boom"],
      ["a generic refusal when there is none", "", "Écriture refusée"],
    ])(
      "keeps the editor open and shows %s when the write fails",
      async (_case, message, shown) => {
        mockWrite.mockResolvedValue({ kind: "error", message });
        renderPopover(pump("speed", "name_tag"));
        edit("speed");
        apply();
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(shown));
        expect(editor()).not.toBeNull();
        expect(toast.warning).not.toHaveBeenCalled();
      },
    );

    it("says nothing when the write was cancelled by the operator", async () => {
      mockWrite.mockResolvedValue({ kind: "cancelled" });
      renderPopover(pump("speed", "name_tag"));
      const input = edit("speed");
      apply();
      await waitFor(() => expect(input).not.toBeDisabled());
      expect(editor()).not.toBeNull();
      expect(toast.warning).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });
  });
});
