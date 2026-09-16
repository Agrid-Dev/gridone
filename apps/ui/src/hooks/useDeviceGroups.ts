import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Device } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import {
  GROUP_TAG_KEY,
  groupTagValue,
} from "@/components/group-command/groupMembership";
import { useDeviceViews } from "@/hooks/useDeviceViews";
import { tagValues } from "@/lib/devices";

export type DeviceGroup = {
  /** Opaque value of the device's `group` tag — a command target, never shown. */
  value: string;
  /** The view's name, which is what the user reads. */
  name: string;
};

/**
 * The groups a device belongs to, named.
 *
 * Membership lives on the device (the multi-valued `group` tag) while the
 * name lives on the view that filters on that tag, so the two are joined
 * here. There is no "groups of a device" endpoint and none is needed: both
 * sides are already in the query cache.
 */
export function useDeviceGroups(device: Device) {
  const views = useDeviceViews();
  const groups = useMemo<DeviceGroup[]>(() => {
    const memberships = new Set(tagValues(device.tags, GROUP_TAG_KEY));
    if (!memberships.size) return [];
    return (views.data ?? []).flatMap((view) => {
      const value = groupTagValue(view);
      return value && memberships.has(value)
        ? [{ value, name: view.name }]
        : [];
    });
  }, [device.tags, views.data]);
  return { groups, loading: views.isLoading };
}

/**
 * The devices the targeted group holds.
 *
 * Only the selected group is fetched, and only while one is selected: this is
 * the reach of the next gesture, and knowing it before touching a control is
 * the point — the confirmation screen already lists the recipients, but by
 * then the setpoint is chosen.
 */
export function useGroupMembers(value: string | null): Device[] | null {
  const client = useGridoneClient();
  const query = useQuery({
    queryKey: ["device-group-members", value],
    queryFn: () => client.devices.list({ tags: [`${GROUP_TAG_KEY}:${value}`] }),
    enabled: !!value,
    staleTime: 30_000,
  });
  return query.data ?? null;
}
