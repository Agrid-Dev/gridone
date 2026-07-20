import { isGridoneError, type GridoneClient } from "@gridone/sdk";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { makeAdminClient } from "../../lib/api";

describe("dashboards CRUD", () => {
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

  async function createDashboard(): Promise<string> {
    const created = await client.dashboards.create({
      name: `acceptance-dashboard-${createdIds.length}-${Date.now()}`,
      description: "created by acceptance",
    });
    createdIds.push(created.id);
    return created.id;
  }

  it("creates a dashboard and reads it back", async () => {
    const id = await createDashboard();

    const fetched = await client.dashboards.get(id);

    expect(fetched.id).toBe(id);
    expect(fetched.widgets).toEqual([]);
    expect(fetched.layout).toEqual([]);
  });

  it("lists dashboards as summaries without widgets or layout", async () => {
    const id = await createDashboard();

    const summaries = await client.dashboards.list();
    const summary = summaries.find((d) => d.id === id);

    expect(summary).toBeDefined();
    expect(summary).not.toHaveProperty("widgets");
    expect(summary).not.toHaveProperty("layout");
  });

  it("updates name and description and persists the change", async () => {
    const id = await createDashboard();

    const updated = await client.dashboards.update(id, {
      name: "Renamed",
      description: "new description",
    });

    expect(updated.name).toBe("Renamed");
    expect(updated.description).toBe("new description");
    expect((await client.dashboards.get(id)).name).toBe("Renamed");
  });

  it("deletes a dashboard, after which it is not found", async () => {
    const id = await createDashboard();
    createdIds.pop(); // deleting here; skip afterEach cleanup

    await client.dashboards.delete(id);

    let error: unknown = null;
    try {
      await client.dashboards.get(id);
    } catch (caught) {
      error = caught;
    }
    expect(isGridoneError(error) && error.status === 404).toBe(true);
  });

  it("rejects a create with an unknown field with a 422", async () => {
    let error: unknown = null;
    try {
      await client.dashboards.create({
        name: "x",
        bogus: 1,
      } as unknown as Parameters<typeof client.dashboards.create>[0]);
    } catch (caught) {
      error = caught;
    }
    expect(isGridoneError(error) && error.status === 422).toBe(true);
  });
});
