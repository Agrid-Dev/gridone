import { readFile } from "node:fs/promises";
import { isGridoneError } from "@gridone/sdk";
import { afterEach, expect, it } from "vitest";
import { makeAdminClient, makeRoleUser } from "../../lib/api";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const remove of cleanup.splice(0).reverse()) {
    try {
      await remove();
    } catch (error) {
      if (!isGridoneError(error) || error.status !== 404) throw error;
    }
  }
});

it("allows document writes granted to a custom role", async () => {
  const admin = await makeAdminClient();
  const roleId = `documents_writer_${Date.now()}`;
  await admin.users.createRole({
    id: roleId,
    name: "Document maintainer",
    permissions: ["documents:read", "documents:write"],
  });
  cleanup.push(() => admin.users.deleteRole(roleId));
  const maintainer = await makeRoleUser(roleId);
  cleanup.push(() => admin.users.delete(maintainer.userId));
  const document = await maintainer.client.documents.create(
    { name: "Maintenance notice" },
    new Blob(["notice"]),
    "notice.txt",
  );
  cleanup.push(() => admin.documents.delete(document.id));
  expect(document.created_by).toBe(maintainer.userId);
  const renamed = await maintainer.client.documents.update(document.id, {
    name: "Updated notice",
  });
  expect(renamed.name).toBe("Updated notice");
  await maintainer.client.documents.delete(document.id);
});

it("uploads, filters, renames and removes documents through the real SDK and API", async () => {
  const admin = await makeAdminClient();
  const suffix = Date.now();
  const roleId = `documents_${suffix}`;
  await admin.users.createRole({
    id: roleId,
    name: "Document reader",
    permissions: ["documents:read"],
  });
  cleanup.push(() => admin.users.deleteRole(roleId));
  const reader = await makeRoleUser(roleId);
  cleanup.push(() => admin.users.delete(reader.userId));
  const root = (await admin.assets.list()).find((asset) => !asset.parent_id)!;
  const asset = await admin.assets.create({
    name: `Documents building ${suffix}`,
    type: "building",
    parent_id: root.id,
  });
  cleanup.push(() => admin.assets.delete(asset.id));
  const driverId = `documents_${suffix}`;
  const yaml = await readFile(
    new URL("../../fixtures/webhook-room-driver.yaml", import.meta.url),
    "utf8",
  );
  await admin.drivers.create(driverId, {
    yaml: yaml.replace("id: acceptance_webhook_room", `id: ${driverId}`),
  });
  cleanup.push(() => admin.drivers.delete(driverId));
  const transport = await admin.transports.create({
    name: `Document links ${suffix}`,
    protocol: "webhook",
    config: { auth: "none" },
  });
  cleanup.push(() => admin.transports.delete(transport.id));
  const device = await admin.devices.create({
    name: "Document room",
    driver_id: driverId,
    transport_id: transport.id,
    config: { room_id: `room-${suffix}` },
  });
  cleanup.push(() => admin.devices.delete(device.id));

  const metadata = {
    name: `Notice été ${suffix}`,
    asset_ids: [asset.id],
    device_ids: [device.id],
  };
  const file = new Blob(["Notice été"], { type: "text/html" });
  const document = await admin.documents.create(metadata, file, "été.txt");
  cleanup.push(() => admin.documents.delete(document.id));
  const duplicate = await admin.documents.create(metadata, file, "été.txt");
  cleanup.push(() => admin.documents.delete(duplicate.id));
  expect(duplicate.id).not.toBe(document.id);
  expect(document.media_type).toBe("text/plain");
  expect(
    await (await reader.client.documents.download(document.id)).text(),
  ).toBe("Notice été");
  const listed = await reader.client.documents.list({
    q: "NOTICE ÉTÉ",
    asset_id: asset.id,
    device_id: device.id,
    size: 1,
  });
  expect(listed.total).toBe(2);
  expect(listed.items).toHaveLength(1);
  expect(listed.items[0]).not.toHaveProperty("content");
  await expect(
    admin.documents.create(metadata, file, "fake.pdf"),
  ).rejects.toMatchObject({ status: 422 });
  expect((await admin.documents.list({ asset_id: asset.id })).total).toBe(2);

  await admin.assets.delete(asset.id);
  await admin.devices.delete(device.id);
  const renamed = await admin.documents.update(document.id, {
    name: "Renamed",
  });
  expect(renamed.asset_ids).toEqual([asset.id]);
  expect(renamed.device_ids).toEqual([device.id]);
  expect(
    await (await reader.client.documents.download(document.id)).text(),
  ).toBe("Notice été");
  await admin.users.delete(reader.userId);
  // Role deletion is independent of document metadata.
  await admin.users.deleteRole(roleId);
  await admin.documents.delete(duplicate.id);
  await admin.documents.delete(document.id);
  await expect(admin.documents.get(document.id)).rejects.toMatchObject({
    status: 404,
  });
});

it("files documents in nested folders, hides an archived folder's contents from search and keeps a non-empty folder", async () => {
  const admin = await makeAdminClient();
  const suffix = String(Date.now());
  const plans = await admin.documents.createFolder({ name: `Plans ${suffix}` });
  cleanup.push(() => admin.documents.deleteFolder(plans.id));
  const level = await admin.documents.createFolder({
    name: "Level 1",
    parent_id: plans.id,
  });
  cleanup.push(() => admin.documents.deleteFolder(level.id));
  const filed = await admin.documents.create(
    { name: `Ground floor plan ${suffix}`, folder_id: level.id },
    new Blob(["plan"]),
    "plan.txt",
  );
  cleanup.push(() => admin.documents.delete(filed.id));
  const top = await admin.documents.create(
    { name: `Notice ${suffix}` },
    new Blob(["notice"]),
    "notice.txt",
  );
  cleanup.push(() => admin.documents.delete(top.id));
  expect(filed.folder_id).toBe(level.id);
  expect(top.folder_id ?? null).toBeNull();
  const ids = async (params: Parameters<typeof admin.documents.list>[0]) =>
    (await admin.documents.list(params)).items.map((document) => document.id);

  expect(await ids({ folder_id: level.id })).toEqual([filed.id]);
  expect(await ids({ top_level: true, q: suffix })).toEqual([top.id]);
  expect((await ids({ q: suffix })).sort()).toEqual([filed.id, top.id].sort());

  // Archiving the parent hides its whole subtree from search, not from browsing.
  const archived = await admin.documents.updateFolder(plans.id, {
    archived: true,
  });
  expect(archived.archived_at).not.toBeNull();
  expect(await ids({ q: suffix })).toEqual([top.id]);
  expect(await ids({ folder_id: level.id })).toEqual([filed.id]);
  await expect(admin.documents.deleteFolder(plans.id)).rejects.toMatchObject({
    status: 409,
  });

  await admin.documents.updateFolder(plans.id, { archived: false });
  const moved = await admin.documents.update(filed.id, {
    folder_id: null,
    archived: true,
  });
  expect(moved.folder_id).toBeNull();
  expect(moved.archived_at).not.toBeNull();
  expect(await ids({ archived: true, q: suffix })).toEqual([filed.id]);
  expect(await ids({ q: suffix })).toEqual([top.id]);

  // Empty now: both folders go, and a deleted folder cannot receive uploads.
  await admin.documents.deleteFolder(level.id);
  await admin.documents.deleteFolder(plans.id);
  expect(
    (await admin.documents.listFolders()).some((f) => f.id === plans.id),
  ).toBe(false);
  await expect(
    admin.documents.create(
      { name: "Ghost", folder_id: plans.id },
      new Blob(["ghost"]),
      "ghost.txt",
    ),
  ).rejects.toMatchObject({ status: 422 });
});
