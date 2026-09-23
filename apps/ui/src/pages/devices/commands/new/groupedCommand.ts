import type { AttributeLike } from "@/components/device-ui/runtime/controls";
import { z } from "zod";
import type {
  AttributeCoverage,
  Device,
  AttributeWritePayload,
  BatchDispatchResponse,
  ValueLabel,
} from "@gridone/sdk";
import {
  deviceAttributes,
  type AttributeValue,
  type DevicesFilter,
} from "@/lib/devices";
import { resolveConstraints } from "@/components/device-ui/runtime/controls";

export type CommandPayload = {
  target: DevicesFilter;
  write: AttributeWritePayload;
};
export type DispatchSnapshot = {
  payload: CommandPayload;
  devices: Device[];
  result?: BatchDispatchResponse;
  empty?: boolean;
  error?: Error;
};
export const commandValueSchema = z.object({
  value: z
    .union([z.string().min(1), z.number().finite(), z.boolean()])
    .optional()
    .refine((value) => value !== undefined),
});
export const templateNameSchema = z.object({ name: z.string().trim().min(1) });
export type CommandValues = z.infer<typeof commandValueSchema>;

/** The command as the page renders it: translated strings that never reach the
 *  server. Its wire counterpart is `CommandPayload`. */
export type CommandDisplay = {
  /** Where the command applies, in the user's words. */
  scope: string;
  label: string;
  unit?: string | null;
  /** Data type of the attribute over the selection, when they agree on one. */
  dataType?: string;
  /** Wording of a boolean's states, unanimous over the selection or absent. */
  valueLabels?: ValueLabel[] | null;
};

/** JSON preserves false, zero and numeric-looking strings in shared URLs. */
export function parseCommandValue(
  raw: string | null,
): AttributeValue | undefined {
  if (raw === null) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    const result = commandValueSchema.safeParse({ value });
    return result.success ? result.data.value : undefined;
  } catch {
    return raw || undefined;
  }
}

export function valueMatchesType(
  value: AttributeValue | undefined,
  dataType: string | undefined,
): boolean {
  if (value === undefined || value === "") return false;
  if (dataType === "bool") return typeof value === "boolean";
  if (dataType === "str") return typeof value === "string";
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (dataType === "float" || (dataType === "int" && Number.isInteger(value)))
  );
}

export function reportedValue(
  device: Device,
  attribute: string,
): AttributeValue | undefined {
  const value = deviceAttributes(device)[attribute]?.current_value;
  return typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
    ? value
    : undefined;
}

export function currentValues(
  devices: Device[],
  attribute: string,
): AttributeValue[] {
  return [
    ...new Set(
      devices.flatMap((device) => {
        const value = reportedValue(device, attribute);
        return value == null ? [] : [value];
      }),
    ),
  ];
}

export function currentRange(devices: Device[], attribute: string): string {
  const values = currentValues(devices, attribute);
  if (values.length > 1 && values.every((value) => typeof value === "number")) {
    return `${Math.min(...values)}–${Math.max(...values)}`;
  }
  return values.map(String).join(", ");
}

/** Native input hints use only shared literal bounds; references stay best-effort. */
export function inputBounds(coverage: AttributeCoverage | undefined) {
  const constraints = coverage?.write_state?.constraints;
  return {
    min:
      typeof constraints?.minimum === "number"
        ? constraints.minimum
        : undefined,
    max:
      typeof constraints?.maximum === "number"
        ? constraints.maximum
        : undefined,
    step: typeof constraints?.step === "number" ? constraints.step : undefined,
  };
}

export type ConstraintWarning = "minimum" | "maximum" | "step" | "options";

/** Preview known bounds using the latest sibling readings, matching the server's
 * zero-anchored step grid. These warnings never prevent best-effort dispatch. */
export function constraintWarnings(
  device: Device,
  attribute: string,
  value: AttributeValue | undefined,
) {
  const attr = deviceAttributes(device)[attribute] as AttributeLike | undefined;
  const constraints = resolveConstraints(attr?.write_state);
  const warnings: { kind: ConstraintWarning; bound: AttributeValue }[] = [];
  const options = attr?.write_state?.options
    ?.filter((option) => option.available)
    .map((option) => option.value);
  if (
    value !== undefined &&
    Array.isArray(options) &&
    options.length &&
    !options.includes(value)
  ) {
    warnings.push({ kind: "options", bound: options.join(", ") });
  }
  if (typeof value === "number") {
    if (constraints.minimum !== null && value < constraints.minimum)
      warnings.push({ kind: "minimum", bound: constraints.minimum });
    if (constraints.maximum !== null && value > constraints.maximum)
      warnings.push({ kind: "maximum", bound: constraints.maximum });
    if (
      constraints.step !== null &&
      Math.abs(
        value / constraints.step - Math.round(value / constraints.step),
      ) > 1e-9
    )
      warnings.push({ kind: "step", bound: constraints.step });
  }
  const dynamic =
    attr?.write_state?.candidate_required ||
    attr?.write_state?.missing_dependencies ||
    false;
  return { warnings, dynamic };
}
