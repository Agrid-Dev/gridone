import { describe, expect, it } from "vitest";
import type { Active, Over } from "@dnd-kit/core";
import type { Document, Folder } from "@gridone/sdk";
import { dropMove } from "./documentDrag";

const plans = { id: "plans", name: "Plans" } as Folder;
const levels = { id: "levels", name: "Levels" } as Folder;
/** A top-level document as older payloads send it: no folder_id at all. */
const unfiled = { id: "doc", name: "Notice" } as Document;
const filed = { ...unfiled, folder_id: "plans" } as Document;

function dragged(document?: Document) {
  return {
    id: "document:doc",
    data: { current: document ? { document } : undefined },
  } as unknown as Active;
}

/** A drop target; undefined is something that is not a folder at all. */
function target(folder: Folder | null | undefined) {
  return {
    id: "target",
    data: { current: folder === undefined ? undefined : { folder } },
  } as unknown as Over;
}

describe("the move a drop asks for", () => {
  it("moves nothing onto the folder the document is already filed in", () => {
    expect(dropMove(dragged(unfiled), target(null))).toBeNull();
    expect(
      dropMove(dragged({ ...unfiled, folder_id: null }), target(null)),
    ).toBeNull();
    expect(dropMove(dragged(filed), target(plans))).toBeNull();
  });

  it("moves into another folder or back to the top level", () => {
    expect(dropMove(dragged(unfiled), target(plans))).toEqual({
      document: unfiled,
      folder: plans,
    });
    expect(dropMove(dragged(filed), target(levels))).toEqual({
      document: filed,
      folder: levels,
    });
    expect(dropMove(dragged(filed), target(null))).toEqual({
      document: filed,
      folder: null,
    });
  });

  it("moves nothing when dropped beside any folder or when no document is dragged", () => {
    expect(dropMove(dragged(filed), null)).toBeNull();
    expect(dropMove(dragged(filed), target(undefined))).toBeNull();
    expect(dropMove(dragged(undefined), target(plans))).toBeNull();
    expect(dropMove(null, target(plans))).toBeNull();
  });
});
