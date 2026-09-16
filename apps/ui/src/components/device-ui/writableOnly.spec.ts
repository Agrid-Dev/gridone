import { describe, expect, it } from "vitest";
import type { PageNode, PresentationV1 } from "./document";
import {
  hasDeviceFace,
  unwrapDeviceFaceSection,
  writableOnlyPresentation,
} from "./writableOnly";

const FACE: PageNode = {
  kind: "device-face",
  label: { default: "Face" },
  view_box: { width: 100, height: 60 },
  layers: [],
};

const HUMIDITY: PageNode = {
  kind: "measurements",
  items: [{ binding: "humidity" }],
};

const doc = (page: PageNode): PresentationV1 => ({
  schema_version: 1,
  requires: ["presentation.v1"],
  assets: { face: { path: "/assets/face.png" } },
  bindings: { humidity: { attribute: "humidity" } },
  controls: {
    target: { kind: "number", binding: "target", label: { default: "Target" } },
  },
  page,
});

describe("writableOnlyPresentation", () => {
  it("drops measurements", () => {
    expect(
      writableOnlyPresentation(
        doc({
          kind: "stack",
          children: [HUMIDITY, { kind: "control-panel", controls: ["target"] }],
        }),
      ).page,
    ).toEqual({
      kind: "stack",
      children: [{ kind: "control-panel", controls: ["target"] }],
    });
  });

  it("keeps a commandable row's label, control and formatter, and nothing else", () => {
    expect(
      writableOnlyPresentation(
        doc({
          kind: "setpoint-table",
          rows: [
            {
              label: { default: "Target" },
              demanded: { control: "target" },
              regulated: { binding: "effective" },
              measured: { binding: "measured" },
              deviation: {
                minuend: "measured",
                subtrahend: "effective",
                tolerance: 0.5,
              },
              formatter: { decimals: 1, unit: "°C" },
            },
            {
              label: { default: "Demand" },
              demanded: { binding: "demand" },
              measured: { binding: "measured" },
            },
          ],
        }),
      ).page,
    ).toEqual({
      kind: "setpoint-table",
      rows: [
        {
          label: { default: "Target" },
          demanded: { control: "target" },
          formatter: { decimals: 1, unit: "°C" },
        },
      ],
    });
  });

  it("prunes the containers left empty", () => {
    expect(
      writableOnlyPresentation(
        doc({
          kind: "stack",
          children: [
            {
              kind: "section",
              title: { default: "Readings" },
              children: [HUMIDITY],
            },
            {
              kind: "stack",
              children: [
                {
                  kind: "setpoint-table",
                  rows: [
                    {
                      label: { default: "Demand" },
                      demanded: { binding: "demand" },
                    },
                  ],
                },
              ],
            },
            { kind: "columns", items: [{ weight: 1, content: HUMIDITY }] },
          ],
        }),
      ).page,
    ).toEqual({ kind: "stack", children: [] });
  });

  it("drops the columns that became empty and keeps the others whole", () => {
    expect(
      writableOnlyPresentation(
        doc({
          kind: "columns",
          items: [
            { weight: 1, content: HUMIDITY },
            {
              weight: 2,
              sticky: true,
              content: { kind: "control-panel", controls: ["target"] },
            },
          ],
        }),
      ).page,
    ).toEqual({
      kind: "columns",
      items: [
        {
          weight: 2,
          sticky: true,
          content: { kind: "control-panel", controls: ["target"] },
        },
      ],
    });
  });

  it("keeps the device face, control panels and attributes", () => {
    const kept: PageNode[] = [
      FACE,
      { kind: "control-panel", controls: ["target"] },
      { kind: "attributes", group: "diagnostics" },
    ];
    expect(
      writableOnlyPresentation(
        doc({ kind: "stack", children: [...kept, HUMIDITY] }),
      ).page,
    ).toEqual({ kind: "stack", children: kept });
  });

  it("leaves the input document untouched and carries its envelope over", () => {
    const input = doc({
      kind: "stack",
      children: [HUMIDITY, { kind: "control-panel", controls: ["target"] }],
    });
    const before = structuredClone(input);

    const result = writableOnlyPresentation(input);

    expect(input).toEqual(before);
    expect(result).not.toBe(input);
    expect(result.schema_version).toBe(1);
    expect(result.requires).toEqual(input.requires);
    expect(result.assets).toEqual(input.assets);
    expect(result.bindings).toEqual(input.bindings);
    expect(result.controls).toEqual(input.controls);
  });

  it("returns the very same document when there is nothing to strip", () => {
    const leafRoot = doc({ kind: "control-panel", controls: ["target"] });
    expect(writableOnlyPresentation(leafRoot)).toBe(leafRoot);

    const stackRoot = doc({
      kind: "stack",
      children: [{ kind: "control-panel", controls: ["target"] }],
    });
    expect(writableOnlyPresentation(stackRoot)).toEqual(stackRoot);
  });
});

describe("hasDeviceFace", () => {
  it("finds a face nested in a section inside a column", () => {
    expect(
      hasDeviceFace(
        doc({
          kind: "columns",
          items: [
            { weight: 1, content: { kind: "attributes" } },
            {
              weight: 2,
              content: {
                kind: "section",
                title: { default: "Screen" },
                children: [FACE],
              },
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("is false for a document without one", () => {
    expect(
      hasDeviceFace(
        doc({
          kind: "stack",
          children: [HUMIDITY, { kind: "control-panel", controls: ["target"] }],
        }),
      ),
    ).toBe(false);
  });
});

describe("unwrapDeviceFaceSection", () => {
  const titled = (children: PageNode[]): PageNode => ({
    kind: "section",
    title: { default: "Live" },
    children,
  });

  it("replaces a section that framed nothing but the face with the face", () => {
    expect(unwrapDeviceFaceSection(doc(titled([FACE]))).page).toEqual(FACE);
  });

  it("unwraps the face section nested in a column, leaving the column intact", () => {
    expect(
      unwrapDeviceFaceSection(
        doc({
          kind: "columns",
          items: [
            {
              weight: 3,
              content: { kind: "control-panel", controls: ["target"] },
            },
            { weight: 2, sticky: true, content: titled([FACE]) },
          ],
        }),
      ).page,
    ).toEqual({
      kind: "columns",
      items: [
        { weight: 3, content: { kind: "control-panel", controls: ["target"] } },
        { weight: 2, sticky: true, content: FACE },
      ],
    });
  });

  it("keeps a section that frames more than the face: its title still describes the rest", () => {
    const page = titled([
      FACE,
      { kind: "control-panel", controls: ["target"] },
    ]);
    expect(unwrapDeviceFaceSection(doc(page)).page).toEqual(page);
  });

  it("leaves a document without a face section untouched", () => {
    const page: PageNode = {
      kind: "stack",
      children: [{ kind: "control-panel", controls: ["target"] }],
    };
    const document = doc(page);
    expect(unwrapDeviceFaceSection(document)).toBe(document);
  });
});

describe("identity of an unchanged document", () => {
  it("returns the very same document when there is nothing read-only to strip", () => {
    const document = doc({
      kind: "columns",
      items: [
        {
          weight: 3,
          content: {
            kind: "section",
            title: { default: "Settings" },
            children: [
              { kind: "control-panel", controls: ["target"] },
              {
                kind: "setpoint-table",
                rows: [
                  { label: { default: "T" }, demanded: { control: "target" } },
                ],
              },
            ],
          },
        },
        { weight: 2, content: FACE },
      ],
    });
    expect(writableOnlyPresentation(document)).toBe(document);
  });
});
