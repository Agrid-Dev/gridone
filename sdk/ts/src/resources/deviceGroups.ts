import type { RequestFn } from "../http/httpClient";
import type {
  DeviceGroup,
  DeviceGroupCreate,
  DeviceGroupUpdate,
  GroupCommandPrepare,
  GroupCommandPreview,
  GroupCommandConfirm,
  BatchDispatchResponse,
  RelatedResource,
  PresentationResponse,
} from "../types";

const path = (id: string) => `/devices/groups/${encodeURIComponent(id)}`;

/** Shared groups. Manual writes always require a preview token. */
export class DeviceGroupsResource {
  constructor(private readonly request: RequestFn) {}

  list(): Promise<DeviceGroup[]> {
    return this.request("GET", "/devices/groups");
  }
  get(id: string): Promise<DeviceGroup> {
    return this.request("GET", path(id));
  }
  create(body: DeviceGroupCreate): Promise<DeviceGroup> {
    return this.request("POST", "/devices/groups", { body });
  }
  update(id: string, body: DeviceGroupUpdate): Promise<DeviceGroup> {
    return this.request("PATCH", path(id), { body });
  }
  delete(id: string): Promise<void> {
    return this.request("DELETE", path(id));
  }
  references(id: string): Promise<RelatedResource[]> {
    return this.request("GET", `${path(id)}/references`);
  }
  getPresentation(id: string): Promise<PresentationResponse | null> {
    return this.request("GET", `${path(id)}/presentation`);
  }
  getPresentationAsset(
    id: string,
    revision: string,
    assetId: string,
  ): Promise<Blob> {
    return this.request(
      "GET",
      `${path(id)}/presentation/assets/${encodeURIComponent(assetId)}`,
      { searchParams: { revision }, responseType: "blob" },
    );
  }
  preview(id: string, body: GroupCommandPrepare): Promise<GroupCommandPreview> {
    return this.request("POST", `${path(id)}/commands/preview`, { body });
  }
  confirm(
    id: string,
    body: GroupCommandConfirm,
  ): Promise<BatchDispatchResponse> {
    return this.request("POST", `${path(id)}/commands`, { body });
  }
}
