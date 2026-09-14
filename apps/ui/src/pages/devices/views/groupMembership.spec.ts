import { describe, expect, it, vi } from "vitest";
import type { BulkTagRequest, DeviceView, GridoneClient } from "@gridone/sdk";
import {
  GroupMembershipError,
  groupTagValue,
  saveGroupMembers,
} from "./groupMembership";

describe("group membership through ordinary tags", () => {
  it("reconciles partial writes on retry and preserves overlapping memberships", async () => {
    const members = new Map([
      ["a", ["other"]],
      ["b", ["other"]],
    ]);
    let fail = true;
    const bulkTags = vi.fn(async (body: BulkTagRequest) =>
      body.target.ids!.map((id) => {
        if (id === "b" && fail) return { device_id: id, status: "failed" };
        const values = new Set(members.get(id));
        for (const value of body.values) {
          if (body.operation === "add") values.add(value);
          else values.delete(value);
        }
        members.set(id, [...values]);
        return { device_id: id, status: "changed" };
      }),
    );
    const client = {
      devices: {
        list: async () =>
          [...members]
            .filter(([, values]) => values.includes("comfort"))
            .map(([id]) => ({ id })),
        bulkTags,
      },
    } as unknown as GridoneClient;
    await expect(
      saveGroupMembers(client, "comfort", ["a", "b"]),
    ).rejects.toBeInstanceOf(GroupMembershipError);
    expect(members.get("a")).toEqual(["other", "comfort"]);
    expect(members.get("b")).toEqual(["other"]);
    fail = false;
    await saveGroupMembers(client, "comfort", ["a", "b"]);
    expect(bulkTags.mock.lastCall![0].target.ids).toEqual(["b"]);
    await saveGroupMembers(client, "comfort", []);
    expect([...members.values()]).toEqual([["other"], ["other"]]);
    bulkTags.mockClear();
    await saveGroupMembers(client, "comfort", []);
    expect(bulkTags).not.toHaveBeenCalled();
  });

  it("keeps views with additional criteria out of the membership editor", () => {
    const view = {
      group_by: [],
      filter: { tags: { group: ["comfort"] } },
    } as unknown as DeviceView;
    expect(groupTagValue(view)).toBe("comfort");
    expect(groupTagValue({ ...view, group_by: ["floor"] })).toBeNull();
    expect(
      groupTagValue({
        ...view,
        filter: { ...view.filter, driver_id: "driver" },
      }),
    ).toBeNull();
    expect(
      groupTagValue({
        ...view,
        filter: { tags: { group: ["comfort"], floor: ["2"] } },
      }),
    ).toBeNull();
    expect(
      groupTagValue({ ...view, filter: { ...view.filter, types: [] } }),
    ).toBeNull();
  });
});
