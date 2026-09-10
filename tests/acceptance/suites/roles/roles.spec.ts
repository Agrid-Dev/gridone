import { isGridoneError, type GridoneClient, type Role } from "@gridone/sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { makeAdminClient, makeRoleClient } from "../../lib/api";

interface CurrentUser {
  role: string;
  permissions: string[];
}

async function statusOf(promise: Promise<unknown>): Promise<number | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return isGridoneError(error) ? error.status : null;
  }
}

// Roles are served by the API: the UI builds the role select from this list
// instead of a hard-coded enum. Built-ins are the only roles until AGR-1208.
describe("roles", () => {
  let admin: GridoneClient;
  let viewer: GridoneClient;

  beforeAll(async () => {
    admin = await makeAdminClient();
    viewer = await makeRoleClient("viewer");
  });

  it("serves the built-in roles to any authenticated user", async () => {
    const roles = await viewer.users.listRoles();

    expect(roles.map((role: Role) => role.id)).toEqual([
      "admin",
      "operator",
      "viewer",
    ]);
    expect(roles.every((role: Role) => role.builtin)).toBe(true);
  });

  it("lists, for each built-in role, the permissions its users hold", async () => {
    const roles = await viewer.users.listRoles();
    const byId = new Map(roles.map((role: Role) => [role.id, role]));
    const adminMe = await admin.request<CurrentUser>("GET", "/auth/me");
    const viewerMe = await viewer.request<CurrentUser>("GET", "/auth/me");

    expect(byId.get("admin")?.permissions).toEqual(adminMe.permissions);
    expect(byId.get("viewer")?.permissions).toEqual(viewerMe.permissions);
  });

  it("answers 404 for an unknown role id", async () => {
    expect(await statusOf(viewer.users.getRole("ghost"))).toBe(404);
  });

  it("refuses to create a user with an unknown role", async () => {
    const status = await statusOf(
      admin.users.create({
        username: `acceptance-ghost-${Date.now()}`,
        password: "acceptance-pass",
        role: "ghost",
      }),
    );

    expect(status).toBe(422);
  });
});
