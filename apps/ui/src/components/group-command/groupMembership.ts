import type { Device, DeviceView, GridoneClient } from "@gridone/sdk";
import { tagValues } from "@/lib/devices";

// UI convention only: membership remains an ordinary multi-valued device tag.
export const GROUP_TAG_KEY = "group";

/** Generate an opaque tag value, including on local HTTP installations where
 * crypto.randomUUID is unavailable. The view carries the human-readable name.
 */
export function createGroupTagValue(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function groupTagValue(view: DeviceView): string | null {
  const filter = view.filter;
  const tags = filter?.tags ?? {};
  const values = tagValues(tags, GROUP_TAG_KEY);
  return view.group_by.length === 0 &&
    !filter?.driver_id &&
    filter?.ids == null &&
    filter?.types == null &&
    Object.keys(tags).length === 1 &&
    values.length === 1
    ? values[0]
    : null;
}

export function groupMembers(devices: Device[], value: string) {
  return devices.filter((device) =>
    tagValues(device.tags, GROUP_TAG_KEY).includes(value),
  );
}

export class GroupMembershipError extends Error {
  constructor(readonly deviceIds: string[]) {
    super("Some group memberships could not be saved");
  }
}

/** Re-read membership on every attempt so retries reconcile partial writes.
 * Only this group's value is added/removed; other groups and tags are preserved.
 */
export async function saveGroupMembers(
  client: GridoneClient,
  value: string,
  selectedIds: string[],
) {
  const current = await client.devices.list({
    tags: [`${GROUP_TAG_KEY}:${value}`],
  });
  const currentIds = new Set(current.map((device) => device.id));
  const selected = new Set(selectedIds);
  const changes = [
    {
      operation: "add" as const,
      ids: [...selected].filter((id) => !currentIds.has(id)),
    },
    {
      operation: "remove" as const,
      ids: [...currentIds].filter((id) => !selected.has(id)),
    },
  ];
  for (const { operation, ids } of changes) {
    if (!ids.length) continue;
    const results = await client.devices.bulkTags({
      target: { ids },
      key: GROUP_TAG_KEY,
      values: [value],
      operation,
    });
    const completed = new Set(
      results
        .filter((result) => result.status !== "failed")
        .map((result) => result.device_id),
    );
    const failed = ids.filter((id) => !completed.has(id));
    if (failed.length) throw new GroupMembershipError(failed);
  }
}
