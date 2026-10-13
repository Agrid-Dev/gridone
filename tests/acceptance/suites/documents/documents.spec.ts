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
