import type { RequestFn } from "../http/httpClient";
import type {
  Protection,
  ProtectionDefinition,
  ProtectionView,
  ProtectionUpdate,
  ProtectionRetire,
  ProtectionSchemas,
} from "../types";

const path = (id: string) => `/protections/${encodeURIComponent(id)}`;

export class ProtectionsResource {
  constructor(private readonly request: RequestFn) {}

  schemas(): Promise<ProtectionSchemas> {
    return this.request("GET", "/protections/schema");
  }
  list(deviceId?: string): Promise<ProtectionView[]> {
    return this.request("GET", "/protections/", {
      searchParams: { device_id: deviceId },
    });
  }
  get(id: string): Promise<ProtectionView> {
    return this.request("GET", path(id));
  }
  create(body: ProtectionDefinition): Promise<Protection> {
    return this.request("POST", "/protections/", { body });
  }
  update(id: string, body: ProtectionUpdate): Promise<Protection> {
    return this.request("PUT", path(id), { body });
  }
  history(id: string): Promise<Protection[]> {
    return this.request("GET", `${path(id)}/history`);
  }
  retire(id: string, body: ProtectionRetire): Promise<Protection> {
    return this.request("POST", `${path(id)}/retire`, { body });
  }
}
