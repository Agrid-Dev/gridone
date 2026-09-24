import { createContext, useContext } from "react";
import type { Trigger } from "@gridone/sdk";
import type { AttributeCatalog } from "@/pages/devices/device/operating-rules/expressions";
import type { InsertTarget, LevelId, Replay } from "./model";

/** What the side panel shows: the automation itself, or one element of its tree. */
export type Selection =
  | { kind: "automation" }
  | { kind: "trigger" }
  | { kind: "decision"; levelId: LevelId }
  | { kind: "case"; branchId: string }
  | { kind: "otherwise"; levelId: LevelId }
  | { kind: "action"; branchId: string }
  /** A path without action; no `branchId` when the automation has no branch. */
  | { kind: "empty"; branchId?: string };

/** Equal selections; an empty path and the action it just got count as one. */
export function sameSelection(a: Selection, b: Selection): boolean {
  const outcome = (item: Selection) =>
    item.kind === "action" || item.kind === "empty";
  if (outcome(a) && outcome(b))
    return (
      (a as { branchId?: string }).branchId ===
      (b as { branchId?: string }).branchId
    );
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "decision":
    case "otherwise":
      return a.levelId === (b as typeof a).levelId;
    case "case":
    case "action":
    case "empty":
      return a.branchId === (b as typeof a).branchId;
    default:
      return true;
  }
}

export type TreeContextValue = {
  editable: boolean;
  selection: Selection;
  select: (selection: Selection) => void;
  trigger: Trigger | null;
  catalog: AttributeCatalog;
  /** Branch ids whose condition still has blanks. */
  incompleteConditions: ReadonlySet<string>;
  /** Branch ids whose action form was left incomplete. */
  incompleteActions: ReadonlySet<string>;
  /** The execution being replayed on the tree, if any. */
  replay: Replay | null;
  insertCondition: (target: InsertTarget) => void;
  addCase: (levelId: LevelId) => void;
  /** False once the tree reached the server's branch limit. */
  canAddBranch: boolean;
  /** Deepest level a new condition may still open. */
  maxDepth: number;
};

export const TreeContext = createContext<TreeContextValue | null>(null);

export function useTree(): TreeContextValue {
  const context = useContext(TreeContext);
  if (!context) throw new Error("useTree must be used inside <TreeContext>");
  return context;
}
