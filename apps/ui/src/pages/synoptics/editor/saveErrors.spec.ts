import { describe, expect, it } from "vitest";
import { emptyDocument } from "./document";
import type { PlateDocument } from "@/components/synoptic";
import { describeError, forgetElement, mapSaveErrors } from "./saveErrors";

const DOC: PlateDocument = {
  ...emptyDocument("p"),
  labels: [{ id: "title", at: { x: 0, y: 0 }, text: "p", role: "title" }],
  symbols: [
    {
      id: "pac-01",
      type: "heat_pump",
      placement: { kind: "cell", cell: { x: 0, y: 0 } },
    },
    {
      id: "b01",
      type: "tank",
      placement: { kind: "cell", cell: { x: 4, y: 0 } },
    },
  ],
  pipes: [
    {
      id: "feed",
      fluid: "dhw",
      from: { kind: "cell", cell: { x: 0, y: 0 } },
      to: { kind: "cell", cell: { x: 1, y: 0 } },
    },
  ],
};

describe("mapSaveErrors", () => {
  it("lands each violation on the element its loc names", () => {
    const { byElement, document } = mapSaveErrors(
      [
        {
          loc: ["symbols", 1, "bindings", "temperature"],
          msg: "no device",
          type: "unresolved_target",
        },
        { loc: ["pipes", 0, "flow"], msg: "not a bool", type: "flow_not_bool" },
        {
          loc: ["body", "symbols", 0, "props"],
          msg: "bad props",
          type: "invalid_props",
        },
      ],
      DOC,
    );
    // Mutant: reading loc[1] as the first symbol lands the tank's error on the PAC.
    expect(byElement.get("b01")).toEqual([
      { path: ["bindings", "temperature"], msg: "no device" },
    ]);
    expect(byElement.get("feed")).toEqual([
      { path: ["flow"], msg: "not a bool" },
    ]);
    expect(byElement.get("pac-01")).toEqual([
      { path: ["props"], msg: "bad props" },
    ]);
    expect(document).toEqual([]);
  });

  it("keeps the path below the slot, so a nested target error still names its field", () => {
    const { byElement } = mapSaveErrors(
      [
        {
          loc: [
            "body",
            "symbols",
            0,
            "bindings",
            "state",
            "target",
            "attribute",
          ],
          msg: "field required",
          type: "missing",
        },
      ],
      DOC,
    );
    const [error] = byElement.get("pac-01")!;
    expect(error.path).toEqual(["bindings", "state", "target", "attribute"]);
    // Under the state slot the reader sees the rest of the path, not "bindings.state".
    expect(describeError(error, 2)).toBe("target.attribute: field required");
    expect(describeError({ path: ["flow"], msg: "not a bool" }, 1)).toBe(
      "not a bool",
    );
  });

  it("forgets an element's errors once it is touched, and nothing else", () => {
    const errors = mapSaveErrors(
      [
        { loc: ["symbols", 0, "props"], msg: "a", type: "t" },
        { loc: ["pipes", 0, "flow"], msg: "b", type: "t" },
      ],
      DOC,
    );
    const after = forgetElement(errors, "pac-01");
    expect(after.byElement.has("pac-01")).toBe(false);
    expect(after.byElement.get("feed")).toHaveLength(1);
    // Mutant: forgetting an unknown id must not rebuild the map.
    expect(forgetElement(after, "nope")).toBe(after);
  });

  it("keeps a violation of the whole plate, or of an element it cannot find, on the document", () => {
    const { byElement, document } = mapSaveErrors(
      [
        {
          loc: ["pipes"],
          msg: "too many cells",
          type: "polyline_budget_exceeded",
        },
        { loc: ["symbols", 7, "id"], msg: "dup", type: "duplicate_id" },
        { loc: [], msg: "nul", type: "value_error" },
        // A label exists at that index, but the editor cannot select one.
        // Mutant: filing it under "title" shows nothing anywhere.
        {
          loc: ["labels", 0, "value"],
          msg: "unresolved",
          type: "unresolved_target",
        },
      ],
      DOC,
    );
    expect(byElement.size).toBe(0);
    expect(document.map((e) => describeError(e))).toEqual([
      "pipes: too many cells",
      "symbols.7.id: dup",
      "nul",
      "labels.0.value: unresolved",
    ]);
  });
});
