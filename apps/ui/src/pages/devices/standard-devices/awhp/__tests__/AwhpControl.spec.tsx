import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceType } from "@/lib/devices";
import type { StandardControlProps } from "../../registry";
import { AwhpControl } from "../AwhpControl";

vi.mock("react-i18next", () =>
  createI18nMock({
    "controls.awhp.evaporator": "Évaporateur",
    "controls.awhp.compressor": "Compresseur",
    "controls.awhp.condenser": "Condenseur",
    "controls.awhp.expansionValve": "Détendeur",
    "controls.awhp.inlet": "Entrée",
    "controls.awhp.outlet": "Sortie",
    "controls.awhp.setpoint": "Consigne",
    "controls.awhp.suction": "Aspiration",
    "controls.awhp.discharge": "Refoulement",
    "controls.awhp.runStatus": "État",
    "controls.awhp.waterSide": "Eau",
    "controls.awhp.airSide": "Air",
    "controls.awhp.chilledWater": "Eau glacée",
    "common.deviceTypes.awhp": "PAC air-eau",
    "common.hvacMode.cool": "Froid",
    "common.hvacMode.heat": "Chauffage",
  }),
);

vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => ({
    assetByDeviceId: { "dev-1": { id: "as-1", name: "Local technique" } },
  }),
}));

type AttributeFixture = {
  name: string;
  data_type: string;
  read_write_modes: string[];
  current_value: unknown;
  last_updated: string | null;
};

function attr(
  name: string,
  data_type: string,
  current_value: unknown,
): AttributeFixture {
  return {
    name,
    data_type,
    read_write_modes: ["read"],
    current_value,
    last_updated: null,
  };
}

function makeAwhp(
  overrides: Partial<Record<string, AttributeFixture | undefined>> = {},
): Device {
  const defaults: Record<string, AttributeFixture | undefined> = {
    onoff_state: attr("onoff_state", "bool", true),
    unit_run_status: attr("unit_run_status", "string", "Marche"),
    mode: attr("mode", "string", "cool"),
    inlet_temperature: attr("inlet_temperature", "float", 12.3),
    outlet_temperature: attr("outlet_temperature", "float", 7.1),
    setpoint_temperature: attr("setpoint_temperature", "float", 7.0),
    outdoor_temperature: attr("outdoor_temperature", "float", 15.0),
    compressor_suction_pressure: attr(
      "compressor_suction_pressure",
      "float",
      4.2,
    ),
    compressor_discharge_pressure: attr(
      "compressor_discharge_pressure",
      "float",
      16.8,
    ),
  };

  const attributes = { ...defaults, ...overrides };
  for (const key of Object.keys(attributes)) {
    if (attributes[key] === undefined) delete attributes[key];
  }

  return {
    id: "dev-1",
    name: "Groupe froid GF-01",
    type: DeviceType.Awhp,
    tags: {},
    driver_id: "drv-1",
    transport_id: "tr-1",
    config: {},
    attributes: attributes as Device["attributes"],
    is_faulty: false,
  };
}

function renderControl(device: Device = makeAwhp()) {
  const props: StandardControlProps = {
    device,
    draft: {},
    savingAttr: null,
    feedback: null,
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
  };
  return render(<AwhpControl {...props} />);
}

afterEach(cleanup);

describe("AwhpControl", () => {
  it("lays out the cooling cycle: water at the evaporator, air at the condenser", () => {
    renderControl();

    expect(screen.getByText("Évaporateur")).toBeInTheDocument();
    expect(screen.getByText("Compresseur")).toBeInTheDocument();
    expect(screen.getByText("Condenseur")).toBeInTheDocument();
    expect(screen.getByText("Détendeur")).toBeInTheDocument();
    expect(screen.getByText("Eau 7.1 °C")).toBeInTheDocument();
    expect(screen.getByText("Air 15.0 °C")).toBeInTheDocument();
  });

  it("swaps the media in heat mode and drops the chilled-water label", () => {
    renderControl(makeAwhp({ mode: attr("mode", "string", "heat") }));

    // Evaporator extracts from air, condenser heats the water.
    expect(screen.getByText("Air 15.0 °C")).toBeInTheDocument();
    expect(screen.getByText("Eau 7.1 °C")).toBeInTheDocument();
    expect(screen.queryByText("Eau glacée")).not.toBeInTheDocument();
    // The water-circuit row is labelled with the mode-neutral term.
    expect(screen.getByText("Chauffage")).toBeInTheDocument();
  });

  it("shows the header context: mode chip, type · asset, run status", () => {
    renderControl();

    expect(screen.getByText("Froid")).toBeInTheDocument();
    expect(
      screen.getByText("PAC air-eau · Local technique"),
    ).toBeInTheDocument();
    expect(screen.getByText("Marche")).toBeInTheDocument();
  });

  it("shows the water circuit readings with the chilled-water label", () => {
    renderControl();

    expect(screen.getByText("Eau glacée")).toBeInTheDocument();
    expect(screen.getByText("Entrée")).toBeInTheDocument();
    expect(screen.getByText("12.3 °C")).toBeInTheDocument();
    expect(screen.getByText("Sortie")).toBeInTheDocument();
    expect(screen.getByText("Consigne")).toBeInTheDocument();
    expect(screen.getByText("7.0 °C")).toBeInTheDocument();
  });

  it("hides the setpoint reading when the attribute is absent", () => {
    renderControl(makeAwhp({ setpoint_temperature: undefined }));

    expect(screen.queryByText("Consigne")).not.toBeInTheDocument();
  });

  it("shows the compressor pressures and hides the missing ones", () => {
    renderControl(makeAwhp({ compressor_discharge_pressure: undefined }));

    expect(screen.getByText("Aspiration")).toBeInTheDocument();
    expect(screen.getByText("4.2 bar")).toBeInTheDocument();
    expect(screen.queryByText("Refoulement")).not.toBeInTheDocument();
  });

  it("renders nothing for a non-AWHP device", () => {
    const device = { ...makeAwhp(), type: DeviceType.Thermostat };
    const { container } = renderControl(device);

    expect(container).toBeEmptyDOMElement();
  });
});
