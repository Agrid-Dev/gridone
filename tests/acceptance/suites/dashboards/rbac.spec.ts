import { isGridoneError, type GridoneClient } from "@gridone/sdk";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { makeAdminClient, makeClient, makeRoleClient } from "../../lib/api";

// Dashboards RBAC: admin + operator can write; viewer is read-only; an
// unauthenticated request is 401. Establishes the 403/role pattern for the
// acceptance suite (previously only 401 was covered, in the auth suite).
describe("dashboards RBAC", () => {
  let admin: GridoneClient;
  let operator: GridoneClient;
  let viewer: GridoneClient;
  const createdIds: string[] = [];

  beforeAll(async () => {
    admin = await makeAdminClient();
    operator = await makeRoleClient("operator");
    viewer = await makeRoleClient("viewer");
  });

  afterEach(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop();
      if (id) {
        await admin.dashboards.delete(id).catch(() => undefined);
      }
    }
  });

  async function seedDashboard(): Promise<string> {
    const created = await admin.dashboards.create({
      name: `acceptance-rbac-${createdIds.length}-${Date.now()}`,
    });
    createdIds.push(created.id);
    return created.id;
  }

  async function statusOf(promise: Promise<unknown>): Promise<number | null> {
    try {
      await promise;
      return null;
    } catch (error) {
      return isGridoneError(error) ? error.status : -1;
    }
  }

  it("lets an operator create a dashboard", async () => {
    const created = await operator.dashboards.create({
      name: `acceptance-rbac-op-${Date.now()}`,
    });
    createdIds.push(created.id);

    expect(created.id).toBeDefined();
  });

  it("lets a viewer read dashboards", async () => {
    const id = await seedDashboard();

    const fetched = await viewer.dashboards.get(id);

    expect(fetched.id).toBe(id);
  });

  it("forbids a viewer from creating a dashboard (403)", async () => {
    const status = await statusOf(
      viewer.dashboards.create({ name: "should-fail" }),
    );

    expect(status).toBe(403);
  });

  it("forbids a viewer from adding a widget (403)", async () => {
    const id = await seedDashboard();

    const status = await statusOf(
      viewer.dashboards.addWidget(id, {
        config: { type: "text", text: "x", color: "#1a2b3c" },
      }),
    );

    expect(status).toBe(403);
  });

  it("rejects an unauthenticated write with a 401", async () => {
    const anon = makeClient();

    const status = await statusOf(
      anon.dashboards.create({ name: "should-fail" }),
    );

    expect(status).toBe(401);
  });

  it("rejects an unauthenticated read with a 401", async () => {
    const anon = makeClient();

    const status = await statusOf(anon.dashboards.list());

    expect(status).toBe(401);
  });
});
