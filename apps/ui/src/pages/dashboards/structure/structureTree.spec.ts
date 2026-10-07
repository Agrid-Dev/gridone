import { describe, expect, it } from "vitest";
import type { DashboardStructure, DashboardSummary } from "@gridone/sdk";
import {
  ROOT_DROP_ID,
  build,
  dissolve,
  dropId,
  dropTarget,
  findGroup,
  firstDashboardId,
  flatten,
  flattenDashboards,
  relocate,
  toUpdate,
} from "./structureTree";

const summary = (id: string, name = id): DashboardSummary =>
  ({ id, name, type: "live", icon: null, metadata: {} }) as DashboardSummary;

/** HVAC › [CTA, DHW › [West, East]], Leaks — one of every placement. */
const STRUCTURE: DashboardStructure = {
  items: [
    {
      kind: "section",
      id: "hvac",
      label: "HVAC",
      items: [
        { ...summary("cta", "CTA"), kind: "dashboard" },
        {
          kind: "group",
          id: "dhw",
          label: "DHW",
          icon: "droplets",
          dashboards: [summary("west"), summary("east")],
        },
      ],
    },
    { ...summary("leaks"), kind: "dashboard" },
  ],
};

const outline = (structure: DashboardStructure) =>
  flatten(structure).map((r) => `${"  ".repeat(r.depth)}${r.id}`);

describe("structureTree", () => {
  it("flattens dashboards depth-first, the first being the landing", () => {
    expect(flattenDashboards(STRUCTURE).map((d) => d.id)).toEqual([
      "cta",
      "west",
      "east",
      "leaks",
    ]);
    expect(firstDashboardId(STRUCTURE)).toBe("cta");
    expect(firstDashboardId({ items: [] })).toBeNull();
  });

  it("finds the group a dashboard is a tab of", () => {
    expect(findGroup(STRUCTURE, "east")?.id).toBe("dhw");
    expect(findGroup(STRUCTURE, "cta")).toBeNull();
  });

  it("round-trips through rows and writes the document the API takes", () => {
    expect(outline(STRUCTURE)).toEqual([
      "hvac",
      "  cta",
      "  dhw",
      "    west",
      "    east",
      "leaks",
    ]);
    expect(build(flatten(STRUCTURE))).toEqual(STRUCTURE);
    expect(toUpdate(STRUCTURE)).toEqual({
      items: [
        {
          kind: "section",
          id: "hvac",
          label: "HVAC",
          items: [
            { kind: "dashboard", id: "cta" },
            {
              kind: "group",
              id: "dhw",
              label: "DHW",
              icon: "droplets",
              dashboards: ["west", "east"],
            },
          ],
        },
        { kind: "dashboard", id: "leaks" },
      ],
    });
  });

  it("sends a node created in the editor without an id", () => {
    const update = toUpdate({
      items: [{ kind: "section", id: "", label: "New", items: [] }],
    });
    expect(update.items?.[0]).toMatchObject({ id: null, label: "New" });
  });

  describe("dropTarget", () => {
    const rows = flatten(STRUCTURE);
    const outlineAfter = (id: string, over: string) => {
      const target = dropTarget(rows, id, over);
      return target ? outline(build(relocate(rows, id, target))) : null;
    };

    it("lands before the tile dropped on, in that tile's container", () => {
      expect(dropTarget(rows, "leaks", "east")).toEqual({
        parentId: "dhw",
        index: 1,
      });
      expect(outlineAfter("leaks", "east")).toEqual([
        "hvac",
        "  cta",
        "  dhw",
        "    west",
        "    leaks",
        "    east",
      ]);
    });

    it("passes the next sibling when dropped on it, moving forward", () => {
      expect(dropTarget(rows, "west", "east")).toEqual({
        parentId: "dhw",
        index: 1,
      });
      expect(outlineAfter("west", "east")?.slice(3, 5)).toEqual([
        "    east",
        "    west",
      ]);
    });

    it("lands last in a container dropped on its zone", () => {
      expect(dropTarget(rows, "leaks", dropId("hvac"))).toEqual({
        parentId: "hvac",
        index: 2,
      });
      expect(dropTarget(rows, "cta", ROOT_DROP_ID)).toEqual({
        parentId: null,
        index: 2,
      });
      expect(outlineAfter("cta", ROOT_DROP_ID)).toEqual([
        "hvac",
        "  dhw",
        "    west",
        "    east",
        "leaks",
        "cta",
      ]);
    });

    it("defers to the container above when the kind cannot sit there", () => {
      const withOther = flatten({
        items: [
          ...STRUCTURE.items,
          {
            kind: "group",
            id: "other",
            label: "Other",
            icon: null,
            dashboards: [summary("x")],
          },
        ],
      });
      // A group dropped on a tile inside a group: after that group.
      expect(dropTarget(withOther, "dhw", "x")).toEqual({
        parentId: null,
        index: 3,
      });
      // A section dropped on a tile inside a section: after it, at the root.
      expect(dropTarget(withOther, "hvac", "x")).toEqual({
        parentId: null,
        index: 2,
      });
      // Nothing drops into itself.
      expect(dropTarget(rows, "dhw", dropId("dhw"))).toBeNull();
      expect(dropTarget(rows, "hvac", "west")).toBeNull();
    });

    it("moves a container with its contents", () => {
      expect(outlineAfter("dhw", "cta")).toEqual([
        "hvac",
        "  dhw",
        "    west",
        "    east",
        "  cta",
        "leaks",
      ]);
    });
  });

  it("dissolves a container, lifting its contents in place", () => {
    const withoutGroup = build(dissolve(flatten(STRUCTURE), "dhw"));
    expect(outline(withoutGroup)).toEqual([
      "hvac",
      "  cta",
      "  west",
      "  east",
      "leaks",
    ]);
    const withoutSection = build(dissolve(flatten(STRUCTURE), "hvac"));
    expect(outline(withoutSection)).toEqual([
      "cta",
      "dhw",
      "  west",
      "  east",
      "leaks",
    ]);
  });
});
