import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { usePermissions } from "@/contexts/AuthContext";
import type { Device, DevicesFilter } from "@gridone/sdk";
import { controlSpecsOf } from "@/components/device-ui/presentationControls";
import type { ControlSpec } from "@/components/device-ui/runtime";
import type { Scalar } from "@/components/device-ui/conditions";
import {
  aggregateGroupAttributes,
  aggregatePresentationState,
} from "./groupAttributes";
import { useGroupPresentation } from "./useGroupPresentation";
import { useGroupCommand } from "./useGroupCommand";
import { useGroupRuntime } from "./useGroupRuntime";

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
  const presentationState = useMemo(
    () => aggregatePresentationState(currentMembers),
    [currentMembers],
  );
  const command = useGroupCommand(filter);
  const [drafts, setDrafts] = useState<Record<string, Scalar>>({});
  const stage = useCallback((attribute: string, value: Scalar) => {
    setDrafts((current) =>
      current[attribute] === value
        ? current
        : { ...current, [attribute]: value },
    );
  }, []);
  const removeDraft = useCallback((attribute: string) => {
    setDrafts((current) => {
      const next = { ...current };
      delete next[attribute];
      return next;
    });
  }, []);
  const clearDrafts = useCallback(() => setDrafts({}), []);
  // Successful sends are removed even if another instruction fails. Retrying
  // the remaining drafts must never send an already accepted instruction again.
  useEffect(() => {
    if (!command.successfulWrites.length) return;
    setDrafts((current) => {
      const accepted = command.successfulWrites.filter(
        (write) =>
          Object.hasOwn(current, write.attribute) &&
          current[write.attribute] === write.value,
      );
      if (!accepted.length) return current;
      const next = { ...current };
      for (const write of accepted) delete next[write.attribute];
      return next;
    });
  }, [command.successfulWrites]);
  const writes = useMemo(
    () =>
      Object.entries(drafts).map(([attribute, value]) => ({
        attribute,
        value,
      })),
    [drafts],
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const choose = useCallback((attribute: string) => setChosen(attribute), []);
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
      presentation.document && presentationState
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
    [presentation.document, presentationState, attributes],
  );
  const canWrite = can("devices:write");
  const runtime = useGroupRuntime(
    attributes,
    controls,
    canWrite && !!currentMembers.length && !command.busy && !command.preview,
    stage,
    choose,
    drafts,
    presentationState,
  );
  return {
    members: { devices: currentMembers },
    driver,
    presentation,
    presentationState,
    attributes,
    controls,
    runtime,
    command,
    chosen,
    setChosen,
    choose,
    canWrite,
    drafts,
    writes,
    stage,
    removeDraft,
    clearDrafts,
  };
}
