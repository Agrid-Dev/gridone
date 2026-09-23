import type { Severity } from "@gridone/sdk";
import { describe, expect, it } from "vitest";
import { SEVERITIES } from "@/lib/severity";
import {
  FAULT_BG_CLASS,
  FAULT_FILL_CLASS,
  FAULT_STROKE_CLASS,
  FAULT_TEXT_CLASS,
  faultLevel,
} from "./fault";

describe("fault colours", () => {
  it("gives every severity a class in every table, red for an alert, amber for a warning, muted for info", () => {
    for (const table of [
      FAULT_STROKE_CLASS,
      FAULT_FILL_CLASS,
      FAULT_BG_CLASS,
      FAULT_TEXT_CLASS,
    ]) {
      expect(Object.keys(table).sort()).toEqual([...SEVERITIES].sort());
      expect(table.alert).toContain("status-error");
      expect(table.warning).toContain("status-warning");
      expect(table.info).toContain("muted-foreground");
      // Never the blue of "action required", never the green of "ok".
      for (const cls of Object.values(table)) {
        expect(cls).not.toContain("status-info");
        expect(cls).not.toContain("status-ok");
      }
    }
  });

  it("levels a fault at its severity, an alert when the severity is unknown or has no colour, nothing when healthy", () => {
    expect(faultLevel(true, "warning")).toBe("warning");
    expect(faultLevel(true, "info")).toBe("info");
    expect(faultLevel(true, null)).toBe("alert");
    expect(faultLevel(true)).toBe("alert");
    // A severity a newer server ships that no table names: red, never a
    // device drawn with no fault colour at all.
    expect(faultLevel(true, "critical" as Severity)).toBe("alert");
    expect(faultLevel(false, "alert")).toBeNull();
    expect(faultLevel(false)).toBeNull();
  });
});
