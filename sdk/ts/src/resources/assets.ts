import type { operations } from "../generated/openapi";
import type { RequestFn } from "../http/httpClient";
import type {
  Asset,
  AssetCommand,
  AssetCreate,
  AssetUpdate,
  BatchDispatchResponse,
  BuildingProfile,
  ReorderRequest,
} from "../types";

export type AssetListParams = NonNullable<
  operations["list_assets_assets__get"]["parameters"]["query"]
>;

/** Node of the asset tree; shape is deployment-defined, hence untyped. */
export type AssetTreeNode = Record<string, unknown>;

/** `client.assets` — spatial hierarchy, asset commands and the building profile. */
export class AssetsResource {
  constructor(private readonly request: RequestFn) {}

  list(params?: AssetListParams): Promise<Asset[]> {
    return this.request("GET", "/assets/", { searchParams: params });
  }

  get(assetId: string): Promise<Asset> {
    return this.request("GET", `/assets/${encodeURIComponent(assetId)}`);
  }

  create(params: AssetCreate): Promise<Asset> {
    return this.request("POST", "/assets/", { body: params });
  }

  /** Full replace (`PUT`). */
  update(assetId: string, params: AssetUpdate): Promise<Asset> {
    return this.request("PUT", `/assets/${encodeURIComponent(assetId)}`, {
      body: params,
    });
  }

  delete(assetId: string): Promise<void> {
    return this.request("DELETE", `/assets/${encodeURIComponent(assetId)}`);
  }

  /** JSON schema describing asset objects. */
  getSchema(): Promise<Record<string, unknown>> {
    return this.request("GET", "/assets/schema");
  }

  getTree(): Promise<AssetTreeNode[]> {
    return this.request("GET", "/assets/tree");
  }

  getTreeWithDevices(): Promise<AssetTreeNode[]> {
    return this.request("GET", "/assets/tree-with-devices");
  }

  reorderChildren(assetId: string, params: ReorderRequest): Promise<void> {
    return this.request(
      "PUT",
      `/assets/${encodeURIComponent(assetId)}/children/order`,
      { body: params },
    );
  }

  /** Dispatches a command to devices under the asset. */
  sendCommand(
    assetId: string,
    params: AssetCommand,
  ): Promise<BatchDispatchResponse> {
    return this.request(
      "POST",
      `/assets/${encodeURIComponent(assetId)}/commands`,
      { body: params },
    );
  }

  /** Ids of the devices attached to the asset. */
  listDevices(assetId: string): Promise<string[]> {
    return this.request(
      "GET",
      `/assets/${encodeURIComponent(assetId)}/devices`,
    );
  }

  getBuildingProfile(): Promise<BuildingProfile> {
    return this.request("GET", "/assets/profile");
  }

  setBuildingProfile(params: BuildingProfile): Promise<BuildingProfile> {
    return this.request("PUT", "/assets/profile", { body: params });
  }

  /** JSON schema describing the building profile. */
  getBuildingProfileSchema(): Promise<Record<string, unknown>> {
    return this.request("GET", "/assets/profile/schema");
  }
}
