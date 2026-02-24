import snakecaseKeys from "snakecase-keys";
import { request } from "./request";

export type Asset = {
  id: string;
  parentId: string | null;
  type: string;
  name: string;
  path: string[];
  position: number;
};

export type DeviceRef = {
  id: string;
  name: string;
};

export type AssetTreeNode = Asset & {
  children: AssetTreeNode[];
  devices?: DeviceRef[];
};

export type AssetCreatePayload = {
  name: string;
  type: string;
  parentId?: string | null;
};

export type AssetUpdatePayload = {
  name?: string;
  type?: string;
  parentId?: string | null;
};

export const ASSET_TYPES = [
  "org",
  "building",
  "floor",
  "room",
  "zone",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

/** Fetch Pydantic JSON schema for AssetCreate (used to build Zod validation). */
export function getAssetSchema(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/assets/schema");
}

export function listAssets(params?: {
  parentId?: string;
  type?: string;
}): Promise<Asset[]> {
  const query = new URLSearchParams();
  if (params?.parentId) query.set("parent_id", params.parentId);
  if (params?.type) query.set("type", params.type);
  const qs = query.toString();
  return request<Asset[]>(`/assets/${qs ? `?${qs}` : ""}`, undefined, {
    camelCase: true,
  });
}

export function getAsset(assetId: string): Promise<Asset> {
  return request<Asset>(
    `/assets/${encodeURIComponent(assetId)}`,
    undefined,
    { camelCase: true },
  );
}

export function getAssetTree(): Promise<AssetTreeNode[]> {
  return request<AssetTreeNode[]>("/assets/tree", undefined, {
    camelCase: true,
  });
}

export function getAssetTreeWithDevices(): Promise<AssetTreeNode[]> {
  return request<AssetTreeNode[]>("/assets/tree-with-devices", undefined, {
    camelCase: true,
  });
}

export function createAsset(payload: AssetCreatePayload): Promise<Asset> {
  return request<Asset>(
    "/assets/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        snakecaseKeys(payload as Record<string, unknown>, { deep: true }),
      ),
    },
    { camelCase: true },
  );
}

export function updateAsset(
  assetId: string,
  payload: AssetUpdatePayload,
): Promise<Asset> {
  return request<Asset>(
    `/assets/${encodeURIComponent(assetId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        snakecaseKeys(payload as Record<string, unknown>, { deep: true }),
      ),
    },
    { camelCase: true },
  );
}

export function reorderChildren(
  parentId: string,
  orderedIds: string[],
): Promise<void> {
  return request<void>(
    `/assets/${encodeURIComponent(parentId)}/children/order`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordered_ids: orderedIds }),
    },
  );
}

export function deleteAsset(assetId: string): Promise<void> {
  return request<void>(`/assets/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
  });
}

export function listAssetDevices(assetId: string): Promise<string[]> {
  return request<string[]>(
    `/assets/${encodeURIComponent(assetId)}/devices`,
  );
}

export function linkDevice(
  assetId: string,
  deviceId: string,
): Promise<void> {
  return request<void>(
    `/assets/${encodeURIComponent(assetId)}/devices`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId }),
    },
  );
}

export function unlinkDevice(
  assetId: string,
  deviceId: string,
): Promise<void> {
  return request<void>(
    `/assets/${encodeURIComponent(assetId)}/devices/${encodeURIComponent(deviceId)}`,
    { method: "DELETE" },
  );
}
