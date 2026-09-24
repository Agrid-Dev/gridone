import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  Action,
  Automation,
  AutomationBranch,
  AutomationCreate,
  AutomationUpdate,
  Trigger,
  WriteCondition,
} from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { emptyCondition } from "@/pages/devices/device/operating-rules/expressions";
import schema from "../__fixtures__/schema.json";

const { client, navigate, toast } = vi.hoisted(() => ({
  client: {
    automations: {
      create: vi.fn<(body: AutomationCreate) => Promise<Automation>>(),
      update:
        vi.fn<(id: string, body: AutomationUpdate) => Promise<Automation>>(),
      schema: vi.fn<() => Promise<unknown>>(),
    },
  },
  navigate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

let canPermission: (perm: string) => boolean = () => true;

vi.mock("react-i18next", () => createI18nMock({}));
vi.mock("sonner", () => ({ toast }));
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigate,
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => client,
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (perm: string) => canPermission(perm),
}));

import { findBranch, ROOT } from "../tree/model";
import type { Selection } from "../tree/TreeContext";
import {
  useAutomationEditor,
  type AutomationEditorState,
  type EditorMode,
} from "./useAutomationEditor";

// ------------------------------------------------------------- fixtures

const ROOM = "salle20100000000";

const TRIGGER: Trigger = {
  provider_id: "schedule",
  params: { cron: "0 7 * * *" },
};
const OTHER_TRIGGER: Trigger = {
  provider_id: "schedule",
  params: { cron: "30 6 * * 1-5" },
};

const presenceIs = (value: boolean): WriteCondition => ({
  op: "eq",
  left: { device_id: ROOM, attribute: "presence" },
  right: value,
});
/** Every reference chosen, yet not a condition the server accepts (no `right`). */
const HALF_WRITTEN = {
  op: "eq",
  left: { device_id: ROOM, attribute: "presence" },
} as unknown as WriteCondition;

/**
 * The server's own tree limits (`MAX_RULES` in packages/models expressions.py,
 * `MAX_DECISION_DEPTH` in packages/automations models.py), written out rather
 * than read from the editor's constants, which are what is under test.
 */
const SERVER_MAX_BRANCHES = 64;
const SERVER_MAX_DEPTH = 16;

const write = (value: number): Action => ({
  provider_id: "command_template",
  params: { device_id: null, attribute: "heating_setpoint", value },
});

function branch(
  id: string,
  extra: Partial<AutomationBranch> = {},
): AutomationBranch {
  return {
    id,
    name: "",
    condition: null,
    action: null,
    branches: [],
    ...extra,
  };
}

/** Saved tree: "Salle vide" → write 17, otherwise → write 21. */
const savedBranches = () => [
  branch("empty", {
    name: "Salle vide",
    condition: presenceIs(false),
    action: write(17),
  }),
  branch("else", { action: write(21) }),
];

function automationWith(branches: AutomationBranch[]): Automation {
  return {
    id: "a1",
    name: "Chauffage salle 201",
    description: "Évite de chauffer une salle vide",
    enabled: true,
    trigger: TRIGGER,
    branches,
    created_by: "u1",
    created_at: "2026-09-20T08:00:00Z",
    updated_at: "2026-09-20T08:00:00Z",
  } as Automation;
}

const EDIT: EditorMode = {
  kind: "edit",
  automation: automationWith(savedBranches()),
};

function renderEditor(mode: EditorMode, { withSchema = true } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // The server's schema is what decides whether a condition can be saved.
  if (withSchema) queryClient.setQueryData(["automations", "schema"], schema);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useAutomationEditor(mode), { wrapper });
}

/** Let a mutation that should not have started get every chance to start. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  canPermission = () => true;
  client.automations.schema.mockResolvedValue(schema);
  client.automations.update.mockImplementation(async (_id, body) => ({
    ...EDIT.automation,
    ...(body as Partial<Automation>),
  }));
  client.automations.create.mockImplementation(async (body) => ({
    ...(body as Automation),
    id: "new-automation",
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ------------------------------------------------------------------ specs

describe("useAutomationEditor — opening", () => {
  it("starts a new automation on its trigger, with one path waiting for an action", () => {
    const { result } = renderEditor({ kind: "create" });

    const [path] = result.current.draft.branches;
    expect(result.current.draft).toEqual({
      name: "",
      description: "",
      enabled: true,
      trigger: null,
      branches: [
        {
          id: expect.stringMatching(/^[0-9a-f]{16}$/),
          name: "",
          condition: null,
          action: null,
          branches: [],
        },
      ],
    });
    expect(result.current.selection).toEqual({ kind: "trigger" });
    // Everything missing, in reading order: name, trigger, then the tree.
    expect(result.current.blockers).toEqual([
      { kind: "automation" },
      { kind: "trigger" },
      { kind: "empty", branchId: path.id },
    ]);
    expect(result.current.canSave).toBe(false);
  });

  it("opens an existing automation on its settings, with nothing to save", () => {
    const { result } = renderEditor(EDIT);

    expect(result.current.selection).toEqual({ kind: "automation" });
    expect(result.current.draft.branches).toEqual(savedBranches());
    expect(result.current.blockers).toEqual([]);
    expect(result.current.hasChanges).toBe(false);
    expect(result.current.canSave).toBe(false);
  });
});

describe("useAutomationEditor — saving", () => {
  it("creates with the trimmed name, description, trigger, tree and enabled flag", async () => {
    const { result } = renderEditor({ kind: "create" });
    const pathId = result.current.draft.branches[0].id!;

    act(() => result.current.setName("  Chauffage salle 201  "));
    act(() => result.current.setDescription("Évite de chauffer une salle"));
    act(() => result.current.setTrigger(TRIGGER));
    act(() => result.current.chooseAction(pathId, write(17)));
    act(() => result.current.setEnabled(false));
    expect(result.current.blockers).toEqual([]);
    expect(result.current.canSave).toBe(true);

    act(() => result.current.save());

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/automations/new-automation"),
    );
    expect(client.automations.create).toHaveBeenCalledTimes(1);
    expect(client.automations.create.mock.calls[0][0]).toStrictEqual({
      name: "Chauffage salle 201",
      description: "Évite de chauffer une salle",
      trigger: TRIGGER,
      branches: [
        {
          id: pathId,
          name: "",
          condition: null,
          action: write(17),
          branches: [],
        },
      ],
      enabled: false,
    });
    expect(client.automations.update).not.toHaveBeenCalled();
  });

  it("updates name, description, trigger and tree in one request, and nothing else", async () => {
    const { result } = renderEditor(EDIT);

    act(() => result.current.setName(" Chauffage salle 202 "));
    act(() => result.current.setDescription("Toujours la salle 202"));
    act(() => result.current.setTrigger(OTHER_TRIGGER));
    act(() => result.current.updateCase("empty", { name: "Salle inoccupée" }));
    act(() => result.current.changeAction("else", write(20)));
    act(() => result.current.save());

    await waitFor(() => expect(result.current.hasChanges).toBe(false));
    expect(client.automations.update).toHaveBeenCalledTimes(1);
    const [id, body] = client.automations.update.mock.calls[0];
    expect(id).toBe("a1");
    expect(body).toStrictEqual({
      name: "Chauffage salle 202",
      description: "Toujours la salle 202",
      trigger: OTHER_TRIGGER,
      branches: [
        branch("empty", {
          name: "Salle inoccupée",
          condition: presenceIs(false),
          action: write(17),
        }),
        branch("else", { action: write(20) }),
      ],
    });
    expect(client.automations.create).not.toHaveBeenCalled();
  });

  it("adopts the version the server saved, its branch ids included, and has nothing left to save", async () => {
    client.automations.update.mockImplementation(async (_id, body) => ({
      ...EDIT.automation,
      ...(body as Partial<Automation>),
      branches: (body.branches ?? []).map((item, index) => ({
        ...item,
        id: `server-${index}`,
      })),
    }));
    const { result } = renderEditor(EDIT);

    act(() => result.current.setName("Chauffage salle 202"));
    expect(result.current.hasChanges).toBe(true);
    act(() => result.current.save());

    await waitFor(() =>
      expect(result.current.saved.branches.map((item) => item.id)).toEqual([
        "server-0",
        "server-1",
      ]),
    );
    expect(result.current.draft.branches.map((item) => item.id)).toEqual([
      "server-0",
      "server-1",
    ]);
    expect(result.current.hasChanges).toBe(false);
    expect(result.current.canSave).toBe(false);
  });

  it("keeps `saved` on the last saved version while the draft changes", () => {
    const { result } = renderEditor(EDIT);
    const saved = result.current.saved;

    act(() => result.current.setName("Chauffage salle 202"));
    act(() => result.current.updateCase("empty", { name: "Salle inoccupée" }));
    act(() => result.current.addCase(ROOT));

    expect(result.current.saved).toBe(saved);
    expect(result.current.saved.name).toBe("Chauffage salle 201");
    expect(result.current.saved.branches).toEqual(savedBranches());
    expect(result.current.draft.branches).toHaveLength(3);
  });

  it("keeps the draft and lets the user retry when the server refuses", async () => {
    client.automations.update.mockRejectedValue(new Error("boom"));
    const { result } = renderEditor(EDIT);

    act(() => result.current.setName("Chauffage salle 202"));
    act(() => result.current.save());

    await waitFor(() =>
      expect(result.current.serverError).toBeInstanceOf(Error),
    );
    expect(toast.error).toHaveBeenCalledWith("toasts.saveError");
    expect(result.current.draft.name).toBe("Chauffage salle 202");
    expect(result.current.hasChanges).toBe(true);
    expect(result.current.canSave).toBe(true);
  });

  it("does not count spaces around the name as a change", () => {
    const { result } = renderEditor(EDIT);

    act(() => result.current.setName("  Chauffage salle 201 "));

    expect(result.current.hasChanges).toBe(false);
  });

  it("never saves without the write permission", async () => {
    canPermission = (perm) => perm === "automations:read";
    const { result } = renderEditor(EDIT);

    act(() => result.current.setName("Chauffage salle 202"));
    expect(result.current.hasChanges).toBe(true);
    expect(result.current.blockers).toEqual([]);
    expect(result.current.canSave).toBe(false);
    act(() => result.current.save());
    await settle();

    expect(client.automations.update).not.toHaveBeenCalled();
  });
});

describe("useAutomationEditor — what blocks Save", () => {
  type Step = (editor: AutomationEditorState) => void;
  const BLOCKERS: [string, Step, Selection, Step][] = [
    [
      "a blank name",
      (editor) => editor.setName("   "),
      { kind: "automation" },
      (editor) => editor.setName("Chauffage salle 202"),
    ],
    [
      "a trigger form left incomplete",
      (editor) => editor.setTrigger(null),
      { kind: "trigger" },
      (editor) => editor.setTrigger(OTHER_TRIGGER),
    ],
    [
      "a condition with blanks",
      (editor) => editor.updateCase("empty", { condition: emptyCondition() }),
      { kind: "case", branchId: "empty" },
      (editor) => editor.updateCase("empty", { condition: presenceIs(true) }),
    ],
    [
      "a condition the server schema refuses",
      (editor) => editor.updateCase("empty", { condition: HALF_WRITTEN }),
      { kind: "case", branchId: "empty" },
      (editor) => editor.updateCase("empty", { condition: presenceIs(true) }),
    ],
    [
      "a path left without action",
      (editor) => editor.removeAction("empty"),
      { kind: "empty", branchId: "empty" },
      (editor) => editor.chooseAction("empty", write(18)),
    ],
    [
      "an action form left incomplete",
      (editor) => editor.changeAction("empty", null),
      { kind: "action", branchId: "empty" },
      (editor) => editor.changeAction("empty", write(18)),
    ],
  ];

  it.each(BLOCKERS)(
    "%s blocks Save until it is fixed",
    async (_label, block, blocker, fix) => {
      const { result } = renderEditor(EDIT);
      // Savable first, so the blocker is the only thing keeping Save off.
      act(() => result.current.setName("Chauffage salle 201 bis"));
      expect(result.current.canSave).toBe(true);

      act(() => block(result.current));
      expect(result.current.blockers).toEqual([blocker]);
      expect(result.current.hasChanges).toBe(true);
      expect(result.current.canSave).toBe(false);
      act(() => result.current.save());
      await settle();
      expect(client.automations.update).not.toHaveBeenCalled();

      act(() => fix(result.current));
      expect(result.current.blockers).toEqual([]);
      expect(result.current.canSave).toBe(true);
    },
  );

  it("keeps the last valid trigger while the trigger form is incomplete", () => {
    const { result } = renderEditor(EDIT);

    act(() => result.current.setTrigger(OTHER_TRIGGER));
    act(() => result.current.setTrigger(null));

    expect(result.current.draft.trigger).toEqual(OTHER_TRIGGER);
    expect(result.current.blockers).toEqual([{ kind: "trigger" }]);
  });

  it("only asks for chosen references until the schema has loaded", () => {
    client.automations.schema.mockReturnValue(new Promise(() => {}));
    const { result } = renderEditor(EDIT, { withSchema: false });

    act(() => result.current.updateCase("empty", { condition: HALF_WRITTEN }));
    expect(result.current.blockers).toEqual([]);

    act(() =>
      result.current.updateCase("empty", { condition: emptyCondition() }),
    );
    expect(result.current.blockers).toEqual([
      { kind: "case", branchId: "empty" },
    ]);
  });

  it("accepts a condition on the event that triggered the run", () => {
    const { result } = renderEditor(EDIT);

    act(() =>
      result.current.updateCase("empty", {
        condition: { op: "eq", left: { event: "value" }, right: "heat" },
      }),
    );

    expect(result.current.blockers).toEqual([]);
    expect(result.current.canSave).toBe(true);
  });
});

describe("useAutomationEditor — tree edits", () => {
  it("puts a condition in front of a single action and selects it as a case", () => {
    const { result } = renderEditor({
      kind: "edit",
      automation: automationWith([branch("only", { action: write(17) })]),
    });
    act(() => result.current.setTab("executions"));
    act(() => result.current.setReplayId("run-1"));

    act(() => result.current.insertCondition({ kind: "level", levelId: ROOT }));

    // The lone path gains the condition and keeps its id (and its history).
    expect(result.current.draft.branches).toEqual([
      branch("only", { condition: emptyCondition(), action: write(17) }),
    ]);
    expect(result.current.selection).toEqual({
      kind: "case",
      branchId: "only",
    });
    expect(result.current.tab).toBe("configure");
    expect(result.current.replayId).toBeNull();
    expect(result.current.blockers).toEqual([
      { kind: "case", branchId: "only" },
    ]);
  });

  it("puts a condition in front of a case's action and selects the new case", () => {
    const { result } = renderEditor(EDIT);

    act(() =>
      result.current.insertCondition({ kind: "terminal", branchId: "empty" }),
    );

    const selection = result.current.selection;
    if (selection.kind !== "case") throw new Error("a case is selected");
    expect(selection.branchId).not.toBe("empty");
    expect(result.current.draft.branches).toEqual([
      branch("empty", {
        name: "Salle vide",
        condition: presenceIs(false),
        branches: [
          branch(selection.branchId, {
            condition: emptyCondition(),
            action: write(17),
          }),
        ],
      }),
      branch("else", { action: write(21) }),
    ]);
  });

  it("adds a case just before « Sinon » and selects it", () => {
    const { result } = renderEditor(EDIT);

    act(() => result.current.addCase(ROOT));

    const selection = result.current.selection;
    if (selection.kind !== "case") throw new Error("a case is selected");
    expect(result.current.draft.branches.map((item) => item.id)).toEqual([
      "empty",
      selection.branchId,
      "else",
    ]);
    expect(result.current.draft.branches[1]).toEqual(
      branch(selection.branchId, { condition: emptyCondition() }),
    );
  });

  it("never leaves an empty tree when the last case goes", () => {
    const { result } = renderEditor({
      kind: "edit",
      automation: automationWith([
        branch("empty", {
          name: "Salle vide",
          condition: presenceIs(false),
          action: write(17),
        }),
      ]),
    });
    act(() => result.current.changeAction("empty", null));
    act(() => result.current.select({ kind: "case", branchId: "empty" }));

    act(() => result.current.removeCase("empty"));

    const [path] = result.current.draft.branches;
    expect(result.current.draft.branches).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f]{16}$/),
        name: "",
        condition: null,
        action: null,
        branches: [],
      },
    ]);
    expect(result.current.blockers).toEqual([
      { kind: "empty", branchId: path.id },
    ]);
    expect(result.current.incompleteActions.size).toBe(0);
    expect(result.current.selection).toEqual({ kind: "automation" });
  });

  it("keeps the tree untouched when a form reports the action it already has", () => {
    const { result } = renderEditor(EDIT);
    const branches = result.current.draft.branches;
    // A form rebuilds its value on every report: equal content, new object,
    // keys in another order.
    const same = (value: number): Action => ({
      params: { value, attribute: "heating_setpoint", device_id: null },
      provider_id: "command_template",
    });

    act(() => result.current.changeAction("empty", same(17)));
    act(() => result.current.chooseAction("empty", same(17)));
    act(() => result.current.setOtherwise(ROOT, same(21)));

    expect(result.current.draft.branches).toBe(branches);
    expect(result.current.hasChanges).toBe(false);
    expect(result.current.blockers).toEqual([]);
  });

  // Known gap (reported): `setBranches` spreads a new draft on every call, so
  // a no-op report still hands React a new draft object — one wasted render
  // of the whole editor per form report. The tree itself is kept (see above).
  it("keeps the very draft object when a form reports the action it already has", () => {
    const { result } = renderEditor(EDIT);
    const draft = result.current.draft;

    act(() => result.current.changeAction("empty", write(17)));

    expect(result.current.draft).toBe(draft);
  });

  it("gives the « Sinon » of a decision an action, or takes it away", () => {
    const { result } = renderEditor(EDIT);

    act(() => result.current.setOtherwise(ROOT, null));
    expect(result.current.draft.branches.map((item) => item.id)).toEqual([
      "empty",
    ]);

    act(() => result.current.setOtherwise(ROOT, write(19)));
    expect(result.current.draft.branches).toEqual([
      branch("empty", {
        name: "Salle vide",
        condition: presenceIs(false),
        action: write(17),
      }),
      branch(result.current.draft.branches[1].id!, { action: write(19) }),
    ]);
  });

  it("cannot add a branch past the server's limit", () => {
    const cases = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        branch(`case-${index}`, {
          condition: presenceIs(index % 2 === 0),
          action: write(index),
        }),
      );
    const full = renderEditor({
      kind: "edit",
      automation: automationWith(cases(SERVER_MAX_BRANCHES)),
    });
    expect(full.result.current.canAddBranch).toBe(false);

    const roomLeft = renderEditor({
      kind: "edit",
      automation: automationWith(cases(SERVER_MAX_BRANCHES - 1)),
    });
    expect(roomLeft.result.current.canAddBranch).toBe(true);
  });

  it("cannot open a decision past the server's depth limit", () => {
    /** A chain of `depth` nested cases, the last one ending in an action. */
    const chain = (depth: number): AutomationBranch =>
      branch(`level-${depth}`, {
        condition: presenceIs(true),
        ...(depth === 1
          ? { action: write(depth) }
          : { branches: [chain(depth - 1)] }),
      });
    const deepest = renderEditor({
      kind: "edit",
      automation: automationWith([chain(SERVER_MAX_DEPTH)]),
    });
    expect(deepest.result.current.canAddBranch).toBe(false);

    const roomLeft = renderEditor({
      kind: "edit",
      automation: automationWith([chain(SERVER_MAX_DEPTH - 1)]),
    });
    expect(roomLeft.result.current.canAddBranch).toBe(true);
  });
});

describe("useAutomationEditor — cancel", () => {
  it("restores the saved draft and forgets what was left incomplete", () => {
    const { result } = renderEditor(EDIT);
    const saved = result.current.saved;
    const key = result.current.draftKey;

    act(() => result.current.setName("Chauffage salle 202"));
    act(() => result.current.setDescription("Autre chose"));
    act(() => result.current.setTrigger(OTHER_TRIGGER));
    act(() => result.current.setTrigger(null));
    act(() => result.current.changeAction("else", null));
    act(() => result.current.addCase(ROOT));
    // Trigger, the new case's condition and action, the incomplete action.
    expect(result.current.blockers).toHaveLength(4);

    act(() => result.current.cancel());

    expect(result.current.draft).toEqual(saved);
    expect(result.current.hasChanges).toBe(false);
    expect(result.current.blockers).toEqual([]);
    expect(result.current.incompleteActions.size).toBe(0);
    // The panel's forms remount on the saved values.
    expect(result.current.draftKey).toBe(key + 1);
    expect(result.current.selection).toEqual({ kind: "automation" });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("leaves a new automation for the list", () => {
    const { result } = renderEditor({ kind: "create" });

    act(() => result.current.cancel());

    expect(navigate).toHaveBeenCalledWith("/automations");
  });
});

describe("useAutomationEditor — selection and tabs", () => {
  it("selecting an element opens its settings and ends the replay", () => {
    const { result } = renderEditor(EDIT);

    act(() => result.current.setTab("executions"));
    act(() => result.current.setReplayId("run-1"));
    expect(result.current.tab).toBe("executions");
    expect(result.current.replayId).toBe("run-1");

    act(() => result.current.select({ kind: "trigger" }));

    expect(result.current.selection).toEqual({ kind: "trigger" });
    expect(result.current.tab).toBe("configure");
    expect(result.current.replayId).toBeNull();
  });

  it("going back to the settings tab ends the replay", () => {
    const { result } = renderEditor(EDIT);

    act(() => result.current.setTab("executions"));
    act(() => result.current.setReplayId("run-1"));
    act(() => result.current.setTab("configure"));

    expect(result.current.replayId).toBeNull();
  });
});

describe("useAutomationEditor — known gaps", () => {
  /** Every "action to complete" must point at a branch that still has one. */
  const actionBlockersPointAtActions = (editor: AutomationEditorState) =>
    editor.blockers
      .filter((blocker) => blocker.kind === "action")
      .every(
        (blocker) =>
          findBranch(editor.draft.branches, blocker.branchId)?.branch.action !=
          null,
      );

  // Reported defect: the incomplete-action marks are keyed by branch id and
  // never reconciled with the tree. "Ajouter une condition avant" in the action
  // panel moves the action under a new case; the mark stays on the old branch,
  // which no longer has an action — Save stays off and "Voir" opens "Cet
  // élément n'existe plus".
  it("drops the mark of an action moved under a new condition", () => {
    const { result } = renderEditor(EDIT);
    act(() => result.current.changeAction("empty", null));

    act(() =>
      result.current.insertCondition({ kind: "terminal", branchId: "empty" }),
    );

    expect(actionBlockersPointAtActions(result.current)).toBe(true);
  });

  // Same defect: "Ne rien faire" in the « Sinon » panel removes the branch
  // whose action form was left incomplete, and its mark blocks Save forever.
  it("drops the mark of a « Sinon » action that was removed", () => {
    const { result } = renderEditor(EDIT);
    act(() => result.current.changeAction("else", null));

    act(() => result.current.setOtherwise(ROOT, null));

    expect(actionBlockersPointAtActions(result.current)).toBe(true);
  });
});
