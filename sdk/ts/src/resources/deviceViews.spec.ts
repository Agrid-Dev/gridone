import { describe, expect, it, vi } from "vitest";
import { GridoneClient } from "../client";

function setup(result: unknown = {}) {
  const fetch = vi
    .fn()
    .mockImplementation(() => Promise.resolve(Response.json(result)));
  const client = new GridoneClient({ baseUrl: "https://gridone.test", fetch });
  return { client, fetch };
}

describe("device views and tag commands", () => {
  it("supports view CRUD with escaped IDs", async () => {
    const { client, fetch } = setup();
    await client.deviceViews.list();
    await client.deviceViews.get("g/1");
    const body = {
      name: "East",
      filter: { tags: { ecs: ["east"] } },
      group_by: ["floor", "room"],
    };
    await client.deviceViews.create(body);
    await client.deviceViews.update("g/1", body);
    await client.deviceViews.delete("g/1");
    expect(
      fetch.mock.calls.map(([url, options]) => [url, options.method]),
    ).toEqual([
      ["https://gridone.test/device-views", "GET"],
      ["https://gridone.test/device-views/g%2F1", "GET"],
      ["https://gridone.test/device-views", "POST"],
      ["https://gridone.test/device-views/g%2F1", "PUT"],
      ["https://gridone.test/device-views/g%2F1", "DELETE"],
    ]);
    expect(JSON.parse(fetch.mock.calls[2]![1].body)).toEqual(body);
  });
  it("uses separate preview and confirmation calls and preserves recipient IDs", async () => {
    const { client, fetch } = setup({ token: "snapshot", members: [] });
    await client.devices.previewCommand({
      target: { tags: { ecs: ["east"] }, driver_id: "driver" },
      attribute: "setpoint",
      value: 24,
      device_ids: ["a"],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://gridone.test/devices/commands/preview",
    );
    await client.devices.confirmCommand({
      token: "snapshot",
      device_ids: ["a"],
    });
    expect(fetch.mock.calls[1]![0]).toBe(
      "https://gridone.test/devices/commands/confirm",
    );
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({
      token: "snapshot",
      device_ids: ["a"],
    });
  });
  it("preserves tag filters in reusable templates", async () => {
    const { client, fetch } = setup();
    await client.devices.commandTemplates.create({
      name: "Comfort",
      target: { tags: { ecs: ["east"] }, driver_id: "driver", ids: ["a"] },
      write: { attribute: "setpoint", value: 24, data_type: "float" },
    });
    expect(JSON.parse(fetch.mock.calls[0]![1].body).target).toEqual({
      tags: { ecs: ["east"] },
      driver_id: "driver",
      ids: ["a"],
    });
  });
  it("exposes structured conflicts without retrying a confirmation", async () => {
    const detail = { code: "command_preview_changed", resources: [] };
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
      client.devices.confirmCommand({ token: "old", device_ids: ["a"] }),
    ).rejects.toMatchObject({ status: 409, rawDetail: detail });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

it("does not serialize an empty ID or type selection as an unrestricted GET", async () => {
  const { client, fetch } = setup();
  expect(await client.devices.list({ ids: [] })).toEqual([]);
  expect(await client.devices.list({ type: [] })).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});
