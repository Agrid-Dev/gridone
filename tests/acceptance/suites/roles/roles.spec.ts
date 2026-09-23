import {
  isGridoneError,
  type GridoneClient,
  type Role,
  type RoleCreate,
} from "@gridone/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeAdminClient, makeRoleClient, makeRoleUser } from "../../lib/api";

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
// instead of a hard-coded enum. Built-ins live in code; custom roles are
// stored documents an admin manages over the API (AGR-1208).
describe("roles", () => {
  let admin: GridoneClient;
  let viewer: GridoneClient;

  beforeAll(async () => {
    admin = await makeAdminClient();
    viewer = await makeRoleClient("viewer");
  });

  it("serves the built-in roles to any authenticated user", async () => {
    const roles = await viewer.users.listRoles();
    const builtins = roles.filter((role: Role) => role.builtin);

    expect(builtins.map((role: Role) => role.id)).toEqual([
      "admin",
      "operator",
      "viewer",
    ]);
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

  it("keeps the built-in roles immutable", async () => {
    expect(
      await statusOf(admin.users.updateRole("operator", { name: "Renamed" })),
    ).toBe(409);
    expect(await statusOf(admin.users.deleteRole("viewer"))).toBe(409);
  });

  // A scope narrows a permission the role holds; only devices:read accepts
  // one for now (AGR-1209). What a scoped role is served is scopes.spec.ts.
  it.each<{
    case: string;
    permissions: RoleCreate["permissions"];
    scopes: RoleCreate["scopes"];
  }>([
    {
      case: "a scope on devices:command, not scopable yet",
      permissions: ["devices:read", "devices:command"],
      scopes: { "devices:command": [{ devices: { types: ["thermostat"] } }] },
    },
    {
      case: "an empty scope list",
      permissions: ["devices:read"],
      scopes: { "devices:read": [] },
    },
    {
      case: "a scope on a permission the role does not hold",
      permissions: ["timeseries:read"],
      scopes: { "devices:read": [{ devices: { types: ["thermostat"] } }] },
    },
  ])("rejects $case", async ({ permissions, scopes }) => {
    const role: RoleCreate = {
      id: `acceptance_scoped_${Date.now()}`,
      name: "Scoped",
      permissions,
      scopes,
    };

    expect(await statusOf(admin.users.createRole(role))).toBe(422);
  });

  it("reserves roles:write for the built-in admin", async () => {
    const status = await statusOf(
      admin.users.createRole({
        id: `acceptance_minter_${Date.now()}`,
        name: "Minter",
        permissions: ["roles:read", "roles:write"],
      }),
    );

    expect(status).toBe(422);
  });

  it("refuses role creation to an operator", async () => {
    const operator = await makeRoleClient("operator");

    const status = await statusOf(
      operator.users.createRole({
        id: `acceptance_denied_${Date.now()}`,
        name: "Denied",
        permissions: ["devices:read"],
      }),
    );

    expect(status).toBe(403);
  });
});

// The AGR-1118 integration account: everything except user and role
// management. Exercises the whole custom-role lifecycle end to end.
describe("a custom integration role", () => {
  const roleId = `integration_${Date.now()}`;
  let admin: GridoneClient;
  let integration: GridoneClient;
  let integrationUserId: string;

  beforeAll(async () => {
    admin = await makeAdminClient();
    const builtins = await admin.users.listRoles();
    const everything =
      builtins.find((role: Role) => role.id === "admin")?.permissions ?? [];
    await admin.users.createRole({
      id: roleId,
      name: "Integration",
      description: "Everything except user and role management.",
      permissions: everything.filter(
        (permission) =>
          !permission.startsWith("users:") && permission !== "roles:write",
      ),
    });
    ({ client: integration, userId: integrationUserId } =
      await makeRoleUser(roleId));
  });

  afterAll(async () => {
    await admin.users.delete(integrationUserId).catch(() => undefined);
    await admin.users.deleteRole(roleId).catch(() => undefined);
  });

  it("is served with builtin: false among the roles", async () => {
    const role = await integration.users.getRole(roleId);

    expect(role.builtin).toBe(false);
    expect(role.permissions).toContain("devices:read");
    expect(role.permissions).not.toContain("users:read");
  });

  it("gates requests by the role's permissions", async () => {
    expect(await statusOf(integration.users.list())).toBe(403);
    expect(await statusOf(integration.devices.list())).toBeNull();
  });

  it("applies a permission edit on the next request, without re-login", async () => {
    const role = await admin.users.getRole(roleId);
    await admin.users.updateRole(roleId, {
      permissions: role.permissions.filter(
        (permission) => permission !== "devices:read",
      ),
    });

    expect(await statusOf(integration.devices.list())).toBe(403);

    await admin.users.updateRole(roleId, { permissions: role.permissions });
    expect(await statusOf(integration.devices.list())).toBeNull();
  });

  it("cannot be deleted while a user holds it, and can once the user is gone", async () => {
    expect(await statusOf(admin.users.deleteRole(roleId))).toBe(409);

    await admin.users.delete(integrationUserId);

    expect(await statusOf(admin.users.deleteRole(roleId))).toBeNull();
    expect(await statusOf(admin.users.getRole(roleId))).toBe(404);
  });
});

// users:write alone must not be a path to admin: a role can only be granted
// by a caller who already holds every permission it carries.
describe("a users:write role", () => {
  const roleId = `support_${Date.now()}`;
  let admin: GridoneClient;
  let support: GridoneClient;
  let supportUserId: string;
  let bystanderId: string;

  beforeAll(async () => {
    admin = await makeAdminClient();
    await admin.users.createRole({
      id: roleId,
      name: "Support",
      permissions: ["users:read", "users:write", "roles:read"],
    });
    ({ client: support, userId: supportUserId } = await makeRoleUser(roleId));
    ({ userId: bystanderId } = await makeRoleUser("viewer"));
  });

  afterAll(async () => {
    await admin.users.delete(bystanderId).catch(() => undefined);
    await admin.users.delete(supportUserId).catch(() => undefined);
    await admin.users.deleteRole(roleId).catch(() => undefined);
  });

  it("cannot promote itself, another user, or a new user to admin", async () => {
    expect(
      await statusOf(support.users.update(supportUserId, { role: "admin" })),
    ).toBe(403);
    expect(
      await statusOf(support.users.update(bystanderId, { role: "admin" })),
    ).toBe(403);
    expect(
      await statusOf(
        support.users.create({
          username: `acceptance-escalated-${Date.now()}`,
          password: "acceptance-pass",
          role: "operator",
        }),
      ),
    ).toBe(403);
  });

  it("can assign a role it fully covers", async () => {
    const moved = await support.users.update(bystanderId, { role: roleId });

    expect(moved.role).toBe(roleId);
  });
});
