import { describe, it, expect } from "vitest";
import type { Widget, WidgetSchemas } from "@gridone/sdk";
import type { WidgetFormValues } from "./WidgetForm";
import {
  DEFAULT_PREVIEW_SIZE,
  resolvePreviewSize,
  widgetDefaultSize,
} from "./WidgetPreview";

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

describe("resolvePreviewSize", () => {
  const SCHEMAS = {
    kpi: { "x-default-size": { w: 4, h: 1 } },
    text: { "x-default-size": { w: 4, h: 2 } },
  } as unknown as WidgetSchemas;

  it("uses the type's default size for a new widget with no registered preview rule", () => {
    expect(resolvePreviewSize("text", null, undefined, SCHEMAS)).toEqual({
      w: 4,
      h: 2,
    });
  });

  it("grows the type default by a registered preview-sizing rule (kpi)", () => {
    const draft = {
      config: { type: "kpi", attributes: [{}, {}, {}] },
    } as unknown as WidgetFormValues;
    expect(resolvePreviewSize("kpi", draft, undefined, SCHEMAS)).toEqual({
      w: 4,
      h: 3,
    });
  });

  it("uses an existing widget's own layout instead of the type default", () => {
    const widget = {
      layout: { x: 0, y: 0, w: 6, h: 2 },
    } as unknown as Widget;
    expect(resolvePreviewSize("text", null, widget, SCHEMAS)).toEqual(
      widget.layout,
    );
  });

  it("still applies the preview-sizing rule on top of an existing widget's layout", () => {
    const widget = { layout: { x: 0, y: 0, w: 4, h: 1 } } as unknown as Widget;
    const draft = {
      config: { type: "kpi", attributes: [{}, {}] },
    } as unknown as WidgetFormValues;
    expect(resolvePreviewSize("kpi", draft, widget, SCHEMAS)).toEqual({
      w: 4,
      h: 2,
    });
  });
});
