import { describe, expect, it } from "vitest";
import type {
  Action,
  AutomationBranch,
  AutomationExecution,
  WriteCondition,
} from "@gridone/sdk";
import {
  ROOT,
  addCase,
  caseAt,
  caseResult,
  countCases,
  decisionAt,
  outcomeAt,
  countBranches,
  findBranch,
  insertCondition,
  isDecisionTree,
  moveCase,
  newBranchId,
  otherwiseTaken,
  removeAction,
  removeBranch,
  replaceAction,
  replayOf,
  setAction,
  setOtherwise,
  treeIssues,
  emptyTree,
  normalizeTree,
  updateCase,
  viewOf,
  type DecisionView,
  type OutcomeView,
} from "./model";

const act = (template: string): Action => ({
  provider_id: "command_template",
  params: { template_id: template },
});

const when = (attribute: string): WriteCondition => ({
  op: "eq",
  left: { device_id: "pump", attribute },
  right: true,
});

const branch = (
  id: string,
  extra: Partial<AutomationBranch> = {},
): AutomationBranch => ({
  id,
  name: "",
  condition: null,
  action: null,
  branches: [],
  ...extra,
});

const ids = (level: AutomationBranch[] | undefined) =>
  (level ?? []).map((item) => item.id);

function decision(view: OutcomeView): DecisionView {
  if (view.kind !== "decision")
    throw new Error(`expected a decision, got ${view.kind}`);
  return view;
}

describe("viewOf", () => {
  it("shows an automation without branch as a path that still needs an action", () => {
    expect(viewOf([])).toEqual({
      kind: "empty",
      target: { kind: "level", levelId: ROOT },
      depth: 1,
    });
  });

  it("draws a single unconditional branch as trigger → action, without decision", () => {
    const view = viewOf([branch("only", { action: act("start") })]);
    expect(view).toMatchObject({
      kind: "action",
      action: act("start"),
      branch: { id: "only" },
      target: { kind: "level", levelId: ROOT },
    });
  });

  it("reads cases in order, the first as 'if', the next ones as 'else if'", () => {
    const view = decision(
      viewOf([
        branch("a", { condition: when("a"), action: act("a") }),
        branch("b", { condition: when("b"), action: act("b") }),
      ]),
    );
    expect(view.cases.map((item) => [item.branch.id, item.label])).toEqual([
      ["a", "if"],
      ["b", "elseIf"],
    ]);
    expect(view.otherwise).toEqual({ branch: null, outcome: null });
  });

  it("makes the trailing unconditional branch the 'otherwise' lane", () => {
    const view = decision(
      viewOf([
        branch("a", { condition: when("a"), action: act("a") }),
        branch("else", { action: act("else") }),
      ]),
    );
    expect(view.cases.map((item) => item.branch.id)).toEqual(["a"]);
    expect(view.otherwise.branch?.id).toBe("else");
    expect(view.otherwise.outcome).toMatchObject({
      kind: "action",
      target: { kind: "terminal", branchId: "else" },
    });
  });

  it("nests the decision a case leads to, addressed by that case", () => {
    const view = decision(
      viewOf([
        branch("outer", {
          condition: when("outer"),
          branches: [
            branch("inner", { condition: when("inner"), action: act("x") }),
          ],
        }),
      ]),
    );
    const nested = decision(view.cases[0].outcome);
    expect(nested.levelId).toBe("outer");
    expect(nested.target).toEqual({ kind: "level", levelId: "outer" });
    expect(nested.depth).toBe(2);
    expect(nested.cases[0].branch.id).toBe("inner");
  });

  it("draws a lone unconditional branch's children as the root decision", () => {
    const view = decision(
      viewOf([
        branch("wrapper", {
          branches: [branch("a", { condition: when("a"), action: act("a") })],
        }),
      ]),
    );
    expect(view.levelId).toBe("wrapper");
    // Inserting above it wraps the root level, not the wrapper's children.
    expect(view.target).toEqual({ kind: "level", levelId: ROOT });
  });

  it("marks an unconditional branch before the last as always true and shadowing", () => {
    const view = decision(
      viewOf([
        branch("a", { condition: when("a"), action: act("a") }),
        branch("always", { action: act("always") }),
        branch("late", { condition: when("late"), action: act("late") }),
        branch("else", { action: act("else") }),
      ]),
    );
    expect(
      view.cases.map((item) => [
        item.branch.id,
        item.alwaysTrue,
        item.unreachable,
      ]),
    ).toEqual([
      ["a", false, false],
      ["always", true, false],
      ["late", false, true],
    ]);
    expect(view.otherwise.branch?.id).toBe("else");
  });

  it("keeps the first of several unconditional branches when there is no case", () => {
    const view = viewOf([
      branch("first", { action: act("first") }),
      branch("second", { action: act("second") }),
    ]);
    expect(view).toMatchObject({ kind: "action", branch: { id: "first" } });
  });

  it("shows a case without action as a path to complete, addressed by the case", () => {
    const view = decision(viewOf([branch("a", { condition: when("a") })]));
    expect(view.cases[0].outcome).toMatchObject({
      kind: "empty",
      branchId: "a",
    });
  });
});

describe("insertCondition", () => {
  it("puts the condition on a lone action, keeping its branch id", () => {
    const { branches, caseId } = insertCondition(
      [branch("only", { action: act("start") })],
      { kind: "level", levelId: ROOT },
      when("a"),
    );
    expect(caseId).toBe("only");
    expect(branches).toEqual([
      branch("only", { action: act("start"), condition: when("a") }),
    ]);
    const view = decision(viewOf(branches));
    expect(view.cases).toHaveLength(1);
    expect(view.otherwise).toEqual({ branch: null, outcome: null });
  });

  it("starts a case with no action on an empty automation", () => {
    const { branches, caseId } = insertCondition(
      [],
      { kind: "level", levelId: ROOT },
      when("a"),
    );
    expect(branches).toEqual([
      {
        id: caseId,
        name: "",
        condition: when("a"),
        action: null,
        branches: [],
      },
    ]);
  });

  it("moves a whole decision under the new condition", () => {
    const tree = [
      branch("a", { condition: when("a"), action: act("a") }),
      branch("else", { action: act("else") }),
    ];
    const { branches, caseId } = insertCondition(
      tree,
      { kind: "level", levelId: ROOT },
      when("gate"),
    );
    expect(branches).toHaveLength(1);
    expect(branches[0]).toMatchObject({
      id: caseId,
      condition: when("gate"),
      action: null,
    });
    expect(branches[0].branches).toEqual(tree);
  });

  it("moves a case's action one level down under the new condition", () => {
    const { branches, caseId } = insertCondition(
      [branch("a", { condition: when("a"), action: act("a") })],
      { kind: "terminal", branchId: "a" },
      when("inner"),
    );
    expect(branches[0]).toMatchObject({
      id: "a",
      condition: when("a"),
      action: null,
    });
    expect(branches[0].branches).toEqual([
      {
        id: caseId,
        name: "",
        condition: when("inner"),
        action: act("a"),
        branches: [],
      },
    ]);
  });

  it("keeps the 'otherwise' branch last and unconditional when it gains a decision", () => {
    const { branches } = insertCondition(
      [
        branch("a", { condition: when("a"), action: act("a") }),
        branch("else", { action: act("else") }),
      ],
      { kind: "terminal", branchId: "else" },
      when("inner"),
    );
    expect(branches[1]).toMatchObject({
      id: "else",
      condition: null,
      action: null,
    });
    const view = decision(viewOf(branches));
    expect(view.otherwise.branch?.id).toBe("else");
    expect(decision(view.otherwise.outcome!).cases[0].branch.action).toEqual(
      act("else"),
    );
  });
});

describe("addCase", () => {
  it("adds the case just before 'otherwise'", () => {
    const { branches, caseId } = addCase(
      [
        branch("a", { condition: when("a"), action: act("a") }),
        branch("else", { action: act("else") }),
      ],
      ROOT,
      when("b"),
    );
    expect(ids(branches)).toEqual(["a", caseId, "else"]);
    expect(branches[1]).toMatchObject({ condition: when("b"), action: null });
  });

  it("adds the case last when the decision does nothing otherwise", () => {
    const { branches, caseId } = addCase(
      [branch("a", { condition: when("a"), action: act("a") })],
      ROOT,
      when("b"),
    );
    expect(ids(branches)).toEqual(["a", caseId]);
  });

  it("adds the case inside a nested decision", () => {
    const { branches, caseId } = addCase(
      [
        branch("outer", {
          condition: when("outer"),
          branches: [
            branch("inner", { condition: when("inner"), action: act("x") }),
          ],
        }),
      ],
      "outer",
      when("b"),
    );
    expect(ids(branches[0].branches)).toEqual(["inner", caseId]);
  });
});

describe("removeBranch", () => {
  const tree = () => [
    branch("a", { condition: when("a"), action: act("a") }),
    branch("b", { condition: when("b"), action: act("b") }),
    branch("else", { action: act("else") }),
  ];

  it("removes one case and keeps the decision", () => {
    expect(ids(removeBranch(tree(), "b"))).toEqual(["a", "else"]);
  });

  it("dissolves a decision left without case into its 'otherwise' outcome", () => {
    const next = removeBranch(removeBranch(tree(), "a"), "b");
    expect(next).toEqual([branch("else", { action: act("else") })]);
    expect(viewOf(next)).toMatchObject({
      kind: "action",
      branch: { id: "else" },
    });
  });

  it("leaves the automation waiting for an action when its last case goes", () => {
    const next = removeBranch(
      [branch("a", { condition: when("a"), action: act("a") })],
      "a",
    );
    expect(next).toEqual([]);
    expect(viewOf(next).kind).toBe("empty");
  });

  it("folds a nested decision back into its case's own action", () => {
    const next = removeBranch(
      [
        branch("outer", {
          condition: when("outer"),
          branches: [
            branch("inner", { condition: when("inner"), action: act("x") }),
            branch("else", { action: act("y") }),
          ],
        }),
      ],
      "inner",
    );
    expect(next).toEqual([
      branch("outer", {
        condition: when("outer"),
        action: act("y"),
        branches: [],
      }),
    ]);
  });

  it("leaves a case without action when its nested decision loses its last case", () => {
    const next = removeBranch(
      [
        branch("outer", {
          condition: when("outer"),
          branches: [
            branch("inner", { condition: when("inner"), action: act("x") }),
          ],
        }),
      ],
      "inner",
    );
    expect(next[0]).toMatchObject({ id: "outer", action: null, branches: [] });
    expect(decision(viewOf(next)).cases[0].outcome).toMatchObject({
      kind: "empty",
      branchId: "outer",
    });
  });

  it("ignores an unknown id", () => {
    const current = tree();
    expect(removeBranch(current, "nope")).toBe(current);
  });
});

describe("moveCase", () => {
  const tree = () => [
    branch("a", { condition: when("a"), action: act("a") }),
    branch("b", { condition: when("b"), action: act("b") }),
    branch("c", { condition: when("c"), action: act("c") }),
    branch("else", { action: act("else") }),
  ];

  it("moves a case to another position among the cases", () => {
    expect(ids(moveCase(tree(), "c", 0))).toEqual(["c", "a", "b", "else"]);
    expect(ids(moveCase(tree(), "a", 2))).toEqual(["b", "c", "a", "else"]);
  });

  it("never moves a case past 'otherwise', nor 'otherwise' itself", () => {
    expect(ids(moveCase(tree(), "a", 3))).toEqual(["a", "b", "c", "else"]);
    expect(ids(moveCase(tree(), "else", 0))).toEqual(["a", "b", "c", "else"]);
    expect(ids(moveCase(tree(), "b", -1))).toEqual(["a", "b", "c", "else"]);
  });
});

describe("setOtherwise", () => {
  it("adds an 'otherwise' action to a decision that did nothing", () => {
    const next = setOtherwise(
      [branch("a", { condition: when("a"), action: act("a") })],
      ROOT,
      act("else"),
    );
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ condition: null, action: act("else") });
    expect(next[1].id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("replaces the 'otherwise' action and keeps its id", () => {
    const next = setOtherwise(
      [
        branch("a", { condition: when("a"), action: act("a") }),
        branch("else", { action: act("old"), name: "Repli" }),
      ],
      ROOT,
      act("new"),
    );
    expect(next[1]).toEqual(
      branch("else", { action: act("new"), name: "Repli" }),
    );
  });

  it("makes the decision do nothing when set to null", () => {
    expect(
      ids(
        setOtherwise(
          [
            branch("a", { condition: when("a"), action: act("a") }),
            branch("else", { action: act("else") }),
          ],
          ROOT,
          null,
        ),
      ),
    ).toEqual(["a"]);
  });
});

describe("actions", () => {
  it("gives the first action to an empty automation", () => {
    const next = setAction([], undefined, act("start"));
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ condition: null, action: act("start") });
  });

  it("gives an action to a case that had none", () => {
    expect(
      setAction([branch("a", { condition: when("a") })], "a", act("x"))[0],
    ).toMatchObject({ id: "a", action: act("x"), branches: [] });
  });

  it("replaces an action without touching the case", () => {
    expect(
      replaceAction(
        [
          branch("a", {
            condition: when("a"),
            name: "Froid",
            action: act("x"),
          }),
        ],
        "a",
        act("y"),
      ),
    ).toEqual([
      branch("a", { condition: when("a"), name: "Froid", action: act("y") }),
    ]);
  });

  it("removes the 'otherwise' branch with its action", () => {
    expect(
      ids(
        removeAction(
          [
            branch("a", { condition: when("a"), action: act("a") }),
            branch("else", { action: act("else") }),
          ],
          "else",
        ),
      ),
    ).toEqual(["a"]);
  });

  it("leaves a case, or the only branch, waiting for a new action", () => {
    expect(
      removeAction(
        [branch("a", { condition: when("a"), action: act("a") })],
        "a",
      )[0],
    ).toMatchObject({ id: "a", action: null });
    const alone = removeAction([branch("only", { action: act("x") })], "only");
    expect(viewOf(alone)).toMatchObject({ kind: "empty", branchId: "only" });
  });
});

describe("updateCase", () => {
  it("renames and re-conditions a nested case", () => {
    const next = updateCase(
      [
        branch("outer", {
          condition: when("outer"),
          branches: [
            branch("inner", { condition: when("inner"), action: act("x") }),
          ],
        }),
      ],
      "inner",
      { name: "Froid dehors", condition: when("cold") },
    );
    expect(findBranch(next, "inner")?.branch).toMatchObject({
      name: "Froid dehors",
      condition: when("cold"),
      action: act("x"),
    });
  });
});

describe("treeIssues", () => {
  const complete = (condition: WriteCondition) =>
    "left" in condition &&
    typeof condition.left === "object" &&
    condition.left !== null &&
    "device_id" in condition.left &&
    condition.left.device_id !== "";

  it("finds nothing to fix in a complete tree", () => {
    expect(
      treeIssues(
        [
          branch("a", { condition: when("a"), action: act("a") }),
          branch("else", { action: act("else") }),
        ],
        complete,
      ),
    ).toEqual([]);
  });

  it("reports incomplete conditions and paths without action, nested ones included", () => {
    const blank: WriteCondition = {
      op: "eq",
      left: { device_id: "", attribute: "" },
      right: false,
    };
    expect(
      treeIssues(
        [
          branch("a", { condition: blank, action: act("a") }),
          branch("b", {
            condition: when("b"),
            branches: [branch("inner", { condition: when("inner") })],
          }),
        ],
        complete,
      ),
    ).toEqual([
      { kind: "condition", branchId: "a" },
      { kind: "action", branchId: "inner" },
    ]);
  });

  it("asks for an action when the automation has no branch", () => {
    expect(treeIssues([], complete)).toEqual([{ kind: "action" }]);
  });
});

describe("replay", () => {
  const execution = (
    branches: AutomationExecution["branches"],
  ): AutomationExecution => ({
    id: "run",
    automation_id: "auto",
    triggered_at: "2026-09-23T10:07:12Z",
    status: "success",
    branches,
  });

  const tree = viewOf([
    branch("a", { condition: when("a"), action: act("a") }),
    branch("b", { condition: when("b"), action: act("b") }),
  ]);

  it("reads the server's result per branch and treats the rest as not tested", () => {
    const replay = replayOf(
      execution([
        { branch_id: "a", result: "not_matched" },
        { branch_id: "b", result: "matched" },
      ]),
    );
    expect(caseResult(replay, "a")).toBe("not_matched");
    expect(caseResult(replay, "b")).toBe("matched");
    expect(caseResult(replay, "zzz")).toBe("skipped");
  });

  it("follows 'do nothing' only when every case was tested and false", () => {
    const allFalse = replayOf(
      execution([
        { branch_id: "a", result: "not_matched" },
        { branch_id: "b", result: "not_matched" },
      ]),
    );
    const stopped = replayOf(
      execution([
        { branch_id: "a", result: "not_matched" },
        { branch_id: "b", result: "unknown" },
      ]),
    );
    expect(otherwiseTaken(allFalse, decision(tree))).toBe(true);
    expect(otherwiseTaken(stopped, decision(tree))).toBe(false);
    expect(otherwiseTaken(replayOf(execution([])), decision(tree))).toBe(false);
  });

  it("follows an 'otherwise' branch only when the server says it matched", () => {
    const withElse = decision(
      viewOf([
        branch("a", { condition: when("a"), action: act("a") }),
        branch("else", { action: act("else") }),
      ]),
    );
    expect(
      otherwiseTaken(
        replayOf(
          execution([
            { branch_id: "a", result: "not_matched" },
            { branch_id: "else", result: "matched" },
          ]),
        ),
        withElse,
      ),
    ).toBe(true);
    expect(
      otherwiseTaken(
        replayOf(execution([{ branch_id: "a", result: "matched" }])),
        withElse,
      ),
    ).toBe(false);
  });
});

describe("ids and counts", () => {
  it("creates 16-hex ids", () => {
    const first = newBranchId();
    expect(first).toMatch(/^[0-9a-f]{16}$/);
    expect(newBranchId()).not.toBe(first);
  });

  it("fills in missing ids and defaults at every depth, keeping existing ids", () => {
    const filled = normalizeTree([
      {
        action: act("x"),
        branches: [{ condition: when("a"), action: act("y") }],
      },
      { id: "kept", action: act("z") },
    ]);
    expect(filled[0].id).toMatch(/^[0-9a-f]{16}$/);
    expect(filled[0].branches?.[0].id).toMatch(/^[0-9a-f]{16}$/);
    expect(filled[1]).toEqual({
      id: "kept",
      name: "",
      condition: null,
      action: act("z"),
      branches: [],
    });
  });

  it("starts a new automation with one path waiting for its action", () => {
    const tree = emptyTree();
    expect(viewOf(tree)).toMatchObject({ kind: "empty", branchId: tree[0].id });
  });

  it("counts every branch and recognises a tree with at least one condition", () => {
    const nested = [
      branch("outer", {
        condition: when("outer"),
        branches: [
          branch("inner", { condition: when("inner"), action: act("x") }),
        ],
      }),
    ];
    expect(countBranches(nested)).toBe(2);
    expect(countCases(nested)).toBe(2);
    expect(
      countCases([
        branch("a", { condition: when("a"), action: act("a") }),
        branch("else", { action: act("b") }),
      ]),
    ).toBe(1);
    expect(isDecisionTree(nested)).toBe(true);
    expect(isDecisionTree([branch("only", { action: act("x") })])).toBe(false);
    expect(isDecisionTree([])).toBe(false);
  });
});

describe("lookups", () => {
  const tree = [
    branch("a", { condition: when("a"), action: act("a") }),
    branch("b", {
      condition: when("b"),
      branches: [
        branch("inner", { condition: when("inner") }),
        branch("innerElse", { action: act("y") }),
      ],
    }),
    branch("else", { action: act("else") }),
  ];

  it("finds a decision by the level holding its cases", () => {
    expect(decisionAt(tree, ROOT)?.cases.map((item) => item.branch.id)).toEqual(
      ["a", "b"],
    );
    expect(decisionAt(tree, "b")?.otherwise.branch?.id).toBe("innerElse");
    expect(decisionAt(tree, "a")).toBeUndefined();
  });

  it("finds a case with its decision and its position", () => {
    const found = caseAt(tree, "b");
    expect(found?.index).toBe(1);
    expect(found?.item.label).toBe("elseIf");
    expect(found?.decision.levelId).toBe(ROOT);
    expect(caseAt(tree, "inner")?.decision.levelId).toBe("b");
    expect(caseAt(tree, "else")).toBeUndefined();
  });

  it("finds the action, or the missing action, a branch ends with", () => {
    expect(outcomeAt(tree, "else")).toMatchObject({
      kind: "action",
      target: { kind: "terminal", branchId: "else" },
    });
    expect(outcomeAt(tree, "inner")).toMatchObject({
      kind: "empty",
      branchId: "inner",
    });
    expect(outcomeAt(tree, "b")).toBeUndefined();
  });
});
