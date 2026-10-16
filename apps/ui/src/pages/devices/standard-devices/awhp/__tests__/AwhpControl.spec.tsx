import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceType } from "@/lib/devices";
import type { StandardControlProps } from "../../registry";
import { AwhpControl } from "../AwhpControl";

vi.mock("react-i18next", () =>
  createI18nMock({
    "controls.awhp.compressor": "Compresseur",
    "controls.awhp.expansionValve": "Détendeur",
    "controls.awhp.fanCoil": "Ventilateur · batterie",
    "controls.awhp.reversingValve": "Vanne 4 voies",
    "controls.awhp.plateExchanger": "Échangeur à plaques",
    "controls.awhp.waterIn": "Eau entrée",
    "controls.awhp.waterOut": "Eau sortie",
    "controls.awhp.outdoor": "Extérieur",
    "controls.awhp.setpoint": "Consigne",
    "controls.awhp.on": "Marche",
    "controls.awhp.off": "Arrêt",
    "attributes.onoff_state": "Marche/Arrêt",
    "attributes.mode": "Mode",
    "common.type": "Type",
    "common.on": "Marche",
    "controls.awhp.figureLabel": "Cycle frigorifique",
    "awhp.name": "PAC air-eau",
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
  unit?: string | null;
};

function attr(
  name: string,
  data_type: string,
  current_value: unknown,
  unit?: string,
): AttributeFixture {
  return {
    name,
    data_type,
    read_write_modes: ["read"],
    current_value,
    last_updated: null,
    ...(unit ? { unit } : {}),
  };
}

function makeAwhp(
  overrides: Partial<Record<string, AttributeFixture | undefined>> = {},
): Device {
  const defaults: Record<string, AttributeFixture | undefined> = {
    onoff_state: attr("onoff_state", "bool", true),
    unit_run_status: attr("unit_run_status", "string", "running"),
    mode: attr("mode", "string", "cool"),
    inlet_temperature: attr("inlet_temperature", "float", 12.3),
    outlet_temperature: attr("outlet_temperature", "float", 7.1),
    setpoint_temperature: attr("setpoint_temperature", "float", 7.0),
    outdoor_temperature: attr("outdoor_temperature", "float", 15.0),
    compressor_suction_pressure: attr(
      "compressor_suction_pressure",
      "float",
      4.2,
      "bar",
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

function propsOf(device: Device): StandardControlProps {
  return {
    device,
    draft: {},
    savingAttr: null,
    feedback: null,
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
  };
}

function renderControl(device: Device = makeAwhp()) {
  return render(<AwhpControl {...propsOf(device)} />);
}

/** The drawing once its lazy chunk has mounted. */
const findFigure = () => screen.findByTestId("awhp-figure");

const callout = (figure: HTMLElement, piece: string) =>
  figure.querySelector(`.aw-label[data-piece="${piece}"]`);
const arrow = (figure: HTMLElement, piece: string) =>
  figure.querySelector(`.aw-arrow[data-piece="${piece}"]`);
/** The first colour stop of a flow's gradient (by tag: jsdom's selector
 *  engine misses descendants of camel-case SVG elements). */
const gradientStop = (figure: HTMLElement, flow: string) =>
  [...figure.getElementsByTagName("stop")].find(
    (stop) => stop.parentElement?.getAttribute("data-flow") === flow,
  ) ?? null;

afterEach(cleanup);

describe("AwhpControl", () => {
  it("stacks the facts the drawing does not show: type, on/off, mode, setpoint", async () => {
    renderControl();

    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("PAC air-eau")).toBeInTheDocument();
    expect(screen.getByText("Local technique")).toBeInTheDocument();
    expect(screen.getByText("Marche/Arrêt")).toBeInTheDocument();
    expect(screen.getByText("Marche")).toBeInTheDocument();
    expect(screen.getByText("Mode")).toBeInTheDocument();
    expect(screen.getByText("Froid")).toBeInTheDocument();
    expect(screen.getByText("Consigne")).toBeInTheDocument();
    expect(screen.getByText("7,0°")).toBeInTheDocument();
    await findFigure();
  });

  it("hides the setpoint fact when the attribute is absent", async () => {
    renderControl(makeAwhp({ setpoint_temperature: undefined }));

    expect(screen.queryByText("Consigne")).not.toBeInTheDocument();
    await findFigure();
  });

  it("names the parts and writes each reading into its tag, with the driver's unit", async () => {
    renderControl();
    const figure = await findFigure();

    expect(callout(figure, "air")).toHaveTextContent("Ventilateur · batterie");
    expect(callout(figure, "valve")).toHaveTextContent("Vanne 4 voies");
    expect(callout(figure, "inlet_t")).toHaveTextContent("Eau entrée 12,3°");
    expect(callout(figure, "outlet_t")).toHaveTextContent("Eau sortie 7,1°");
    expect(callout(figure, "outdoor_t")).toHaveTextContent("Extérieur 15,0°");
    expect(callout(figure, "suction_p")).toHaveTextContent("4,2 bar");
    // No unit declared and none implied by the name: the number alone.
    expect(callout(figure, "discharge_p")).toHaveTextContent("16,8");
  });

  it("hides the callout and the arrow of a reading the device does not report", async () => {
    renderControl(
      makeAwhp({
        compressor_discharge_pressure: undefined,
        inlet_temperature: undefined,
      }),
    );
    const figure = await findFigure();

    expect(callout(figure, "discharge_p")).toHaveAttribute("data-absent");
    expect(callout(figure, "inlet_t")).toHaveAttribute("data-absent");
    expect(arrow(figure, "inlet_t")).toHaveAttribute("data-absent");
    expect(callout(figure, "outlet_t")).not.toHaveAttribute("data-absent");
    expect(arrow(figure, "outlet_t")).not.toHaveAttribute("data-absent");
    // The coil and plate transducers follow the cycle: neither pressure is
    // reported here, so both tags go.
    expect(callout(figure, "air_p")).toHaveAttribute("data-absent");
    expect(callout(figure, "water_p")).toHaveAttribute("data-absent");
  });

  it("sends the hot gas to the coil when cooling and to the plate when heating", async () => {
    const { unmount } = renderControl();
    const cooling = await findFigure();
    expect(cooling).toHaveAttribute("data-mode", "cool");
    expect(
      cooling.querySelector('.aw-flow[data-flow-of="coil"]'),
    ).toHaveAttribute("data-dir", "fwd");
    expect(
      cooling.querySelector('.aw-flow[data-flow-of="plate"]'),
    ).toHaveAttribute("data-dir", "back");
    unmount();

    renderControl(makeAwhp({ mode: attr("mode", "string", "heat") }));
    const heating = await findFigure();
    expect(heating).toHaveAttribute("data-mode", "heat");
    expect(
      heating.querySelector('.aw-flow[data-flow-of="coil"]'),
    ).toHaveAttribute("data-dir", "back");
    expect(
      heating.querySelector('.aw-flow[data-flow-of="plate"]'),
    ).toHaveAttribute("data-dir", "fwd");
    // Only the refrigerant is coloured by temperature: its stops get an
    // inline colour per mode, the water's stay on the stylesheet's fluid colour.
    expect(gradientStop(heating, "discharge")).toHaveAttribute(
      "stop-color",
      expect.stringMatching(/^rgb\(/),
    );
    expect(gradientStop(heating, "water-out")).not.toHaveAttribute(
      "stop-color",
    );
    // The water always returns below and leaves above.
    expect(
      heating.querySelector('.aw-flow[data-flow-of="water-in"]'),
    ).toHaveAttribute("data-dir", "back");
  });

  it("runs the flow and the fan only while the unit is on", async () => {
    const { unmount } = renderControl();
    expect(await findFigure()).toHaveAttribute("data-running");
    unmount();

    renderControl(
      makeAwhp({ onoff_state: attr("onoff_state", "bool", false) }),
    );
    expect(await findFigure()).not.toHaveAttribute("data-running");
  });

  it("renders nothing for a non-AWHP device", () => {
    const device = { ...makeAwhp(), type: DeviceType.Thermostat };
    const { container } = renderControl(device);

    expect(container).toBeEmptyDOMElement();
  });

  it("updates a mounted figure in place: a reading, the mode, on/off, and a reading that goes away", async () => {
    const { rerender } = renderControl();
    const figure = await findFigure();
    expect(callout(figure, "inlet_t")).toHaveTextContent("12,3°");
    expect(figure).toHaveAttribute("data-mode", "cool");
    expect(figure).toHaveAttribute("data-running");

    rerender(
      <AwhpControl
        {...propsOf(
          makeAwhp({
            inlet_temperature: attr("inlet_temperature", "float", 20.5),
            mode: attr("mode", "string", "heat"),
            onoff_state: attr("onoff_state", "bool", false),
            outlet_temperature: undefined,
          }),
        )}
      />,
    );

    // The same DOM node, driven by the effects, not a remount.
    expect(screen.getByTestId("awhp-figure")).toBe(figure);
    expect(callout(figure, "inlet_t")).toHaveTextContent("20,5°");
    expect(figure).toHaveAttribute("data-mode", "heat");
    expect(
      figure.querySelector('.aw-flow[data-flow-of="plate"]'),
    ).toHaveAttribute("data-dir", "fwd");
    expect(figure).not.toHaveAttribute("data-running");
    expect(callout(figure, "outlet_t")).toHaveAttribute("data-absent");
    expect(arrow(figure, "outlet_t")).toHaveAttribute("data-absent");
  });

  it("gives each figure on a page its own gradient ids, so two units keep their own colours", async () => {
    render(
      <>
        <AwhpControl {...propsOf(makeAwhp())} />
        <AwhpControl
          {...propsOf({
            ...makeAwhp({ mode: attr("mode", "string", "heat") }),
            id: "dev-2",
          })}
        />
      </>,
    );
    const figures = await screen.findAllByTestId("awhp-figure");
    expect(figures).toHaveLength(2);

    const ids = figures.map(
      (figure) =>
        [...figure.querySelectorAll("[id]")].map((el) => el.id).sort()[0],
    );
    expect(ids[0]).not.toBe(ids[1]);
    expect(document.querySelectorAll(`[id="${ids[0]}"]`)).toHaveLength(1);
    // Every fill points at an id of its own figure.
    for (const figure of figures) {
      const own = new Set(
        [...figure.querySelectorAll("[id]")].map((el) => el.id),
      );
      // Filtered by hand: jsdom's selector engine stumbles on a "#" in an
      // attribute value.
      const fills = [...figure.querySelectorAll("[fill]")]
        .map((el) => el.getAttribute("fill")!)
        .filter((fill) => fill.startsWith("url(#"))
        .map((fill) => fill.slice("url(#".length, -1));
      expect(fills.length).toBeGreaterThan(0);
      for (const fill of fills) expect(own.has(fill)).toBe(true);
    }
    // And the two units are coloured for their own mode: the plate's hot
    // gas stop is only on the heating one.
    const stopOf = (figure: HTMLElement) =>
      [...figure.getElementsByTagName("stop")].find(
        (stop) => stop.parentElement?.getAttribute("data-flow") === "plate",
      );
    expect(stopOf(figures[0])?.getAttribute("stop-color")).not.toBe(
      stopOf(figures[1])?.getAttribute("stop-color"),
    );
  });
});
