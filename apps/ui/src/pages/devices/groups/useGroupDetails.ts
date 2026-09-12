import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { usePermissions } from "@/contexts/AuthContext";
import { useDevicesList } from "@/hooks/useDevicesList";
import { controlSpecsOf } from "@/components/device-ui/presentationControls";
import type { ControlSpec } from "@/components/device-ui/runtime";
import { aggregateGroupAttributes } from "./groupAttributes";
import { useDeleteGroup, useDeviceGroup } from "./useDeviceGroups";
import { useGroupPresentation } from "./useGroupPresentation";
import { useGroupCommand } from "./useGroupCommand";
import { useGroupRuntime } from "./useGroupRuntime";

export function useGroupDetails(id: string) {
  const client = useGridoneClient();
  const can = usePermissions();
  const group = useDeviceGroup(id);
  const members = useDevicesList({ group_id: id });
  const driver = useQuery({
    queryKey: ["drivers", group.data?.driver_id],
    enabled: !!group.data,
    queryFn: () => client.drivers.get(group.data!.driver_id),
  });
  const presentation = useGroupPresentation(id);
  const command = useGroupCommand(id);
  const remove = useDeleteGroup(id);
  const [deleting, setDeleting] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const choose = useCallback((attribute: string) => setChosen(attribute), []);
  const currentMembers = useMemo(
    () =>
      members.devices.filter((device) =>
        group.data?.device_ids?.includes(device.id),
      ),
    [members.devices, group.data],
  );
  const attributes = useMemo(
    () =>
      driver.data
        ? aggregateGroupAttributes(
            driver.data,
            currentMembers,
            group.data?.device_ids?.length ?? 0,
          )
        : {},
    [driver.data, currentMembers, group.data],
  );
  const controls = useMemo<Record<string, ControlSpec>>(
    () =>
      presentation.document
        ? controlSpecsOf(presentation.document)
        : Object.fromEntries(
            Object.values(attributes)
              .filter((a) => a.read_write_modes.includes("write"))
              .map((a) => [
                a.name,
                {
                  kind:
                    a.data_type === "bool"
                      ? "toggle"
                      : a.data_type === "int" || a.data_type === "float"
                        ? "number"
                        : "select",
                  attribute: a.name,
                  label: a.label ?? { default: a.name },
                },
              ]),
          ),
    [presentation.document, attributes],
  );
  const canWrite = can("devices:write");
  const runtime = useGroupRuntime(
    attributes,
    controls,
    canWrite &&
      !!group.data?.device_ids?.length &&
      !command.busy &&
      !command.preview,
    command.prepare,
    choose,
  );
  return {
    group,
    members: { ...members, devices: currentMembers },
    driver,
    presentation,
    attributes,
    controls,
    runtime,
    command,
    remove,
    deleting,
    setDeleting,
    chosen,
    setChosen,
    choose,
    canWrite,
  };
}
