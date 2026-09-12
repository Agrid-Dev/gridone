import { describe, expect, it, vi } from "vitest";
import { GridoneClient } from "../client";

function setup(result: unknown = {}) {
  const fetch = vi
    .fn()
    .mockImplementation(() => Promise.resolve(Response.json(result)));
  const client = new GridoneClient({ baseUrl: "https://gridone.test", fetch });
  return { client, fetch };
}

describe("device groups", () => {
  it("supports CRUD and references with escaped IDs", async () => {
    const { client, fetch } = setup();
    await client.devices.groups.list();
    await client.devices.groups.get("g/1");
    const body = { name: "East", driver_id: "driver", device_ids: ["a"] };
    await client.devices.groups.create(body);
    await client.devices.groups.update("g/1", { name: "East", device_ids: [] });
    await client.devices.groups.references("g/1");
    await client.devices.groups.delete("g/1");
    expect(
      fetch.mock.calls.map(([url, options]) => [url, options.method]),
    ).toEqual([
      ["https://gridone.test/devices/groups", "GET"],
      ["https://gridone.test/devices/groups/g%2F1", "GET"],
      ["https://gridone.test/devices/groups", "POST"],
      ["https://gridone.test/devices/groups/g%2F1", "PATCH"],
      ["https://gridone.test/devices/groups/g%2F1/references", "GET"],
      ["https://gridone.test/devices/groups/g%2F1", "DELETE"],
    ]);
    expect(JSON.parse(fetch.mock.calls[2]![1].body)).toEqual(body);
  });
  it("uses separate preview and confirmation calls and preserves recipient IDs", async () => {
    const { client, fetch } = setup({ token: "snapshot", members: [] });
    await client.devices.groups.preview("g", {
      attribute: "setpoint",
      value: 24,
      device_ids: ["a"],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://gridone.test/devices/groups/g/commands/preview",
    );
    await client.devices.groups.confirm("g", {
      token: "snapshot",
      device_ids: ["a"],
    });
    expect(fetch.mock.calls[1]![0]).toBe(
      "https://gridone.test/devices/groups/g/commands",
    );
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({
      token: "snapshot",
      device_ids: ["a"],
    });
  });
  it("preserves group filters in reusable templates", async () => {
    const { client, fetch } = setup();
    await client.devices.commandTemplates.create({
      name: "Comfort",
      target: { group_id: "group", ids: ["a"] },
      write: { attribute: "setpoint", value: 24, data_type: "float" },
    });
    expect(JSON.parse(fetch.mock.calls[0]![1].body).target).toEqual({
      group_id: "group",
      ids: ["a"],
    });
  });
  it("exposes structured conflicts without retrying a confirmation", async () => {
    const detail = { code: "group_preview_changed", resources: [] };
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ detail }, { status: 409 })),
      );
    const client = new GridoneClient({
      baseUrl: "https://gridone.test",
      fetch,
    });
    await expect(
      client.devices.groups.confirm("g", { token: "old", device_ids: ["a"] }),
    ).rejects.toMatchObject({ status: 409, rawDetail: detail });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
