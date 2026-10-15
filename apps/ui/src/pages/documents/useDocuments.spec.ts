import { describe, expect, it } from "vitest";
import type { Document } from "@gridone/sdk";
import { documentListParams, viewableType } from "./useDocuments";

const searched = { q: "boiler", asset_id: "room", device_id: "pump", page: 2 };

describe("the list request of each documents view", () => {
  it("browses one folder's direct contents, or the top level's", () => {
    expect(documentListParams("browse", "plans", { page: 1 })).toEqual({
      folder_id: "plans",
      page: 1,
    });
    expect(documentListParams("browse", null, { page: 3 })).toEqual({
      top_level: true,
      page: 3,
    });
  });

  it("searches across every folder, whichever folder was open", () => {
    expect(documentListParams("search", "plans", searched)).toEqual({
      q: "boiler",
      asset_id: "room",
      device_id: "pump",
      page: 2,
    });
  });

  it("lists archived documents wherever they are filed, with the search", () => {
    expect(documentListParams("archives", "plans", searched)).toEqual({
      archived: true,
      q: "boiler",
      asset_id: "room",
      device_id: "pump",
      page: 2,
    });
  });
});

describe("the type a document opens as", () => {
  it.each([
    ["application/pdf", "application/pdf"],
    ["image/png", "image/png"],
    ["image/jpeg", "image/jpeg"],
    ["text/plain", "text/plain;charset=utf-8"],
    // Browsers download text/csv instead of showing it.
    ["text/csv", "text/plain;charset=utf-8"],
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      undefined,
    ],
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      undefined,
    ],
    // Never rendered by the browser in the app's own origin.
    ["image/svg+xml", undefined],
    ["text/html", undefined],
  ])("%s opens as %s", (media_type, expected) => {
    expect(viewableType({ media_type } as Document)).toBe(expected);
  });
});
