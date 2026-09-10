import { describe, expect, it } from "vitest";
import { sectionCounts } from "../sectionCounts";

describe("sectionCounts", () => {
  it("counts controls and readings through columns without counting repeated representations", () => {
    expect(
      sectionCounts({
        kind: "stack",
        children: [
          { kind: "control-panel", controls: ["target", "power"] },
          {
            kind: "columns",
            items: [
              {
                weight: 1,
                content: {
                  kind: "section",
                  title: { default: "Readings" },
                  children: [
                    { kind: "measurements", items: [{ binding: "measured" }] },
                    {
                      kind: "setpoint-table",
                      rows: [
                        {
                          label: { default: "Target" },
                          demanded: { control: "target" },
                          measured: { binding: "measured" },
                          regulated: { binding: "effective" },
                        },
                        {
                          label: { default: "Demand" },
                          demanded: { binding: "demand" },
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
          { kind: "attributes" },
          {
            kind: "device-face",
            label: { default: "Face" },
            view_box: { width: 10, height: 10 },
            layers: [],
          },
        ],
      }),
    ).toEqual({ controls: 2, measurements: 3 });
  });
});
