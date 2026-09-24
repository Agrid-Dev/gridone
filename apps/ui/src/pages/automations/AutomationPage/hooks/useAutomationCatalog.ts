import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { WriteCondition } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import type { AttributeCatalog } from "@/pages/devices/device/operating-rules/expressions";

/** Every device, for the attribute pickers and the names on the tree. */
export function useAutomationCatalog(): AttributeCatalog {
  const client = useGridoneClient();
  const { data: devices = [] } = useQuery({
    queryKey: ["devices", undefined],
    queryFn: () => client.devices.list(),
    staleTime: 10_000,
  });
  return useMemo(() => ({ devices }), [devices]);
}

/** The server's JSON schema for an automation, `$defs` included. */
export function useAutomationSchema() {
  const client = useGridoneClient();
  return useQuery({
    queryKey: ["automations", "schema"],
    queryFn: () => client.automations.schema(),
    staleTime: Infinity,
  });
}

/**
 * Whether every device reference in a condition names a device and an
 * attribute — the part an operator leaves blank while building a condition.
 * Walks plain objects and arrays, e.g. `{op: "all", conditions: [...]}`.
 */
export function referencesChosen(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(referencesChosen);
  if (!value || typeof value !== "object") return true;
  const record = value as Record<string, unknown>;
  if ("device_id" in record && "attribute" in record)
    return Boolean(record.device_id) && Boolean(record.attribute);
  return Object.values(record).every(referencesChosen);
}

/**
 * Decide whether a condition can be saved: every reference chosen, and — once
 * the schema has loaded — valid against the server's own `Condition` schema,
 * so the editor never accepts what the API would refuse.
 */
export function useConditionCompleteness(): (
  condition: WriteCondition,
) => boolean {
  const { data: schema } = useAutomationSchema();
  return useMemo(() => {
    const defs = schema?.$defs as
      | Record<string, z.core.JSONSchema.JSONSchema>
      | undefined;
    const validator = defs?.Condition
      ? z.fromJSONSchema({ $ref: "#/$defs/Condition", $defs: defs })
      : null;
    return (condition: WriteCondition) =>
      referencesChosen(condition) &&
      (validator === null || validator.safeParse(condition).success);
  }, [schema]);
}
