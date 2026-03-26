import { describe, expect, it } from "vitest";
import { degreesToCompass } from "../compass";

describe("degreesToCompass", () => {
  it.each([
    [0, "N"],
    [45, "NE"],
    [90, "E"],
    [135, "SE"],
    [180, "S"],
    [225, "SW"],
    [270, "W"],
    [315, "NW"],
    [360, "N"],
  ])("converts %i° to %s", (degrees, expected) => {
    expect(degreesToCompass(degrees)).toBe(expected);
  });

  it("rounds to nearest direction", () => {
    expect(degreesToCompass(22)).toBe("N");
    expect(degreesToCompass(23)).toBe("NE");
    expect(degreesToCompass(350)).toBe("N");
  });

  it("normalizes negative degrees", () => {
    expect(degreesToCompass(-90)).toBe("W");
    expect(degreesToCompass(-180)).toBe("S");
  });

  it("normalizes degrees above 360", () => {
    expect(degreesToCompass(450)).toBe("E");
  });

  it("returns null for null", () => {
    expect(degreesToCompass(null)).toBeNull();
  });
});
