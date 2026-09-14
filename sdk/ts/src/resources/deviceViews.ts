import type { RequestFn } from "../http/httpClient";
import type { DeviceView, DeviceViewInput } from "../types";
const path = (id: string) => `/device-views/${encodeURIComponent(id)}`;

/** Shared display settings; command targets never refer to view IDs. */
export class DeviceViewsResource {
  constructor(private readonly request: RequestFn) {}
  list(): Promise<DeviceView[]> {
    return this.request("GET", "/device-views");
  }
  get(id: string): Promise<DeviceView> {
    return this.request("GET", path(id));
  }
  create(body: DeviceViewInput): Promise<DeviceView> {
    return this.request("POST", "/device-views", { body });
  }
  update(id: string, body: DeviceViewInput): Promise<DeviceView> {
    return this.request("PUT", path(id), { body });
  }
  delete(id: string): Promise<void> {
    return this.request("DELETE", path(id));
  }
}
