import type { DeviceAttribute, DeviceType } from "@/api/devices";
import type { Severity } from "@/api/severity";
import { AttributeValueBadge } from "@/components/AttributeValueBadge";
import { formatValue } from "@/lib/formatValue";
import { isFaultAttribute } from "@/lib/faults";
import { cn } from "@/lib/utils";

/** Value colour for fault attributes: by severity when active, green when ok. */
const FAULT_VALUE_COLOR: Record<Severity, string> = {
  alert: "text-red-600",
  warning: "text-amber-600",
  info: "text-sky-600",
};
const FAULT_OK_COLOR = "text-green-600";

/**
 * Renders a device attribute's current value with the right formatter:
 *  - fault attributes are coloured by severity (green when not faulty);
 *  - standard enum values (e.g. thermostat `mode`) use their icon+label badge;
 *  - everything else falls back to {@link formatValue} by data type
 *    (floats to 2 decimals, etc.).
 */
export function AttributeValue({
  attribute,
  deviceType,
  className,
}: {
  attribute: DeviceAttribute;
  deviceType: DeviceType | null;
  className?: string;
}) {
  const fault = isFaultAttribute(attribute) ? attribute : null;
  if (fault) {
    const color = fault.isFaulty
      ? FAULT_VALUE_COLOR[fault.severity]
      : FAULT_OK_COLOR;
    return (
      <span className={cn("font-medium", color, className)}>
        {formatValue(attribute.currentValue, attribute.dataType)}
      </span>
    );
  }

  // Standard enums (mode, fan speed…) carry an icon + colour renderer; the
  // badge falls back to a plain label when none matches.
  if (deviceType && typeof attribute.currentValue === "string") {
    return (
      <AttributeValueBadge
        deviceType={deviceType}
        attributeName={attribute.name}
        value={attribute.currentValue}
        className={className}
      />
    );
  }

  return (
    <span className={className}>
      {formatValue(attribute.currentValue, attribute.dataType)}
    </span>
  );
}
