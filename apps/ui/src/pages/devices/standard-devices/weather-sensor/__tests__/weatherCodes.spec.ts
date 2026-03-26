import { describe, expect, it } from "vitest";
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning } from "lucide-react";
import { getWeatherCode } from "../weatherCodes";

describe("getWeatherCode", () => {
  it("returns Sun for code 0 (clear sky)", () => {
    const result = getWeatherCode(0);
    expect(result.icon).toBe(Sun);
    expect(result.labelKey).toBe("clearSky");
  });

  it("returns CloudRain for code 63 (moderate rain)", () => {
    const result = getWeatherCode(63);
    expect(result.icon).toBe(CloudRain);
    expect(result.labelKey).toBe("moderateRain");
  });

  it("returns CloudSnow for code 73 (moderate snowfall)", () => {
    const result = getWeatherCode(73);
    expect(result.icon).toBe(CloudSnow);
  });

  it("returns CloudLightning for code 95 (thunderstorm)", () => {
    const result = getWeatherCode(95);
    expect(result.icon).toBe(CloudLightning);
  });

  it("returns Cloud fallback for unknown code", () => {
    const result = getWeatherCode(999);
    expect(result.icon).toBe(Cloud);
    expect(result.labelKey).toBe("unknown");
  });

  it("returns Cloud fallback for null", () => {
    const result = getWeatherCode(null);
    expect(result.icon).toBe(Cloud);
    expect(result.labelKey).toBe("unknown");
  });
});
