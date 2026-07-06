import { describe, expect, it } from "vitest";
import { fanIsSpinning, fanStatus, type FanStatus } from "./fan";
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

describe("fanStatus", () => {
  it.each<[string, AirExtractorValues, FanStatus | null]>([
    [
      "running, proven",
      { onoffState: true, flowSwitch: true },
      { key: "on", tone: "ok" },
    ],
    [
      "fan failed (commanded, no flow)",
      { onoffState: true, flowSwitch: false },
      { key: "commandedNoFlow", tone: "warning" },
    ],
    [
      "reverse discordance (off, flow proven)",
      { onoffState: false, flowSwitch: true },
      { key: "flowWithoutCommand", tone: "warning" },
    ],
    [
      "stopped, normal",
      { onoffState: false, flowSwitch: false },
      { key: "off", tone: "muted" },
    ],
    ["command only (on)", { onoffState: true }, { key: "on", tone: "ok" }],
    [
      "command only (off)",
      { onoffState: false },
      { key: "off", tone: "muted" },
    ],
    [
      "flow switch only (proven)",
      { flowSwitch: true },
      { key: "flowProven", tone: "ok" },
    ],
    [
      "flow switch only (no flow)",
      { flowSwitch: false },
      { key: "flowMissing", tone: "muted" },
    ],
    ["nothing known", {}, null],
  ])("%s", (_desc, values, expected) => {
    expect(fanStatus(values)).toEqual(expected);
  });

  it("always agrees with the fan animation (status tone ok ⇔ spinning on concordant states)", () => {
    // The discordant states carry a warning tone precisely because the pill
    // and the animation would otherwise contradict each other.
    for (const onoffState of [true, false]) {
      for (const flowSwitch of [true, false]) {
        const values = { onoffState, flowSwitch };
        const status = fanStatus(values);
        if (status?.tone !== "warning") {
          expect(status?.tone === "ok").toBe(fanIsSpinning(values));
        }
      }
    }
  });
});
