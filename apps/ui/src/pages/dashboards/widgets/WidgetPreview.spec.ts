import { describe, it, expect } from "vitest";
import { DEFAULT_PREVIEW_SIZE, widgetDefaultSize } from "./WidgetPreview";

describe("widgetDefaultSize", () => {
  it("reads the footprint the registry ships with the schema", () => {
    expect(widgetDefaultSize({ "x-default-size": { w: 6, h: 5 } })).toEqual({
      w: 6,
      h: 5,
    });
  });

  // A backend older than this UI ships schemas without the extension; the
  // preview should still render at something reasonable.
  it.each([
    ["missing", {}],
    ["undefined schema", undefined],
    ["malformed", { "x-default-size": { w: "wide" } }],
  ])("falls back when the size is %s", (_case, schema) => {
    expect(widgetDefaultSize(schema)).toEqual(DEFAULT_PREVIEW_SIZE);
  });
});
