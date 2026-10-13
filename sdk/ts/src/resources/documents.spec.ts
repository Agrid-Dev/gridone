import { describe, expect, it, vi } from "vitest";
import { GridoneClient } from "../client";
import { DocumentsResource } from "./documents";
import type { RequestFn } from "../http/httpClient";

describe("documents", () => {
  it("uploads metadata and the original filename without overriding the multipart boundary", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "doc" }), {
        headers: { "Content-Type": "application/json" },
        status: 201,
      }),
    );
    const client = new GridoneClient({
      baseUrl: "https://gridone.test",
      fetch,
    });
    await expect(
      client.documents.create(
        { name: "Notice" },
        new Blob(["notice"]),
        "été.txt",
      ),
    ).resolves.toEqual({ id: "doc" });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://gridone.test/documents");
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
    const form = init.body as FormData;
    expect(JSON.parse(form.get("metadata") as string)).toEqual({
      name: "Notice",
    });
    expect((form.get("file") as File).name).toBe("été.txt");
    expect(await (form.get("file") as File).text()).toBe("notice");
  });

  it("keeps pagination filters and safely encodes document ids for every action", async () => {
    const request = vi.fn<RequestFn>().mockResolvedValue({});
    const documents = new DocumentsResource(request as RequestFn);
    await documents.list({
      q: "notice",
      asset_id: "b",
      device_id: "d",
      page: 2,
    });
    expect(request).toHaveBeenLastCalledWith("GET", "/documents", {
      searchParams: { q: "notice", asset_id: "b", device_id: "d", page: 2 },
    });
    await documents.get("a/b");
    expect(request).toHaveBeenLastCalledWith("GET", "/documents/a%2Fb");
    await documents.update("a/b", { name: "Renamed" });
    expect(request).toHaveBeenLastCalledWith("PATCH", "/documents/a%2Fb", {
      body: { name: "Renamed" },
    });
    await documents.delete("a/b");
    expect(request).toHaveBeenLastCalledWith("DELETE", "/documents/a%2Fb");
    await documents.uploadPolicy();
    expect(request).toHaveBeenLastCalledWith("GET", "/documents/upload-policy");
  });

  it("returns original binary bytes from a download", async () => {
    const bytes = new Uint8Array([0, 1, 255]);
    const fetch = vi.fn().mockResolvedValue(
      new Response(bytes, {
        headers: { "Content-Type": "application/octet-stream" },
      }),
    );
    const client = new GridoneClient({
      baseUrl: "https://gridone.test",
      fetch,
    });
    const blob = await client.documents.download("doc");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });
});
