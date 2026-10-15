import { tagValues } from "@/lib/devices";
import { useSearchParams } from "react-router";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useDeviceView } from "@/hooks/useDeviceViews";
import { groupedValues, drilldownFilter } from "./viewFilters";
import { groupTagValue } from "@/components/group-command/groupMembership";

export function useViewDetails(id: string) {
  const view = useDeviceView(id);
  const members = useDevicesList(view.data?.filter ?? {});
  const [params, setParams] = useSearchParams();
  const path = params.getAll("value").slice(0, view.data?.group_by.length ?? 0);
  const filter = drilldownFilter(
    view.data?.filter ?? {},
    view.data?.group_by ?? [],
    path,
  );
  const devices = members.devices.filter((device) =>
    Object.entries(filter.tags ?? {}).every(([key, values]) =>
      values.some((value) => tagValues(device.tags, key).includes(value)),
    ),
  );
  const key = view.data?.group_by[path.length];
  const groups = key ? groupedValues(devices, key, filter) : [];
  const untagged = key
    ? devices.filter((device) => !tagValues(device.tags, key).length)
    : [];
  const driverIds = [
    ...new Set(devices.map((device) => device.driver_id)),
  ].sort();
  const isGroup = !!view.data && groupTagValue(view.data) !== null;
  const selectPath = (values: string[]) =>
    setParams(values.map((value): [string, string] => ["value", value]));
  return {
    view,
    isGroup,
    members,
    filter,
    path,
    devices,
    key,
    groups,
    untagged,
    driverIds,
    selectPath,
  };
}
