import { describe, expect, it } from "vitest";
import { fanIsSpinning } from "./fan";
import type { AirExtractorValues } from "./types";

describe("fanIsSpinning", () => {
  it.each<[string, AirExtractorValues, boolean]>([
    ["running, proven", { onoffState: true, flowSwitch: true }, true],
    [
      "fan failed (commanded, no flow)",
      { onoffState: true, flowSwitch: false },
      false,
    ],
    [
      "reverse discordance (off, flow proven)",
      { onoffState: false, flowSwitch: true },
      true,
    ],
    ["stopped, normal", { onoffState: false, flowSwitch: false }, false],
    ["no flow switch → follows the command (on)", { onoffState: true }, true],
    [
      "no flow switch → follows the command (off)",
      { onoffState: false },
      false,
    ],
    ["nothing known", {}, false],
  ])("%s", (_desc, values, expected) => {
    expect(fanIsSpinning(values)).toBe(expected);
  });
});
