import { describe, expect, it, vi } from "vitest";
import type { RequestFn } from "../http/httpClient";
import { DriversResource } from "./drivers";

describe("driver packages", () => {
  it.each(["application/zip", "application/yaml", ""])(
    "installs a raw Blob (%s) and sends the expected revision",
    async (type) => {
      const request = vi.fn().mockResolvedValue({ id: "demo" });
      const resource = new DriversResource(request as RequestFn);
      const body = new Blob(["package"], { type });
      expect(
        await resource.installPackage("a/b", body, { expectedRevision: "rev" }),
      ).toEqual({ id: "demo" });
      expect(request).toHaveBeenCalledWith("PUT", "/drivers/a%2Fb/package", {
        body,
        headers: { "Content-Type": type || "application/zip" },
        searchParams: { expected_revision: "rev" },
      });
    },
  );
  it("exports a Blob", async () => {
    const blob = new Blob(["zip"]);
    const request = vi.fn().mockResolvedValue(blob);
    const resource = new DriversResource(request as RequestFn);
    expect(await resource.exportPackage("a/b")).toBe(blob);
    expect(request).toHaveBeenCalledWith("GET", "/drivers/a%2Fb/package", {
      responseType: "blob",
    });
  });
  it("gets presentation diagnostics and revision", async () => {
    const response = { status: "unavailable", revision: "r", diagnostics: [] };
    const request = vi.fn().mockResolvedValue(response);
    expect(
      await new DriversResource(request as RequestFn).getPresentation("a/b"),
    ).toBe(response);
    expect(request).toHaveBeenCalledWith("GET", "/drivers/a%2Fb/presentation");
  });
});
