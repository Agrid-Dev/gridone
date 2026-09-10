import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Device } from "@gridone/sdk";
import {
  useDevicePresentation,
  type PresentationApi,
  type PresentationResponse,
} from "../useDevicePresentation";
import type { PresentationEnvelope } from "../resolvePresentation";

afterEach(cleanup);

const envelope: PresentationEnvelope = {
  schema_version: 1,
  requires: ["layout/1"],
  assets: { bezel: { path: "assets/bezel.png" } },
  bindings: {},
  controls: {},
  page: { kind: "stack", children: [] },
};

const available: PresentationResponse = {
  status: "available",
  revision: "r1",
  document: envelope,
  assets: { bezel: { sha256: "abc", media_type: "image/png" } },
};

function deviceWith(revision: string | null): Device {
  return {
    id: "dev-1",
    name: "d",
    attributes: {},
    presentation_ref: revision ? { revision } : null,
  } as unknown as Device;
}

function fakeApi(
  overrides: Partial<PresentationApi> = {},
): PresentationApi & { revoked: string[] } {
  const api = {
    getPresentation: vi.fn(async () => available),
    getAsset: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
    revoked: [] as string[],
    ...overrides,
  };
  return api;
}

function setup(device: Device, api: PresentationApi) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(({ d }: { d: Device }) => useDevicePresentation(d, api), {
    wrapper,
    initialProps: { d: device },
  });
}

// jsdom has no createImageBitmap / Blob URLs: stub the browser bits.
vi.stubGlobal("createImageBitmap", async () => ({
  width: 10,
  height: 5,
  close() {},
}));
const urls: string[] = [];
vi.stubGlobal("URL", {
  ...URL,
  createObjectURL: (blob: Blob) => {
    const url = `blob:${urls.length}-${blob.size}`;
    urls.push(url);
    return url;
  },
  revokeObjectURL: vi.fn(),
});

describe("useDevicePresentation", () => {
  it("is none for a device whose driver declares no presentation", () => {
    const api = fakeApi();
    const { result } = setup(deviceWith(null), api);
    expect(result.current).toEqual({ status: "none" });
    expect(api.getPresentation).not.toHaveBeenCalled();
  });

  it("loads the document once per revision, then its assets", async () => {
    const api = fakeApi();
    const { result, rerender } = setup(deviceWith("r1"), api);
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("available"));
    const state = result.current;
    if (state.status !== "available") throw new Error("unreachable");
    expect(state.document.schema_version).toBe(1);
    expect(state.assets.assetUrl("bezel")).toMatch(/^blob:/);
    expect(api.getPresentation).toHaveBeenCalledWith("dev-1", "r1");
    expect(api.getAsset).toHaveBeenCalledWith("dev-1", "r1", "bezel");
    // A telemetry update re-renders the hook without touching the network.
    rerender({ d: deviceWith("r1") });
    expect(api.getPresentation).toHaveBeenCalledTimes(1);
    expect(api.getAsset).toHaveBeenCalledTimes(1);
  });

  it("relays the server's diagnostics", async () => {
    const api = fakeApi({
      getPresentation: vi.fn(async () => ({
        status: "unavailable" as const,
        revision: "r1",
        diagnostics: [
          { code: "missing_binding" as const, path: "/bindings/x" },
        ],
      })),
    });
    const { result } = setup(deviceWith("r1"), api);
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current).toMatchObject({
      diagnostics: [{ code: "missing_binding", path: "/bindings/x" }],
    });
    expect(api.getAsset).not.toHaveBeenCalled();
  });

  it("checks the browser's own compatibility before fetching any asset", async () => {
    const api = fakeApi({
      getPresentation: vi.fn(async () => ({
        ...available,
        document: { ...envelope, requires: ["hologram/1"] },
      })),
    });
    const { result } = setup(deviceWith("r1"), api);
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current).toMatchObject({
      diagnostics: [{ code: "unsupported_capability", message: "hologram/1" }],
    });
    expect(api.getAsset).not.toHaveBeenCalled();
  });

  it("falls back as a whole when an asset is missing", async () => {
    const api = fakeApi({
      getAsset: vi.fn(async () => {
        throw new Error("404");
      }),
    });
    const { result } = setup(deviceWith("r1"), api);
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current).toMatchObject({
      diagnostics: [{ code: "asset_unavailable", path: "/assets/bezel" }],
    });
  });

  it("reloads and revokes on a revision change", async () => {
    const api = fakeApi();
    const { result, rerender } = setup(deviceWith("r1"), api);
    await waitFor(() => expect(result.current.status).toBe("available"));
    await act(async () => {
      rerender({ d: deviceWith("r2") });
    });
    await waitFor(() =>
      expect(api.getPresentation).toHaveBeenCalledWith("dev-1", "r2"),
    );
    await waitFor(() => expect(result.current.status).toBe("available"));
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(api.getAsset).toHaveBeenCalledTimes(2);
  });
});
