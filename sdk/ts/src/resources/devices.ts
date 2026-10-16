import type { operations } from "../generated/openapi";
import type { RequestFn } from "../http/httpClient";
import type {
  TagFacet,
  BulkTagRequest,
  RenameTagRequest,
  TagMutationResult,
  SelectionCommandPrepare,
  SelectionCommandPreview,
  SelectionCommandConfirm,
  AssetAssignment,
  AssetAssignmentResponse,
  AttributeCoverageResponse,
  AttributeLogs,
  BatchDeviceCommand,
  BatchDispatchResponse,
  Device,
  DeviceFacets,
  DevicesPage,
  SingleCommandPreview,
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
/** The device filters alone: what selects a device set, without paging. */
export type DeviceFilterParams = Omit<
  DeviceListParams,
  "page" | "size" | "sort_by"
>;
/** The filters and the order, for a listing that walks every page. */
export type DeviceListAllParams = Omit<DeviceListParams, "page" | "size">;
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

/** Empty arrays disappear from query strings, so preserve the empty selection locally. */
function hasEmptySelection(params?: DeviceFilterParams): boolean {
  return (
    params?.ids?.length === 0 ||
    params?.type?.length === 0 ||
    params?.tags?.length === 0
  );
}

/** The largest page the API serves; `listAll` walks pages of this size. */
const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;

const NO_FACETS: DeviceFacets = {
  type: {},
  health: { healthy: 0, faulty: 0 },
  connection_status: { idle: 0, ok: 0, degraded: 0, error: 0 },
};

/** The page an empty selection would get, without asking the API for it. */
function emptyPage(params?: DeviceListParams): DevicesPage {
  const size = params?.size ?? DEFAULT_PAGE_SIZE;
  const link = `/devices/?page=1&size=${size}`;
  return {
    items: [],
    total: 0,
    page: 1,
    size,
    total_pages: 0,
    links: { self: link, first: link, last: link },
    facets: NO_FACETS,
  };
}

/** `client.devices` — CRUD, tags, commands, faults and attribute logs. */
export class DevicesResource {
  /** Reusable command templates (`/devices/commands/templates/`). */
  readonly commandTemplates: CommandTemplatesResource;

  constructor(private readonly request: RequestFn) {
    this.commandTemplates = new CommandTemplatesResource(request);
  }

  listTags(params?: DeviceFilterParams): Promise<TagFacet[]> {
    if (hasEmptySelection(params)) return Promise.resolve([]);
    return this.request("GET", "/devices/tags", { searchParams: params });
  }
  bulkTags(body: BulkTagRequest): Promise<TagMutationResult[]> {
    return this.request("POST", "/devices/tags/bulk", { body });
  }
  renameTag(body: RenameTagRequest): Promise<TagMutationResult[]> {
    return this.request("POST", "/devices/tags/rename", { body });
  }
  previewCommand(
    body: SelectionCommandPrepare,
  ): Promise<SelectionCommandPreview> {
    return this.request("POST", "/devices/commands/preview", { body });
  }
  confirmCommand(
    body: SelectionCommandConfirm,
  ): Promise<BatchDispatchResponse> {
    return this.request("POST", "/devices/commands/confirm", { body });
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

  /**
   * One page of the devices the filters match (100 by default, 500 at
   * most), in `sort_by` order, with `facets` counting the whole match. The
   * cost of a call follows the page size, not the size of the site.
   */
  list(params?: DeviceListParams): Promise<DevicesPage> {
    if (hasEmptySelection(params)) return Promise.resolve(emptyPage(params));
    return this.request("GET", "/devices/", { searchParams: params });
  }

  /**
   * Every device the filters match, in `sort_by` order, read page by page.
   * The pages are read together, so a device created or deleted meanwhile
   * may be missed or seen twice; read `list` when one page is enough.
   */
  async listAll(params?: DeviceListAllParams): Promise<Device[]> {
    if (hasEmptySelection(params)) return [];
    const first = await this.list({ ...params, size: MAX_PAGE_SIZE });
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, first.total_pages - 1) }, (_, i) =>
        this.list({ ...params, size: MAX_PAGE_SIZE, page: i + 2 }),
      ),
    );
    return [first, ...rest].flatMap((page) => page.items);
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

  /** Acquires the attribute and its declared dependencies; never sends a command. */
  refreshAttribute(
    deviceId: string,
    attribute: string,
  ): Promise<NonNullable<Device["attributes"]>[string]> {
    return this.request(
      "POST",
      `/devices/${encodeURIComponent(deviceId)}/attributes/${encodeURIComponent(attribute)}/refresh`,
    );
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

  setTag(deviceId: string, key: string, values: string[]): Promise<Device> {
    const body: TagValueBody = { values };
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

  /** Evaluates a candidate without dispatching or creating command history. */
  previewDeviceCommand(
    deviceId: string,
    params: SingleDeviceCommand,
  ): Promise<SingleCommandPreview> {
    return this.request(
      "POST",
      `/devices/${encodeURIComponent(deviceId)}/commands/preview`,
      { body: params },
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
