import { operatingRulesPath } from "./operating-rules/useOperatingRules";

/** Sections that show the device at work. */
export type SupervisionSection = "overview" | "history" | "commands";
/** Sections that configure the device. */
export type ConfigSection = "general" | "operatingRules" | "automations";
export type DeviceSection = SupervisionSection | ConfigSection;

const CONFIG_SECTIONS: readonly DeviceSection[] = [
  "general",
  "operatingRules",
  "automations",
];

export const devicePath = (deviceId: string) =>
  `/devices/${encodeURIComponent(deviceId)}`;

export const deviceConfigPath = (deviceId: string) =>
  `${devicePath(deviceId)}/config`;

/** The section of the device page that `pathname` belongs to. Nested routes
 *  keep their section: `config/edit` is General, an operating rule's editor is
 *  Operating rules, `history/chart` is History. */
export function deviceSection(
  pathname: string,
  deviceId: string,
): DeviceSection {
  const base = devicePath(deviceId);
  const config = deviceConfigPath(deviceId);
  if (pathname.startsWith(operatingRulesPath(deviceId))) {
    return "operatingRules";
  }
  if (pathname.startsWith(`${config}/automations`)) return "automations";
  if (pathname.startsWith(config)) return "general";
  if (pathname.startsWith(`${base}/history`)) return "history";
  if (pathname.startsWith(`${base}/commands`)) return "commands";
  return "overview";
}

export const isConfigSection = (
  section: DeviceSection,
): section is ConfigSection => CONFIG_SECTIONS.includes(section);
