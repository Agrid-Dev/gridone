import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Device } from "@gridone/sdk";
import { loadPresentationAssets, type LoadedAssets } from "./assets";
import type { PresentationDiagnostic, PresentationV1 } from "./document";
import {
  resolvePresentation,
  type PresentationEnvelope,
} from "./resolvePresentation";

/**
 * The presentation projection the API serves for a device and revision
 * (ADR §5): the validated document with its asset digests, or the reason
 * it is unavailable.
 */
export type PresentationResponse =
  | {
      status: "available";
      revision: string;
      document: PresentationEnvelope;
      assets: Record<string, { sha256: string; media_type: string }>;
    }
  | {
      status: "unavailable";
      revision: string;
      diagnostics: PresentationDiagnostic[];
    };

export type PresentationApi = {
  getPresentation(
    deviceId: string,
    revision: string,
  ): Promise<PresentationResponse>;
  getAsset(deviceId: string, revision: string, assetId: string): Promise<Blob>;
};

export type DevicePresentationState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "unavailable"; diagnostics: PresentationDiagnostic[] }
  | { status: "available"; document: PresentationV1; assets: LoadedAssets };

/** The revision the device currently points at, if its driver has a presentation. */
export function presentationRevision(device: Device): string | null {
  return device.presentation_ref?.revision ?? null;
}

/**
 * Load a device's presentation once per revision — never per telemetry
 * value — then its assets as Blob URLs, and resolve the browser's own
 * compatibility with the document. Any missing asset or unsupported
 * capability makes the whole presentation unavailable with diagnostics;
 * the page then shows the standard content. Assets are revoked when the
 * revision changes or the page goes away.
 */
export function useDevicePresentation(
  device: Device,
  api: PresentationApi,
): DevicePresentationState {
  const revision = presentationRevision(device);
  const query = useQuery({
    queryKey: ["device-presentation", device.id, revision],
    queryFn: () => api.getPresentation(device.id, revision ?? ""),
    enabled: revision !== null,
    staleTime: Infinity,
    retry: false,
  });

  const [assets, setAssets] = useState<
    | { revision: string; loaded: LoadedAssets }
    | { revision: string; error: true }
    | null
  >(null);

  const response = query.data;
  const resolution =
    response?.status === "available"
      ? resolvePresentation(response.document)
      : null;
  const document =
    resolution?.status === "available" ? resolution.document : null;

  useEffect(() => {
    if (!document || revision === null) return;
    let cancelled = false;
    let loaded: LoadedAssets | null = null;
    loadPresentationAssets(document, (assetId) =>
      api.getAsset(device.id, revision, assetId),
    ).then(
      (result) => {
        if (cancelled) {
          result.revoke();
          return;
        }
        loaded = result;
        setAssets({ revision, loaded: result });
      },
      () => {
        if (!cancelled) setAssets({ revision, error: true });
      },
    );
    return () => {
      cancelled = true;
      loaded?.revoke();
      setAssets(null);
    };
  }, [document, revision, device.id, api]);

  if (revision === null) return { status: "none" };
  if (query.isPending) return { status: "loading" };
  if (query.isError) {
    return {
      status: "unavailable",
      diagnostics: [{ code: "invalid_document", message: "fetch failed" }],
    };
  }
  if (response?.status === "unavailable") {
    return { status: "unavailable", diagnostics: response.diagnostics };
  }
  if (resolution?.status === "unavailable") {
    return { status: "unavailable", diagnostics: resolution.diagnostics };
  }
  if (!document || assets === null || assets.revision !== revision) {
    return { status: "loading" };
  }
  if ("error" in assets || assets.loaded.missing.length > 0) {
    const missing = "error" in assets ? [] : assets.loaded.missing;
    return {
      status: "unavailable",
      diagnostics:
        missing.length > 0
          ? missing.map((id) => ({
              code: "asset_unavailable",
              path: `/assets/${id}`,
            }))
          : [{ code: "asset_unavailable" }],
    };
  }
  return { status: "available", document, assets: assets.loaded };
}
