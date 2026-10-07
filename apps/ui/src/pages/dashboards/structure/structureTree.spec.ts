import { describe, expect, it } from "vitest";
import type { DashboardStructure, DashboardSummary } from "@gridone/sdk";
import {
  build,
  dissolve,
  findGroup,
  firstDashboardId,
  flatten,
  flattenDashboards,
  move,
  project,
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

  describe("project", () => {
    const rows = flatten(STRUCTURE);

    it("nests a dashboard under the group above when dragged sideways", () => {
      // leaks dropped at east's slot, pushed one level: into DHW.
      expect(project(rows, "leaks", "east", 2)).toEqual({
        depth: 2,
        parentId: "dhw",
      });
      // Not pushed: east, still below it, keeps it in DHW anyway.
      expect(project(rows, "leaks", "east", 0)).toEqual({
        depth: 2,
        parentId: "dhw",
      });
    });

    it("clamps to what the neighbours allow", () => {
      // Below leaks (last root row) nothing can be deeper than the root.
      expect(project(rows, "cta", "leaks", 2)).toEqual({
        depth: 0,
        parentId: null,
      });
      // Above a nested row, the dragged row can't be shallower than it.
      expect(project(rows, "leaks", "cta", 0)).toEqual({
        depth: 1,
        parentId: "hvac",
      });
    });

    it("keeps a section at the root and a group out of a group", () => {
      expect(project(rows, "hvac", "leaks", 1)).toEqual({
        depth: 0,
        parentId: null,
      });
      // dhw at west's slot would be a group under itself — out.
      expect(project(rows, "dhw", "cta", 2)).toEqual({
        depth: 1,
        parentId: "hvac",
      });
    });
  });

  it("moves a container with its contents", () => {
    const rows = flatten(STRUCTURE);
    const next = move(rows, "dhw", "hvac", { depth: 0, parentId: null });
    expect(build(next).items.map((i) => i.id)).toEqual([
      "dhw",
      "hvac",
      "leaks",
    ]);
    const group = build(next).items[0];
    expect(group.kind === "group" && group.dashboards.map((d) => d.id)).toEqual(
      ["west", "east"],
    );
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
