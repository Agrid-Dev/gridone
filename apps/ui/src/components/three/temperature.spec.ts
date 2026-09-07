import { describe, expect, it } from "vitest";
import {
  hslToCss,
  lerpHsl,
  parseHslTriplet,
  temperatureHsl,
  type HslTriplet,
} from "./temperature";

const COOL: HslTriplet = [217, 91, 60];
const OK: HslTriplet = [142, 76, 36];
const HEAT: HslTriplet = [25, 95, 53];

describe("parseHslTriplet", () => {
  it("parses the bare token format from index.css", () => {
    expect(parseHslTriplet("217 91% 60%")).toEqual([217, 91, 60]);
    expect(parseHslTriplet("  0 72% 51% ")).toEqual([0, 72, 51]);
    expect(parseHslTriplet("217.5 91% 60.5%")).toEqual([217.5, 91, 60.5]);
  });

  it("returns null on malformed values", () => {
    expect(parseHslTriplet("")).toBeNull();
    expect(parseHslTriplet("#ff0000")).toBeNull();
    expect(parseHslTriplet("217 91 60")).toBeNull();
  });
});

describe("lerpHsl", () => {
  it("interpolates each channel linearly", () => {
    expect(lerpHsl([0, 0, 0], [100, 50, 80], 0.5)).toEqual([50, 25, 40]);
  });

  it("takes the shortest hue arc across 0°", () => {
    const [h] = lerpHsl([350, 50, 50], [10, 50, 50], 0.5);
    expect(h).toBe(0);
  });
});

describe("temperatureHsl", () => {
  it("saturates at the range boundaries", () => {
    expect(temperatureHsl(10, COOL, OK, HEAT)).toEqual(COOL);
    expect(temperatureHsl(16, COOL, OK, HEAT)).toEqual(COOL);
    expect(temperatureHsl(28, COOL, OK, HEAT)).toEqual(HEAT);
    expect(temperatureHsl(35, COOL, OK, HEAT)).toEqual(HEAT);
  });

  it("hits the ok token exactly at comfort temperature", () => {
    expect(temperatureHsl(22, COOL, OK, HEAT)).toEqual(OK);
  });

  it("blends monotonically inside each segment", () => {
    const cold = temperatureHsl(17, COOL, OK, HEAT);
    const warm = temperatureHsl(21, COOL, OK, HEAT);
    // Hue travels from 217 (cool) down to 142 (ok).
    expect(cold[0]).toBeGreaterThan(warm[0]);
    expect(cold[0]).toBeLessThan(COOL[0] + 1);
  });
});

describe("hslToCss", () => {
  it("renders a css color usable by three.js", () => {
    expect(hslToCss([217, 91, 60])).toBe("hsl(217 91% 60%)");
  });
});
