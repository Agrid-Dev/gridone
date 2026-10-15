import { describe, expect, it } from "vitest";
import type { AwhpAttributes } from "@/lib/devices";
import {
  fanTransform,
  figureMode,
  hslTokenToRgb,
  isRunning,
  levelAt,
  parseFigureData,
  sensorAttribute,
  temperatureColor,
  type FanBasis,
} from "../figureModel";

const PALETTE = {
  cold: [0, 0, 255] as [number, number, number],
  neutral: [100, 100, 100] as [number, number, number],
  hot: [255, 0, 0] as [number, number, number],
};

const ATTRIBUTES: AwhpAttributes = {
  onoffState: true,
  unitRunStatus: "running",
  mode: "heat",
  inletTemperature: 40.2,
  outletTemperature: 45.1,
  setpointTemperature: 45,
  outdoorTemperature: 7.4,
  compressorSuctionTemperature: 2.1,
  compressorSuctionPressure: 7.6,
  compressorDischargeTemperature: 71.8,
  compressorDischargePressure: 29.4,
  condenserSaturatedRefrigerantTemperature: 48.3,
  condenserRefrigerantPressure: 29.4,
  evaporatorSaturatedRefrigerantTemperature: -2.9,
  evaporatorRefrigerantPressure: 7.6,
};

describe("figureMode", () => {
  it("draws heating only when the plate exchanger condenses", () => {
    expect(figureMode("heat")).toBe("heat");
    expect(figureMode("cool")).toBe("cool");
    expect(figureMode("auto")).toBe("cool");
    expect(figureMode(null)).toBe("cool");
  });
});

describe("sensorAttribute", () => {
  it("reads the exchanger pressures by the side each exchanger plays", () => {
    expect(sensorAttribute("air_p", "heat")).toBe(
      "evaporatorRefrigerantPressure",
    );
    expect(sensorAttribute("water_p", "heat")).toBe(
      "condenserRefrigerantPressure",
    );
    expect(sensorAttribute("air_p", "cool")).toBe(
      "condenserRefrigerantPressure",
    );
    expect(sensorAttribute("water_p", "cool")).toBe(
      "evaporatorRefrigerantPressure",
    );
  });

  it("maps the fixed sensors to their attribute", () => {
    expect(sensorAttribute("suction_t", "heat")).toBe(
      "compressorSuctionTemperature",
    );
    expect(sensorAttribute("discharge_p", "cool")).toBe(
      "compressorDischargePressure",
    );
    expect(sensorAttribute("inlet_t", "heat")).toBe("inletTemperature");
  });
});

describe("isRunning", () => {
  it("runs when on, unless the unit reports standby or alarm", () => {
    expect(isRunning(ATTRIBUTES)).toBe(true);
    expect(isRunning({ ...ATTRIBUTES, onoffState: false })).toBe(false);
    expect(isRunning({ ...ATTRIBUTES, unitRunStatus: "Standby" })).toBe(false);
    expect(isRunning({ ...ATTRIBUTES, unitRunStatus: "alarm" })).toBe(false);
    expect(isRunning({ ...ATTRIBUTES, unitRunStatus: null })).toBe(true);
  });
});

describe("levelAt", () => {
  const knots: [number, number][] = [
    [0, 0.6],
    [0.4, 0.6],
    [0.6, 0.1],
    [1, 0.1],
  ];

  it("holds the end levels outside the knots and interpolates between", () => {
    expect(levelAt(knots, -1)).toBe(0.6);
    expect(levelAt(knots, 0.2)).toBe(0.6);
    expect(levelAt(knots, 0.5)).toBeCloseTo(0.35);
    expect(levelAt(knots, 2)).toBe(0.1);
    expect(levelAt([], 0.5)).toBe(0.5);
  });
});

describe("temperatureColor", () => {
  it("runs cold → neutral → hot and clamps the level", () => {
    expect(temperatureColor(0, PALETTE)).toBe("rgb(0 0 255)");
    expect(temperatureColor(0.5, PALETTE)).toBe("rgb(100 100 100)");
    expect(temperatureColor(1, PALETTE)).toBe("rgb(255 0 0)");
    expect(temperatureColor(0.75, PALETTE)).toBe("rgb(178 50 50)");
    expect(temperatureColor(7, PALETTE)).toBe("rgb(255 0 0)");
  });
});

describe("hslTokenToRgb", () => {
  it("converts the theme's h s% l% tokens and rejects anything else", () => {
    expect(hslTokenToRgb("0 100% 50%")).toEqual([255, 0, 0]);
    expect(hslTokenToRgb("120 100% 25%")).toEqual([0, 128, 0]);
    expect(hslTokenToRgb(" 0 0% 100% ")).toEqual([255, 255, 255]);
    expect(hslTokenToRgb("")).toBeNull();
    expect(hslTokenToRgb("#ff0000")).toBeNull();
  });
});

describe("fanTransform", () => {
  const fan: FanBasis = { centre: [100, 50], ey: [-1.25, 0.6], ez: [0, -1.5] };

  it("is the identity at angle 0 and keeps the hub in place", () => {
    expect(fanTransform(fan, 0)).toBe(
      "matrix(1.0000 0.0000 0.0000 1.0000 0.0000 0.0000)",
    );
    // A quarter turn maps the blade-plane y axis onto its z axis.
    const quarter = fanTransform(fan, Math.PI / 2)
      .match(/matrix\(([^)]*)\)/)![1]
      .split(" ")
      .map(Number);
    const [a, b, c, d, e, f] = quarter;
    const apply = ([x, y]: [number, number]) => [
      a * x + c * y + e,
      b * x + d * y + f,
    ];
    expect(apply([100, 50]).map((v) => Math.round(v))).toEqual([100, 50]);
    expect(apply([100 - 1.25, 50 + 0.6]).map((v) => +v.toFixed(2))).toEqual([
      100, 48.5,
    ]);
  });
});

describe("parseFigureData", () => {
  const good = {
    width: 760,
    height: 470,
    fan: { centre: [1, 2], ey: [1, 0], ez: [0, 1] },
    flows: { heat: {}, cool: {} },
    profiles: { heat: {}, cool: {} },
    tour: [],
  };

  it("accepts the generated shape and rejects a stale one", () => {
    expect(parseFigureData(good).fan.centre).toEqual([1, 2]);
    expect(() =>
      parseFigureData({
        ...good,
        fan: { centre: [1], ey: [1, 0], ez: [0, 1] },
      }),
    ).toThrow(/shape/);
    expect(() => parseFigureData({})).toThrow(/shape/);
  });
});
