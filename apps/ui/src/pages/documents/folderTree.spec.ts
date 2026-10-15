import { describe, expect, it } from "vitest";
import type { Folder } from "@gridone/sdk";
import {
  archivedAncestor,
  archivedFolders,
  childFolders,
  folderOptions,
  folderPath,
  indexFolders,
} from "./folderTree";

function folder(
  id: string,
  parent_id: string | null = null,
  archived = false,
): Folder {
  return {
    id,
    name: id,
    parent_id,
    archived_at: archived ? "2026-10-14T00:00:00Z" : null,
    created_by: "admin",
    created_at: "2026-10-12T00:00:00Z",
    updated_at: "2026-10-12T00:00:00Z",
  };
}

const folders = [
  folder("Plans"),
  folder("Level 10", "Plans"),
  folder("Level 2", "Plans"),
  folder("Old", null, true),
  folder("Old room", "Old"),
  folder("Old cupboard", "Old room", true),
];
const index = indexFolders(folders);

describe("folder tree", () => {
  it("walks a folder's ancestors from the top level down", () => {
    expect(folderPath("Level 2", index).map((f) => f.id)).toEqual([
      "Plans",
      "Level 2",
    ]);
    expect(folderPath(null, index)).toEqual([]);
    expect(folderPath("deleted", index)).toEqual([]);
  });

  it("names the archived folder that hides another, the nearest first", () => {
    expect(archivedAncestor("Old cupboard", index)?.id).toBe("Old cupboard");
    expect(archivedAncestor("Old room", index)?.id).toBe("Old");
    expect(archivedAncestor("Level 2", index)).toBeUndefined();
  });

  it("lists active children in natural order and every archived folder", () => {
    expect(childFolders("Plans", folders).map((f) => f.id)).toEqual([
      "Level 2",
      "Level 10",
    ]);
    expect(childFolders(null, folders).map((f) => f.id)).toEqual(["Plans"]);
    expect(archivedFolders(folders).map((f) => f.id)).toEqual([
      "Old",
      "Old cupboard",
    ]);
  });

  it("offers visible folders by path, and keeps a hidden current folder", () => {
    expect(folderOptions(folders).map((o) => o.path)).toEqual([
      ["Plans"],
      ["Plans", "Level 2"],
      ["Plans", "Level 10"],
    ]);
    expect(folderOptions(folders, "Old room")).toContainEqual({
      value: "Old room",
      path: ["Old", "Old room"],
      hidden: true,
    });
  });
});
