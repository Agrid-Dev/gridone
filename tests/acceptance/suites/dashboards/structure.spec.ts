import {
  isGridoneError,
  type DashboardStructure,
  type GridoneClient,
  type StructureItemRef,
} from "@gridone/sdk";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { makeAdminClient } from "../../lib/api";

/** The read tree as the document that stores it — what a client sends back
 *  unchanged. Lets a test splice its own placement after whatever the shared
 *  instance already holds. */
function refsOf(structure: DashboardStructure): StructureItemRef[] {
  return structure.items.map((item): StructureItemRef => {
    if (item.kind === "section") {
      return {
        kind: "section",
        id: item.id,
        label: item.label,
        items: item.items.map((child) =>
          child.kind === "group"
            ? {
                kind: "group",
                id: child.id,
                label: child.label,
                icon: child.icon,
                dashboards: child.dashboards.map((d) => d.id),
              }
            : { kind: "dashboard", id: child.id },
        ),
      };
    }
    if (item.kind === "group") {
      return {
        kind: "group",
        id: item.id,
        label: item.label,
        icon: item.icon,
        dashboards: item.dashboards.map((d) => d.id),
      };
    }
    return { kind: "dashboard", id: item.id };
  });
}

describe("dashboards structure", () => {
  let client: GridoneClient;
  const createdIds: string[] = [];

  beforeAll(async () => {
    client = await makeAdminClient();
  });

  afterEach(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop();
      if (id) {
        await client.dashboards.delete(id).catch(() => undefined);
      }
    }
  });

  async function createDashboard(name: string): Promise<string> {
    const created = await client.dashboards.create({
      type: "live",
      name: `acceptance-structure-${name}-${Date.now()}`,
    });
    createdIds.push(created.id);
    return created.id;
  }

  /** A section holding a dashboard and a group of two, placed after
   *  everything the instance already holds. */
  async function placeOneOfEach() {
    const cta = await createDashboard("cta");
    const west = await createDashboard("west");
    const east = await createDashboard("east");
    const ours = new Set([cta, west, east]);
    const others = refsOf(await client.dashboards.getStructure()).filter(
      (item) => !ours.has(item.id ?? ""),
    );
    const structure = await client.dashboards.updateStructure({
      items: [
        ...others,
        {
          kind: "section",
          label: "HVAC",
          items: [
            { kind: "dashboard", id: cta },
            {
              kind: "group",
              label: "DHW",
              icon: "droplets",
              dashboards: [west, east],
            },
          ],
        },
      ],
    });
    return { cta, west, east, others, structure };
  }

  it("places a new dashboard last at the root", async () => {
    const before = (await client.dashboards.getStructure()).items.length;
    const id = await createDashboard("root");

    const structure = await client.dashboards.getStructure();

    expect(refsOf(structure).slice(before)).toEqual([
      { kind: "dashboard", id },
    ]);
  });

  it("stores a nested structure with ids assigned and reads it back", async () => {
    const { others, structure, cta, west, east } = await placeOneOfEach();

    const section = structure.items[others.length];
    if (section?.kind !== "section") throw new Error("expected a section");
    expect(section.label).toBe("HVAC");
    expect(section.id).toMatch(/^[0-9a-f]{16}$/);
    const group = section.items[1];
    if (group?.kind !== "group") throw new Error("expected a group");
    expect(group.icon).toBe("droplets");
    expect(group.dashboards.map((d) => d.id)).toEqual([west, east]);
    expect(group.dashboards[0]).not.toHaveProperty("widgets");

    const fetched = await client.dashboards.getStructure();
    expect(fetched).toEqual(structure);
    expect((await client.dashboards.list()).map((d) => d.id).slice(-3)).toEqual(
      [cta, west, east],
    );
  });

  it("rejects a structure that does not place every dashboard (422)", async () => {
    const { others, structure, cta } = await placeOneOfEach();

    const error = await client.dashboards
      .updateStructure({ items: [...others, { kind: "dashboard", id: cta }] })
      .catch((e: unknown) => e);

    expect(isGridoneError(error) && error.status === 422).toBe(true);
    expect(await client.dashboards.getStructure()).toEqual(structure);
  });

  it("drops a deleted dashboard from the structure, nothing else", async () => {
    const { others, west, east } = await placeOneOfEach();

    await client.dashboards.delete(west);

    const section = refsOf(await client.dashboards.getStructure())[
      others.length
    ];
    expect(section).toMatchObject({
      kind: "section",
      items: [
        { kind: "dashboard" },
        { kind: "group", label: "DHW", dashboards: [east] },
      ],
    });
  });
});
