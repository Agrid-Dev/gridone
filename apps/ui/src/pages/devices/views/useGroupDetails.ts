import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { usePermissions } from "@/contexts/AuthContext";
import type { Device, DevicesFilter } from "@gridone/sdk";
import { controlSpecsOf } from "@/components/device-ui/presentationControls";
import type { ControlSpec } from "@/components/device-ui/runtime";
import { aggregateGroupAttributes } from "@/components/group-command/groupAttributes";
import { useGroupTarget } from "@/components/group-command/useGroupTarget";
import { useGroupPresentation } from "./useGroupPresentation";

export function useGroupDetails(
  driverId: string,
  filter: DevicesFilter,
  currentMembers: Device[],
) {
  const client = useGridoneClient();
  const can = usePermissions();
  const driver = useQuery({
    queryKey: ["drivers", driverId],
    queryFn: () => client.drivers.get(driverId),
  });
  const presentation = useGroupPresentation(driverId);
  const attributes = useMemo(
    () =>
      driver.data
        ? aggregateGroupAttributes(
            driver.data,
            currentMembers,
            currentMembers.length,
          )
        : {},
    [driver.data, currentMembers],
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
  const target = useGroupTarget(
    filter,
    attributes,
    controls,
    canWrite && !!currentMembers.length,
  );
  return {
    members: { devices: currentMembers },
    driver,
    presentation,
    attributes,
    controls,
    canWrite,
    ...target,
  };
}
