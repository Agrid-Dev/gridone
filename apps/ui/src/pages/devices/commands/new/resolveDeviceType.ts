import { type Device, type DeviceType } from "@/api/devices";
import { lookupValueRenderer } from "@/components/AttributeValueBadge";

/** Returns the shared DeviceType if all devices resolve to the same renderer
 *  for a given (attributeName, value), otherwise undefined (plain text fallback). */
export function resolveSharedDeviceType(
  devices: Device[],
  attributeName: string,
  value: string,
): DeviceType | undefined {
  const types = [
    ...new Set(devices.map((d) => d.type).filter(Boolean)),
  ] as DeviceType[];
  if (types.length === 0) return undefined;
  const renderers = types.map((t) =>
    lookupValueRenderer(t, attributeName, value),
  );
  const first = renderers[0];
  if (
    first &&
    renderers.every((r) => r?.Icon === first.Icon && r?.color === first.color)
  ) {
    return types[0];
  }
  return undefined;
}
