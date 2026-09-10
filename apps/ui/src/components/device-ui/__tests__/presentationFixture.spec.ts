import { describe, expect, it } from "vitest";
import { AGRID_THERMOSTAT_PRESENTATION } from "../fixtures/agridThermostat/presentation";
import type { PageNode } from "../document";
import type { FaceLayer } from "../face";

/** Every reference inside the thermostat document resolves, as the backend validator requires. */
function faceLayers(node: PageNode): FaceLayer[] {
  switch (node.kind) {
    case "stack":
    case "section":
      return node.children.flatMap(faceLayers);
    case "columns":
      return node.items.flatMap((item) => faceLayers(item.content));
    case "device-face":
      return node.layers;
    default:
      return [];
  }
}

describe("thermostat presentation fixture", () => {
  const doc = AGRID_THERMOSTAT_PRESENTATION;

  it("declares every control its face actions target", () => {
    const actions = faceLayers(doc.page)
      .filter((layer) => layer.kind === "button")
      .map((layer) => (layer.kind === "button" ? layer.action.control : ""));
    for (const control of actions) {
      expect(doc.controls, `control ${control}`).toHaveProperty(control);
    }
  });

  it("binds every control to a declared binding", () => {
    for (const [id, control] of Object.entries(doc.controls)) {
      expect(doc.bindings, `control ${id}`).toHaveProperty(control.binding);
    }
  });

  it("announces every capability it uses", () => {
    expect(doc.requires).toEqual(
      expect.arrayContaining([
        "layout/1",
        "controls/1",
        "device-face/1",
        "glyph-text/1",
        "conditions/1",
      ]),
    );
  });
});
