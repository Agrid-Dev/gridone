import type {
  Action,
  AutomationBranch,
  AutomationExecution,
  WriteCondition,
} from "@gridone/sdk";

// Match the server's complete-tree limits, including nested decisions.
export const MAX_TREE_BRANCHES = 64;
export const MAX_TREE_DEPTH = 16;

/** The root level has no owning branch; every other level is `branch.branches`. */
export const ROOT = "root";
export type LevelId = typeof ROOT | string;

/**
 * Where a condition would be inserted above an outcome: around a whole level
 * (its cases move under the new condition) or around a branch's terminal action.
 */
export type InsertTarget =
  | { kind: "level"; levelId: LevelId }
  | { kind: "terminal"; branchId: string };

export type OutcomeView =
  /** Nothing chosen yet: the path still needs an action. `branchId` is the
   *  branch left without content, absent for an automation with no branch. */
  | { kind: "empty"; branchId?: string; target: InsertTarget; depth: number }
  | {
      kind: "action";
      branch: AutomationBranch & { id: string };
      action: Action;
      target: InsertTarget;
      depth: number;
    }
  | DecisionView;

export type CaseLabel = "if" | "elseIf";

export type CaseView = {
  branch: AutomationBranch & { id: string };
  label: CaseLabel;
  /** A branch without condition before the last one: always true (legacy data). */
  alwaysTrue: boolean;
  /** Shadowed by an earlier always-true branch: never evaluated. */
  unreachable: boolean;
  outcome: OutcomeView;
};

export type DecisionView = {
  kind: "decision";
  /** The level holding the cases (`ROOT` or the id of the branch that owns them). */
  levelId: LevelId;
  cases: CaseView[];
  /** The trailing unconditional branch, or null for "do nothing". */
  otherwise: {
    branch: (AutomationBranch & { id: string }) | null;
    outcome: OutcomeView | null;
  };
  target: InsertTarget;
  depth: number;
};

// ------------------------------------------------------------------- ids

/** A 16-character hex id, the same format as the server's `gen_id()`. */
export function newBranchId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Every branch with all of its fields and an id, so selection, React keys and
 * edits can address it, and two trees compare field by field (the API may
 * omit defaults a draft spells out).
 */
export function normalizeTree(
  branches: AutomationBranch[],
): (AutomationBranch & { id: string })[] {
  return branches.map((branch) => ({
    id: branch.id || newBranchId(),
    name: branch.name ?? "",
    condition: branch.condition ?? null,
    action: branch.action ?? null,
    branches: normalizeTree(branch.branches ?? []),
  }));
}

/** A new automation's tree: one path, still waiting for its action. */
export function emptyTree(): AutomationBranch[] {
  return [
    {
      id: newBranchId(),
      name: "",
      condition: null,
      action: null,
      branches: [],
    },
  ];
}

// ----------------------------------------------------------- navigation

export function countBranches(branches: AutomationBranch[]): number {
  return branches.reduce(
    (total, branch) => total + 1 + countBranches(branch.branches ?? []),
    0,
  );
}

/** How many cases (branches with a condition) the tree holds, at every depth. */
export function countCases(branches: AutomationBranch[]): number {
  return branches.reduce(
    (total, branch) =>
      total +
      (branch.condition != null ? 1 : 0) +
      countCases(branch.branches ?? []),
    0,
  );
}

export function treeDepth(branches: AutomationBranch[]): number {
  return branches.reduce(
    (deepest, branch) =>
      Math.max(deepest, 1 + treeDepth(branch.branches ?? [])),
    0,
  );
}

/** True when the tree holds at least one condition: anything but "trigger → action". */
export function isDecisionTree(branches?: AutomationBranch[]): boolean {
  return Boolean(
    branches?.some(
      (branch) =>
        branch.condition != null || isDecisionTree(branch.branches ?? []),
    ),
  );
}

export type BranchLocation = {
  branch: AutomationBranch & { id: string };
  levelId: LevelId;
  index: number;
  /** 1 for a root branch, 2 for its children… */
  depth: number;
};

export function findBranch(
  branches: AutomationBranch[],
  id: string,
  levelId: LevelId = ROOT,
  depth = 1,
): BranchLocation | undefined {
  for (const [index, branch] of branches.entries()) {
    if (branch.id === id)
      return {
        branch: branch as AutomationBranch & { id: string },
        levelId,
        index,
        depth,
      };
    const inner = findBranch(branch.branches ?? [], id, branch.id!, depth + 1);
    if (inner) return inner;
  }
  return undefined;
}

export function levelOf(
  branches: AutomationBranch[],
  levelId: LevelId,
): AutomationBranch[] {
  if (levelId === ROOT) return branches;
  return findBranch(branches, levelId)?.branch.branches ?? [];
}

/** Index of the trailing unconditional branch ("otherwise"), or -1. */
export function otherwiseIndex(level: AutomationBranch[]): number {
  const last = level.length - 1;
  return last >= 0 && level[last].condition == null && hasConditionalCase(level)
    ? last
    : -1;
}

function hasConditionalCase(level: AutomationBranch[]): boolean {
  return level.some((branch) => branch.condition != null);
}

// ------------------------------------------------------------------ view

/**
 * Read the stored branches as the tree the editor draws.
 *
 * A level with a single unconditional branch is not a decision: it is drawn as
 * that branch's own outcome, so "trigger → action" never shows a decision node.
 * Any level with a condition is a decision whose trailing unconditional branch
 * is the "otherwise" lane; an unconditional branch placed earlier (legacy data)
 * stays a case, marked always-true, and shadows the cases after it.
 */
export function viewOf(branches: AutomationBranch[]): OutcomeView {
  return levelOutcome(branches, ROOT, { kind: "level", levelId: ROOT }, 1);
}

function levelOutcome(
  level: AutomationBranch[],
  levelId: LevelId,
  target: InsertTarget,
  depth: number,
): OutcomeView {
  if (level.length === 0) return { kind: "empty", target, depth };
  if (!hasConditionalCase(level)) {
    // One (or, in legacy data, several) unconditional branches: the first wins.
    return branchOutcome(level[0], target, depth);
  }
  const elseAt = otherwiseIndex(level);
  const caseBranches = elseAt >= 0 ? level.slice(0, elseAt) : level;
  let shadowed = false;
  const cases = caseBranches.map((branch, index): CaseView => {
    const view: CaseView = {
      branch: branch as AutomationBranch & { id: string },
      label: index === 0 ? "if" : "elseIf",
      alwaysTrue: branch.condition == null,
      unreachable: shadowed,
      outcome: branchOutcome(
        branch,
        { kind: "terminal", branchId: branch.id! },
        depth + 1,
      ),
    };
    if (branch.condition == null) shadowed = true;
    return view;
  });
  const otherwiseBranch =
    elseAt >= 0 ? (level[elseAt] as AutomationBranch & { id: string }) : null;
  return {
    kind: "decision",
    levelId,
    cases,
    otherwise: {
      branch: otherwiseBranch,
      outcome: otherwiseBranch
        ? branchOutcome(
            otherwiseBranch,
            { kind: "terminal", branchId: otherwiseBranch.id },
            depth + 1,
          )
        : null,
    },
    target,
    depth,
  };
}

/** What a branch leads to: its action, its nested level, or nothing chosen yet. */
function branchOutcome(
  branch: AutomationBranch,
  target: InsertTarget,
  depth: number,
): OutcomeView {
  if (branch.action)
    return {
      kind: "action",
      branch: branch as AutomationBranch & { id: string },
      action: branch.action,
      target,
      depth,
    };
  const children = branch.branches ?? [];
  if (children.length)
    return levelOutcome(
      children,
      branch.id!,
      target.kind === "terminal"
        ? { kind: "level", levelId: branch.id! }
        : target,
      depth,
    );
  return { kind: "empty", branchId: branch.id!, target, depth };
}

/** Every decision drawn for `branches`, outermost first. */
function decisions(
  view: OutcomeView | null,
  found: DecisionView[] = [],
): DecisionView[] {
  if (!view || view.kind !== "decision") return found;
  found.push(view);
  for (const item of view.cases) decisions(item.outcome, found);
  decisions(view.otherwise.outcome, found);
  return found;
}

/** The decision whose cases live in `levelId`. */
export function decisionAt(
  branches: AutomationBranch[],
  levelId: LevelId,
): DecisionView | undefined {
  return decisions(viewOf(branches)).find((item) => item.levelId === levelId);
}

/** A case as drawn: its view, the decision it belongs to and its position. */
export function caseAt(
  branches: AutomationBranch[],
  branchId: string,
): { item: CaseView; decision: DecisionView; index: number } | undefined {
  for (const decision of decisions(viewOf(branches))) {
    const index = decision.cases.findIndex(
      (item) => item.branch.id === branchId,
    );
    if (index >= 0) return { item: decision.cases[index], decision, index };
  }
  return undefined;
}

/** The action (or missing action) drawn for `branchId`. */
export function outcomeAt(
  branches: AutomationBranch[],
  branchId: string,
): Extract<OutcomeView, { kind: "action" | "empty" }> | undefined {
  const visit = (
    view: OutcomeView | null,
  ): Extract<OutcomeView, { kind: "action" | "empty" }> | undefined => {
    if (!view) return undefined;
    if (view.kind === "action")
      return view.branch.id === branchId ? view : undefined;
    if (view.kind === "empty")
      return view.branchId === branchId ? view : undefined;
    for (const item of view.cases) {
      const found = visit(item.outcome);
      if (found) return found;
    }
    return visit(view.otherwise.outcome);
  };
  return visit(viewOf(branches));
}

// ------------------------------------------------------------ operations

type Branches = AutomationBranch[];

/** Rebuild the tree with `levelId`'s branch list replaced. */
function updateLevel(
  branches: Branches,
  levelId: LevelId,
  update: (level: Branches) => Branches,
): Branches {
  if (levelId === ROOT) return update(branches);
  return updateBranch(branches, levelId, (owner) =>
    normalizeOwner({ ...owner, branches: update(owner.branches ?? []) }),
  );
}

/** Rebuild the tree with branch `id` replaced by `update(branch)`. */
function updateBranch(
  branches: Branches,
  id: string,
  update: (branch: AutomationBranch) => AutomationBranch,
): Branches {
  return branches.map((branch) =>
    branch.id === id
      ? update(branch)
      : branch.branches?.length
        ? { ...branch, branches: updateBranch(branch.branches, id, update) }
        : branch,
  );
}

/**
 * Keep a branch's content in one of its two legal shapes after an edit: a
 * terminal action, or a list of children. A child list reduced to a single
 * unconditional action folds back into the owner's own action.
 */
function normalizeOwner(owner: AutomationBranch): AutomationBranch {
  const children = owner.branches ?? [];
  if (
    children.length === 1 &&
    children[0].condition == null &&
    !children[0].branches?.length
  )
    return { ...owner, action: children[0].action ?? null, branches: [] };
  return {
    ...owner,
    action: children.length ? null : owner.action,
    branches: children,
  };
}

/**
 * Put `condition` in front of an outcome. Around a level, the outcome's
 * branches move under one new case (a lone unconditional branch simply gains
 * the condition, keeping its id and so its execution history). Around a
 * terminal action, the action moves one level down under the new case. The
 * decision gets no "otherwise" branch: nothing happens when the case is false.
 */
export function insertCondition(
  branches: Branches,
  target: InsertTarget,
  condition: WriteCondition,
): { branches: Branches; caseId: string } {
  if (target.kind === "terminal") {
    const caseId = newBranchId();
    return {
      caseId,
      branches: updateBranch(branches, target.branchId, (owner) => ({
        ...owner,
        action: null,
        branches: [
          {
            id: caseId,
            name: "",
            condition,
            action: owner.action ?? null,
            branches: owner.branches ?? [],
          },
        ],
      })),
    };
  }
  let caseId = "";
  const next = updateLevel(branches, target.levelId, (level) => {
    if (level.length === 1 && level[0].condition == null) {
      caseId = level[0].id ?? newBranchId();
      return [{ ...level[0], id: caseId, condition }];
    }
    caseId = newBranchId();
    return [
      {
        id: caseId,
        name: "",
        condition,
        action: null,
        branches: level,
      },
    ];
  });
  return { branches: next, caseId };
}

/** Add a case at the end of a decision, just before its "otherwise" branch. */
export function addCase(
  branches: Branches,
  levelId: LevelId,
  condition: WriteCondition,
): { branches: Branches; caseId: string } {
  const caseId = newBranchId();
  const added: AutomationBranch = {
    id: caseId,
    name: "",
    condition,
    action: null,
    branches: [],
  };
  return {
    caseId,
    branches: updateLevel(branches, levelId, (level) => {
      const at = otherwiseIndex(level);
      return at >= 0
        ? [...level.slice(0, at), added, ...level.slice(at)]
        : [...level, added];
    }),
  };
}

/**
 * Remove a case (or the "otherwise" branch). A decision left without any case
 * disappears: its otherwise outcome, if any, takes its place.
 */
export function removeBranch(branches: Branches, id: string): Branches {
  const location = findBranch(branches, id);
  if (!location) return branches;
  return updateLevel(branches, location.levelId, (level) => {
    const rest = level.filter((branch) => branch.id !== id);
    if (hasConditionalCase(rest)) return rest;
    // No case left: keep only the outcome that used to be "otherwise".
    return rest.length ? [{ ...rest[0], condition: null }] : [];
  });
}

/**
 * Move a case among the cases of its decision. The "otherwise" branch always
 * stays last and cannot be passed.
 */
export function moveCase(branches: Branches, id: string, to: number): Branches {
  const location = findBranch(branches, id);
  if (!location) return branches;
  return updateLevel(branches, location.levelId, (level) => {
    const elseAt = otherwiseIndex(level);
    const lastCase = (elseAt >= 0 ? elseAt : level.length) - 1;
    if (location.index === elseAt || to < 0 || to > lastCase) return level;
    const next = [...level];
    const [moved] = next.splice(location.index, 1);
    next.splice(to, 0, moved);
    return next;
  });
}

export function updateCase(
  branches: Branches,
  id: string,
  patch: { name?: string; condition?: WriteCondition | null },
): Branches {
  return updateBranch(branches, id, (branch) => ({ ...branch, ...patch }));
}

/**
 * Give an action to a path that has none (`branchId` from the empty outcome),
 * or — without `branchId` — to an automation that has no branch at all.
 */
export function setAction(
  branches: Branches,
  branchId: string | undefined,
  action: Action,
): Branches {
  if (branchId === undefined)
    return [
      { id: newBranchId(), name: "", condition: null, action, branches: [] },
    ];
  return updateBranch(branches, branchId, (branch) => ({
    ...branch,
    action,
    branches: [],
  }));
}

/** Replace the action a branch already ends with. */
export function replaceAction(
  branches: Branches,
  branchId: string,
  action: Action,
): Branches {
  return updateBranch(branches, branchId, (branch) => ({ ...branch, action }));
}

/**
 * Take the action off a path. The "otherwise" branch goes away (the decision
 * then does nothing); a case, or the automation's only branch, is left waiting
 * for a new action.
 */
export function removeAction(branches: Branches, branchId: string): Branches {
  const location = findBranch(branches, branchId);
  if (!location) return branches;
  const level = levelOf(branches, location.levelId);
  if (otherwiseIndex(level) === location.index)
    return setOtherwise(branches, location.levelId, null);
  return updateBranch(branches, branchId, (branch) => ({
    ...branch,
    action: null,
  }));
}

/** Give the decision an "otherwise" action, or (null) make it do nothing. */
export function setOtherwise(
  branches: Branches,
  levelId: LevelId,
  action: Action | null,
): Branches {
  return updateLevel(branches, levelId, (level) => {
    const at = otherwiseIndex(level);
    const cases = at >= 0 ? level.slice(0, at) : level;
    if (action === null) return cases;
    const current = at >= 0 ? level[at] : undefined;
    return [
      ...cases,
      {
        id: current?.id ?? newBranchId(),
        name: current?.name ?? "",
        condition: null,
        action,
        branches: [],
      },
    ];
  });
}

// ------------------------------------------------------------ validation

export type TreeIssue =
  | { kind: "condition"; branchId: string }
  /** A path with no action; `branchId` is absent when the tree is empty. */
  | { kind: "action"; branchId?: string };

/**
 * What still blocks saving: a case whose condition is incomplete, or a path
 * that does not end in an action. `isComplete` decides for conditions (the
 * editor validates them against the server's own schema).
 */
export function treeIssues(
  branches: Branches,
  isComplete: (condition: WriteCondition) => boolean,
): TreeIssue[] {
  const issues: TreeIssue[] = [];
  const visit = (outcome: OutcomeView | null) => {
    if (!outcome) return;
    if (outcome.kind === "empty") {
      issues.push({ kind: "action", branchId: outcome.branchId });
      return;
    }
    if (outcome.kind === "action") return;
    for (const item of outcome.cases) {
      const condition = item.branch.condition;
      if (condition != null && !isComplete(condition))
        issues.push({ kind: "condition", branchId: item.branch.id });
      visit(item.outcome);
    }
    visit(outcome.otherwise.outcome);
  };
  visit(viewOf(branches));
  return issues;
}

export function sameTarget(a: InsertTarget, b: InsertTarget): boolean {
  return a.kind === "level"
    ? b.kind === "level" && a.levelId === b.levelId
    : b.kind === "terminal" && a.branchId === b.branchId;
}

// ---------------------------------------------------------------- replay

export type CaseResult = "matched" | "not_matched" | "unknown" | "skipped";

/**
 * How one execution went through the tree, as the server recorded it: the
 * result of every branch it evaluated. Nothing is re-evaluated here.
 */
export type Replay = {
  execution: AutomationExecution;
  results: Map<string, "matched" | "not_matched" | "unknown">;
};

export function replayOf(execution: AutomationExecution): Replay {
  return {
    execution,
    results: new Map(
      (execution.branches ?? []).map((evaluation) => [
        evaluation.branch_id,
        evaluation.result,
      ]),
    ),
  };
}

export function caseResult(replay: Replay, branchId: string): CaseResult {
  return replay.results.get(branchId) ?? "skipped";
}

/**
 * Whether the "otherwise" lane of `decision` was followed: its branch
 * matched, or — when it does nothing — every case was evaluated and false.
 */
export function otherwiseTaken(
  replay: Replay,
  decision: DecisionView,
): boolean {
  const branch = decision.otherwise.branch;
  if (branch) return replay.results.get(branch.id) === "matched";
  return (
    decision.cases.length > 0 &&
    decision.cases.every(
      (item) => replay.results.get(item.branch.id) === "not_matched",
    )
  );
}
