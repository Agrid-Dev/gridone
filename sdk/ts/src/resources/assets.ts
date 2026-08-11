import type { operations } from "../generated/openapi";
import type { RequestFn } from "../http/httpClient";
import type {
  Asset,
  AssetCommand,
  AssetCreate,
  AssetUpdate,
  BatchDispatchResponse,
  BuildingModel,
  BuildingProfile,
  ModelSpace,
  ReorderRequest,
  TreeImportResponse,
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

  /**
   * Uploads an IFC file on a building asset (multipart) and starts its
   * server-side conversion; the returned model is in `processing` status.
   */
  uploadModel(
    assetId: string,
    file: Blob,
    filename?: string,
  ): Promise<BuildingModel> {
    const form = new FormData();
    if (filename !== undefined) {
      form.append("file", file, filename);
    } else {
      form.append("file", file);
    }
    return this.request(
      "POST",
      `/assets/${encodeURIComponent(assetId)}/model`,
      {
        body: form,
      },
    );
  }

  /** Conversion status and summaries of the building's 3D model. */
  getModel(assetId: string): Promise<BuildingModel> {
    return this.request("GET", `/assets/${encodeURIComponent(assetId)}/model`);
  }

  /**
   * Converted 3D scene as a binary glTF blob.
   *
   * Pass the model's `updated_at` as *version*: the scene is served with
   * immutable caching, so the URL must change when the model is replaced.
   */
  getModelScene(assetId: string, version?: string): Promise<Blob> {
    return this.request(
      "GET",
      `/assets/${encodeURIComponent(assetId)}/model/scene.glb`,
      { responseType: "blob", searchParams: { v: version } },
    );
  }

  /** Spaces (rooms) extracted from the building's 3D model. */
  getModelSpaces(assetId: string): Promise<ModelSpace[]> {
    return this.request(
      "GET",
      `/assets/${encodeURIComponent(assetId)}/model/spaces`,
    );
  }

  deleteModel(assetId: string): Promise<void> {
    return this.request(
      "DELETE",
      `/assets/${encodeURIComponent(assetId)}/model`,
    );
  }

  /**
   * Replaces the building subtree with floors/rooms from the 3D model.
   * Destructive: device links of the replaced subtree are cleared.
   */
  importModelTree(assetId: string): Promise<TreeImportResponse> {
    return this.request(
      "POST",
      `/assets/${encodeURIComponent(assetId)}/model/import-tree`,
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
