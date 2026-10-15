import { describe, expect, it, vi } from "vitest";
import { GridoneClient } from "../client";
import { DocumentsResource } from "./documents";
import type { RequestFn } from "../http/httpClient";

describe("documents", () => {
  it.each([
    { name: "Notice" },
    {
      name: "Notice",
      asset_ids: ["building", "room"],
      device_ids: ["boiler", "chiller"],
    },
    { name: "Notice", asset_ids: [], device_ids: [] },
    { name: "Notice", folder_id: "plans" },
    { name: "Notice", folder_id: null },
  ])(
    "uploads typed form fields and the original filename without overriding the multipart boundary: %j",
    async (metadata) => {
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
        client.documents.create(metadata, new Blob(["notice"]), "été.txt"),
      ).resolves.toEqual({ id: "doc" });
      const [url, init] = fetch.mock.calls[0]!;
      expect(url).toBe("https://gridone.test/documents");
      expect(new Headers(init.headers).has("Content-Type")).toBe(false);
      const form = init.body as FormData;
      expect(form.get("name")).toBe("Notice");
      expect(form.getAll("asset_ids")).toEqual(metadata.asset_ids ?? []);
      expect(form.getAll("device_ids")).toEqual(metadata.device_ids ?? []);
      expect(form.has("metadata")).toBe(false);
      // A null folder must never travel as the string "null".
      expect(form.getAll("folder_id")).toEqual(
        metadata.folder_id ? [metadata.folder_id] : [],
      );
      expect((form.get("file") as File).name).toBe("été.txt");
      expect(await (form.get("file") as File).text()).toBe("notice");
    },
  );

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
    await documents.list({ folder_id: "plans", archived: true });
    expect(request).toHaveBeenLastCalledWith("GET", "/documents", {
      searchParams: { folder_id: "plans", archived: true },
    });
  });

  it("manages folders and safely encodes their ids", async () => {
    const request = vi.fn<RequestFn>().mockResolvedValue({});
    const documents = new DocumentsResource(request as RequestFn);
    await documents.listFolders();
    expect(request).toHaveBeenLastCalledWith("GET", "/documents/folders");
    await documents.createFolder({ name: "Plans", parent_id: "root" });
    expect(request).toHaveBeenLastCalledWith("POST", "/documents/folders", {
      body: { name: "Plans", parent_id: "root" },
    });
    await documents.updateFolder("a/b", { archived: true });
    expect(request).toHaveBeenLastCalledWith(
      "PATCH",
      "/documents/folders/a%2Fb",
      { body: { archived: true } },
    );
    await documents.deleteFolder("a/b");
    expect(request).toHaveBeenLastCalledWith(
      "DELETE",
      "/documents/folders/a%2Fb",
    );
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
