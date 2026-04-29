export const RESOURCE_TYPES = [
  "device",
  "driver",
  "transport",
  "command",
  "automation",
  "fault",
  "asset",
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type ResourceReference = {
  type: ResourceType;
  id: string;
};

const URI_PATTERN = /^resource:\/\/([^/]+)\/(.+)$/;

export function parseResourceReference(uri: string): ResourceReference | null {
  const match = URI_PATTERN.exec(uri);
  if (!match) return null;
  const [, rawType, id] = match;
  if (!(RESOURCE_TYPES as readonly string[]).includes(rawType)) return null;
  return { type: rawType as ResourceType, id };
}

export function serializeResourceReference(ref: ResourceReference): string {
  return `resource://${ref.type}/${ref.id}`;
}

export function resourceTypeToPath(type: ResourceType, id: string): string {
  switch (type) {
    case "device":
      return `/devices/${id}`;
    case "driver":
      return `/drivers/${id}`;
    case "transport":
      return `/transports/${id}`;
    case "asset":
      return `/assets/${id}`;
    case "automation":
      return `/automations/${id}`;
    case "fault":
      return "/faults";
    case "command":
      return "/devices/commands";
  }
}
