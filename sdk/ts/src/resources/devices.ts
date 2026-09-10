import type { operations } from "../generated/openapi";
import type { RequestFn } from "../http/httpClient";
import type {
  AssetAssignment,
  AssetAssignmentResponse,
  AttributeCoverageResponse,
  AttributeLogs,
  BatchDeviceCommand,
  BatchDispatchResponse,
  Device,
  DeviceCreate,
  DeviceUpdate,
  FaultView,
  Page,
  PresentationResponse,
  SingleDeviceCommand,
  StandardAttributeSchema,
  TagGroupsResponse,
  TagValueBody,
  UnitCommand,
} from "../types";
import { CommandTemplatesResource } from "./commandTemplates";

export type DeviceListParams = NonNullable<
  operations["list_devices_devices__get"]["parameters"]["query"]
>;
export type DeviceAttributesParams = NonNullable<
  operations["list_device_attributes_devices_attributes_get"]["parameters"]["query"]
>;
export type DeviceTagGroupsParams =
  operations["list_device_tag_groups_devices_tag_groups_get"]["parameters"]["query"];
export type CommandListParams = NonNullable<
  operations["list_commands_devices_commands_get"]["parameters"]["query"]
>;
export type FaultListParams = NonNullable<
  operations["list_faults_devices_faults__get"]["parameters"]["query"]
>;

/** `client.devices` — CRUD, tags, commands, faults and attribute logs. */
export class DevicesResource {
  /** Reusable command templates (`/devices/commands/templates/`). */
  readonly commandTemplates: CommandTemplatesResource;

  constructor(private readonly request: RequestFn) {
    this.commandTemplates = new CommandTemplatesResource(request);
  }

  getPresentation(
    deviceId: string,
    options?: { revision?: string },
  ): Promise<PresentationResponse> {
    return this.request(
      "GET",
      `/devices/${encodeURIComponent(deviceId)}/presentation`,
      { searchParams: { revision: options?.revision } },
    );
  }

  getPresentationAsset(
    deviceId: string,
    revision: string,
    assetId: string,
  ): Promise<Blob> {
    return this.request(
      "GET",
      `/devices/${encodeURIComponent(deviceId)}/presentation/assets/${encodeURIComponent(assetId)}`,
      { searchParams: { revision }, responseType: "blob" },
    );
  }

  list(params?: DeviceListParams): Promise<Device[]> {
    return this.request("GET", "/devices/", { searchParams: params });
  }

  /** Reports attribute coverage over the device set matched by the filters. */
  listAttributes(
    params?: DeviceAttributesParams,
  ): Promise<AttributeCoverageResponse> {
    return this.request("GET", "/devices/attributes", { searchParams: params });
  }

  /**
   * Previews how the device set matched by the filters splits by
   * `params.tag_key` — one group per distinct tag value, plus an
   * `"untagged"` group for devices without the key.
   */
  listTagGroups(params: DeviceTagGroupsParams): Promise<TagGroupsResponse> {
    return this.request("GET", "/devices/tag-groups", { searchParams: params });
  }

  get(deviceId: string): Promise<Device> {
    return this.request("GET", `/devices/${encodeURIComponent(deviceId)}`);
  }

  create(params: DeviceCreate): Promise<Device> {
    return this.request("POST", "/devices/", { body: params });
  }

  update(deviceId: string, params: DeviceUpdate): Promise<Device> {
    return this.request("PATCH", `/devices/${encodeURIComponent(deviceId)}`, {
      body: params,
    });
  }

  delete(deviceId: string): Promise<void> {
    return this.request("DELETE", `/devices/${encodeURIComponent(deviceId)}`);
  }

  setTag(deviceId: string, key: string, value: string): Promise<Device> {
    const body: TagValueBody = { value };
    return this.request(
      "PUT",
      `/devices/${encodeURIComponent(deviceId)}/tags/${encodeURIComponent(key)}`,
      { body },
    );
  }

  /**
   * Moves several devices into zones in one call — the bulk form of
   * `setTag(deviceId, "asset_id", assetId)`.
   *
   * Every assignment is reported on its own (`applied`, `unchanged`, or
   * `failed` with a reason): the writes that went through stay applied, and
   * the caller retries the failures. Sending one device to two different
   * zones in the same call is rejected whole.
   */
  assignAssets(
    assignments: AssetAssignment[],
  ): Promise<AssetAssignmentResponse> {
    return this.request("POST", "/devices/asset-assignments", {
      body: { assignments },
    });
  }

  deleteTag(deviceId: string, key: string): Promise<void> {
    return this.request(
      "DELETE",
      `/devices/${encodeURIComponent(deviceId)}/tags/${encodeURIComponent(key)}`,
    );
  }

  /** Dispatches a command to one device attribute. */
  sendCommand(
    deviceId: string,
    params: SingleDeviceCommand,
  ): Promise<UnitCommand> {
    return this.request(
      "POST",
      `/devices/${encodeURIComponent(deviceId)}/commands`,
      { body: params },
    );
  }

  /** Dispatches one command to several devices at once. */
  sendBatchCommand(params: BatchDeviceCommand): Promise<BatchDispatchResponse> {
    return this.request("POST", "/devices/commands", { body: params });
  }

  listCommands(params?: CommandListParams): Promise<Page<UnitCommand>> {
    return this.request("GET", "/devices/commands", { searchParams: params });
  }

  listFaults(params?: FaultListParams): Promise<FaultView[]> {
    return this.request("GET", "/devices/faults/", { searchParams: params });
  }

  /** Standard attribute schemas for well-known device types. */
  getStandardTypes(): Promise<StandardAttributeSchema[]> {
    return this.request("GET", "/devices/standard-types");
  }

  getAttributeLogs(
    deviceId: string,
    attribute: string,
  ): Promise<AttributeLogs> {
    return this.request(
      "GET",
      `/devices/${encodeURIComponent(deviceId)}/${encodeURIComponent(attribute)}/logs`,
    );
  }
}
