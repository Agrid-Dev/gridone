import { describe, expect, it, vi } from "vitest";
import { GridoneClient } from "../client";
import { MemoryTokenStorage } from "../http/tokenStorage";

describe("device presentations", () => {
  it("fetches a document at the requested revision", async () => {
    const response = {
      status: "unavailable",
      revision: "r/1",
      diagnostics: [],
    };
    const fetch = vi.fn().mockResolvedValue(Response.json(response));
    const client = new GridoneClient({
      baseUrl: "https://gridone.test",
      fetch,
    });
    expect(
      await client.devices.getPresentation("d/1", { revision: "r/1" }),
    ).toEqual(response);
    expect(fetch).toHaveBeenCalledWith(
      "https://gridone.test/devices/d%2F1/presentation?revision=r%2F1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("downloads authenticated binary resources without tokens in URLs", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 255]);
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(bytes, { headers: { "Content-Type": "image/png" } }),
      );
    const tokenStorage = new MemoryTokenStorage();
    await tokenStorage.setTokens({
      accessToken: "private-access",
      refreshToken: "private-refresh",
    });
    const client = new GridoneClient({
      baseUrl: "https://gridone.test",
      fetch,
      tokenStorage,
    });
    const result = await client.devices.getPresentationAsset(
      "d/1",
      "r/1",
      "a/1",
    );
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(bytes);
    expect(result.type).toBe("image/png");
    expect(fetch).toHaveBeenCalledWith(
      "https://gridone.test/devices/d%2F1/presentation/assets/a%2F1?revision=r%2F1",
      expect.objectContaining({
        headers: { Authorization: "Bearer private-access" },
      }),
    );
  });

  it("exposes the schema namespace", async () => {
    const schema = {
      versions: [1],
      capabilities: [],
      budgets: {},
      json_schema: {},
    };
    const fetch = vi.fn().mockResolvedValue(Response.json(schema));
    const client = new GridoneClient({
      baseUrl: "https://gridone.test",
      fetch,
    });
    expect(await client.presentations.schema()).toEqual(schema);
    expect(fetch).toHaveBeenCalledWith(
      "https://gridone.test/presentations/schema",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns revision conflicts without retrying the stale read", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { detail: "Presentation revision changed" },
          { status: 409 },
        ),
      );
    const client = new GridoneClient({
      baseUrl: "https://gridone.test",
      fetch,
    });
    await expect(
      client.devices.getPresentation("device", { revision: "old" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
