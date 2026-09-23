import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import type { Action, AutomationBranch, WriteCondition } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "panel.gone": "Cet élément n’existe plus.",
    "panel.optional": "(facultatif)",
    "panel.plainWords": "En clair",
    "panel.case.name": "Nom du cas",
    "panel.case.condition": "Condition",
    "panel.case.unreachable": "Un cas précédent n’a pas de condition",
    "panel.case.incomplete": "Complétez la condition pour pouvoir enregistrer.",
    "panel.case.untitled": "Cas {{position}}",
    "panel.order.title": "Ordre de test",
    "panel.otherwise.choice": "Ce qui se passe sinon",
    "panel.otherwise.nothingHint": "L’exécution est consignée",
    "panel.otherwise.act": "Exécuter une action",
    "panel.otherwise.actHint": "Par exemple, notifier l’astreinte",
    "panel.otherwise.nested": "Ce couloir mène à une autre décision",
    "panel.action.addConditionBefore": "Ajouter une condition avant",
    "panel.action.remove": "Retirer l’action",
    "tree.if": "Si",
    "tree.elseIf": "Sinon, si",
    "tree.otherwise": "Sinon",
    "tree.otherwiseRule": "Aucun cas précédent n’est vrai",
    "tree.nothing": "Ne rien faire",
    "tree.alwaysTrue": "Toujours vrai",
    "tree.alwaysTrueHint": "Ce cas n’a pas de condition",
    "tree.insertCondition": "Ajouter une condition",
    "tree.chooseAction": "Choisir une action",
    "plain.colon": " :",
    "plain.nothing": "ne rien faire",
    "plain.notify": "envoyer la notification « {{title}} »",
  }),
);

const EDITED_ACTION: Action = {
  provider_id: "notification",
  params: {
    title: "Astreinte",
    body: "",
    severity: "warning",
    user_ids: ["u2"],
  },
};
const FILLED: WriteCondition = {
  op: "lt",
  left: { device_id: "meteo00000000000", attribute: "outdoor_temperature" },
  right: 5,
};

/** Counts form mounts, so a test can tell a re-render from a remount. */
const forms = vi.hoisted(() => ({ mounts: 0 }));

// The action form owns its own react-hook-form state; the panels only route
// what it reports, so it is a readout plus buttons that report a value.
vi.mock("../form/ActionForm", () => ({
  default: ({
    initialValue,
    onChange,
  }: {
    initialValue?: Action;
    onChange?: (action: Action | null) => void;
  }) => {
    const [mount] = useState(() => ++forms.mounts);
    return (
      <div data-testid="action-form" data-mount={mount}>
        type={initialValue?.provider_id ?? "none"}
        <button type="button" onClick={() => onChange?.(EDITED_ACTION)}>
          report action
        </button>
        <button type="button" onClick={() => onChange?.(null)}>
          report incomplete
        </button>
      </div>
    );
  },
}));
vi.mock("../presenters/ActionPresenter", () => ({
  ActionPresenter: ({ action }: { action: Action }) => (
    <div data-testid="action-presenter">{action.provider_id}</div>
  ),
}));
vi.mock("@/pages/devices/device/operating-rules/ConditionRows", () => ({
  ConditionRows: ({
    value,
    onChange,
  }: {
    value: WriteCondition;
    onChange: (next: WriteCondition) => void;
  }) => (
    <div data-testid="condition-rows">
      {value.op}
      <button type="button" onClick={() => onChange(FILLED)}>
        fill condition
      </button>
    </div>
  ),
}));

import { emptyCondition } from "@/pages/devices/device/operating-rules/expressions";
import type { AutomationEditorState } from "../editor/useAutomationEditor";
import { MAX_TREE_DEPTH, ROOT } from "../tree/model";
import { TreeContext, type TreeContextValue } from "../tree/TreeContext";
import {
  CaseFooter,
  CasePanel,
  OtherwiseFooter,
  OtherwisePanel,
  OutcomePanel,
} from "./panels";

// ------------------------------------------------------------- fixtures

const ROOM = "salle20100000000";
const presenceIs = (value: boolean): WriteCondition => ({
  op: "eq",
  left: { device_id: ROOM, attribute: "presence" },
  right: value,
});
const write = (value: number): Action => ({
  provider_id: "write_attribute",
  params: { device_id: null, attribute: "heating_setpoint", value },
});
const notify = (title: string): Action => ({
  provider_id: "notification",
  params: { title, body: "", severity: "info", user_ids: ["u1"] },
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

/** "Salle vide" → notify, "Fenêtre" → write — and "otherwise" if given. */
const decision = (otherwise?: AutomationBranch) => [
  branch("empty", {
    name: "Salle vide",
    condition: presenceIs(false),
    action: notify("Réduire la consigne"),
  }),
  branch("window", { condition: presenceIs(true), action: write(12) }),
  ...(otherwise ? [otherwise] : []),
];

const editor = {
  setOtherwise: vi.fn<(levelId: string, action: Action | null) => void>(),
  updateCase:
    vi.fn<
      (
        branchId: string,
        patch: { name?: string; condition?: WriteCondition | null },
      ) => void
    >(),
  moveCase: vi.fn(),
  addCase: vi.fn(),
  changeAction: vi.fn<(branchId: string, action: Action | null) => void>(),
  chooseAction: vi.fn<(branchId: string, action: Action) => void>(),
  removeAction: vi.fn<(branchId: string) => void>(),
  insertCondition: vi.fn(),
  save: vi.fn(),
};

function editorWith(
  branches: AutomationBranch[],
  overrides: Partial<AutomationEditorState> = {},
): AutomationEditorState {
  return {
    ...editor,
    draft: {
      name: "Chauffage",
      description: "",
      enabled: true,
      trigger: null,
      branches,
    },
    draftKey: 0,
    canWrite: true,
    canAddBranch: true,
    incompleteConditions: new Set<string>(),
    ...overrides,
  } as unknown as AutomationEditorState;
}

function tree(overrides: Partial<TreeContextValue> = {}): TreeContextValue {
  return {
    editable: true,
    selection: { kind: "automation" },
    select: vi.fn(),
    trigger: null,
    catalog: { devices: [] },
    incompleteConditions: new Set(),
    incompleteActions: new Set(),
    replay: null,
    insertCondition: vi.fn(),
    addCase: vi.fn(),
    canAddBranch: true,
    maxDepth: MAX_TREE_DEPTH,
    ...overrides,
  };
}

function renderPanel(panel: ReactElement, context: TreeContextValue = tree()) {
  const view = render(
    <TreeContext.Provider value={context}>{panel}</TreeContext.Provider>,
  );
  return {
    ...view,
    rerender: (next: ReactElement) =>
      view.rerender(
        <TreeContext.Provider value={context}>{next}</TreeContext.Provider>,
      ),
  };
}

const radio = (name: RegExp) => screen.getByRole("radio", { name });
const form = () => screen.queryByTestId("action-form");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ------------------------------------------------------------ otherwise

describe("OtherwisePanel", () => {
  it("does nothing by default, and records the first complete action once asked to act", async () => {
    const user = userEvent.setup();
    renderPanel(
      <OtherwisePanel editor={editorWith(decision())} levelId={ROOT} />,
    );

    expect(radio(/^Ne rien faire/)).toBeChecked();
    expect(radio(/^Exécuter une action/)).not.toBeChecked();
    expect(form()).not.toBeInTheDocument();

    await user.click(radio(/^Exécuter une action/));
    expect(radio(/^Exécuter une action/)).toBeChecked();
    expect(form()).toHaveTextContent("type=none");
    expect(editor.setOtherwise).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "report action" }));
    expect(editor.setOtherwise).toHaveBeenCalledWith(ROOT, EDITED_ACTION);
  });

  it("opens on the action « Sinon » runs, and « Ne rien faire » takes it away", async () => {
    const user = userEvent.setup();
    renderPanel(
      <OtherwisePanel
        editor={editorWith(decision(branch("else", { action: write(21) })))}
        levelId={ROOT}
      />,
    );

    expect(radio(/^Exécuter une action/)).toBeChecked();
    expect(form()).toHaveTextContent("type=write_attribute");

    await user.click(radio(/^Ne rien faire/));

    expect(editor.setOtherwise).toHaveBeenCalledWith(ROOT, null);
    expect(radio(/^Ne rien faire/)).toBeChecked();
    expect(form()).not.toBeInTheDocument();
  });

  it("sends a « Sinon » that opens another decision back to the tree", () => {
    renderPanel(
      <OtherwisePanel
        editor={editorWith(
          decision(
            branch("else", {
              branches: [
                branch("frost", {
                  condition: presenceIs(true),
                  action: write(8),
                }),
              ],
            }),
          ),
        )}
        levelId={ROOT}
      />,
    );

    expect(radio(/^Exécuter une action/)).toBeChecked();
    expect(
      screen.getByText("Ce couloir mène à une autre décision"),
    ).toBeInTheDocument();
    expect(form()).not.toBeInTheDocument();
  });

  it("only shows the choice on a read-only tree", () => {
    renderPanel(
      <OtherwisePanel
        editor={editorWith(decision(branch("else", { action: write(21) })))}
        levelId={ROOT}
      />,
      tree({ editable: false }),
    );

    expect(radio(/^Ne rien faire/)).toBeDisabled();
    expect(radio(/^Exécuter une action/)).toBeDisabled();
    expect(form()).not.toBeInTheDocument();
    expect(screen.getByTestId("action-presenter")).toHaveTextContent(
      "write_attribute",
    );
  });

  it("says so when the decision is gone", () => {
    renderPanel(
      <OtherwisePanel editor={editorWith(decision())} levelId="removed" />,
    );

    expect(screen.getByText("Cet élément n’existe plus.")).toBeInTheDocument();
  });

  it("sums the lane up in plain words", () => {
    renderPanel(
      <OtherwiseFooter editor={editorWith(decision())} levelId={ROOT} />,
    );

    expect(screen.getByText("En clair").nextSibling).toHaveTextContent(
      "Sinon (aucun cas précédent n’est vrai) : ne rien faire.",
    );
  });
});

// --------------------------------------------------------------- action

describe("OutcomePanel", () => {
  it("records the first complete action of a path, then routes every report as an edit — without remounting the form", async () => {
    const user = userEvent.setup();
    const path = [branch("path")];
    const { rerender } = renderPanel(
      <OutcomePanel editor={editorWith(path)} branchId="path" />,
    );
    const mount = form()!.dataset.mount;

    // Nothing usable yet: nothing to record.
    await user.click(screen.getByRole("button", { name: "report incomplete" }));
    expect(editor.chooseAction).not.toHaveBeenCalled();
    expect(editor.changeAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "report action" }));
    expect(editor.chooseAction).toHaveBeenCalledWith("path", EDITED_ACTION);
    expect(editor.changeAction).not.toHaveBeenCalled();

    // The draft now has the action: the same form keeps reporting, as edits.
    rerender(
      <OutcomePanel
        editor={editorWith([branch("path", { action: EDITED_ACTION })])}
        branchId="path"
      />,
    );
    expect(form()!.dataset.mount).toBe(mount);
    await user.click(screen.getByRole("button", { name: "report incomplete" }));
    await user.click(screen.getByRole("button", { name: "report action" }));

    expect(editor.changeAction.mock.calls).toEqual([
      ["path", null],
      ["path", EDITED_ACTION],
    ]);
    expect(editor.chooseAction).toHaveBeenCalledTimes(1);
  });

  it("puts a condition in front of the action", async () => {
    const user = userEvent.setup();
    renderPanel(
      <OutcomePanel editor={editorWith(decision())} branchId="window" />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ajouter une condition avant" }),
    );

    expect(editor.insertCondition).toHaveBeenCalledWith({
      kind: "terminal",
      branchId: "window",
    });
  });

  it("puts a condition in front of the whole automation when it is a single action", async () => {
    const user = userEvent.setup();
    renderPanel(
      <OutcomePanel
        editor={editorWith([branch("only", { action: write(17) })])}
        branchId="only"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ajouter une condition avant" }),
    );

    expect(editor.insertCondition).toHaveBeenCalledWith({
      kind: "level",
      levelId: ROOT,
    });
  });

  it("cannot add a condition once the tree is full", () => {
    renderPanel(
      <OutcomePanel
        editor={editorWith(decision(), { canAddBranch: false })}
        branchId="window"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Ajouter une condition avant" }),
    ).toBeDisabled();
  });

  it("takes the action away and starts a fresh form", async () => {
    const user = userEvent.setup();
    renderPanel(
      <OutcomePanel editor={editorWith(decision())} branchId="window" />,
    );
    const mount = form()!.dataset.mount;

    await user.click(screen.getByRole("button", { name: "Retirer l’action" }));

    expect(editor.removeAction).toHaveBeenCalledWith("window");
    expect(form()!.dataset.mount).not.toBe(mount);
  });

  it("shows the action, or what is missing, on a read-only tree", () => {
    renderPanel(
      <OutcomePanel editor={editorWith(decision())} branchId="window" />,
      tree({ editable: false }),
    );
    expect(screen.getByTestId("action-presenter")).toHaveTextContent(
      "write_attribute",
    );
    expect(form()).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retirer l’action" }),
    ).not.toBeInTheDocument();
    cleanup();

    renderPanel(
      <OutcomePanel editor={editorWith([branch("path")])} branchId="path" />,
      tree({ editable: false }),
    );
    expect(screen.getByText("Choisir une action")).toBeInTheDocument();
  });

  it("says so when the path is gone", () => {
    renderPanel(
      <OutcomePanel editor={editorWith(decision())} branchId="removed" />,
    );

    expect(screen.getByText("Cet élément n’existe plus.")).toBeInTheDocument();
  });
});

// ----------------------------------------------------------------- case

describe("CasePanel", () => {
  it("renames the case, edits its condition and shows where it is tested", async () => {
    const user = userEvent.setup();
    renderPanel(
      <CasePanel editor={editorWith(decision())} branchId="window" />,
    );

    fireEvent.change(screen.getByLabelText(/^Nom du cas/), {
      target: { value: "Fenêtre ouverte" },
    });
    await user.click(screen.getByRole("button", { name: "fill condition" }));

    expect(editor.updateCase.mock.calls).toEqual([
      ["window", { name: "Fenêtre ouverte" }],
      ["window", { condition: FILLED }],
    ]);
    const order = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(order.map((row) => row.getAttribute("aria-current"))).toEqual([
      null,
      "true",
      null,
    ]);
  });

  it("explains a legacy case without condition and offers to add one; the next case is never tested", async () => {
    const user = userEvent.setup();
    const legacy = [
      branch("always", { name: "Toujours", action: write(1) }),
      branch("shadowed", { condition: presenceIs(true), action: write(2) }),
      branch("else", { action: write(3) }),
    ];
    renderPanel(<CasePanel editor={editorWith(legacy)} branchId="always" />);

    expect(screen.getByText("Ce cas n’a pas de condition")).toBeInTheDocument();
    expect(screen.queryByTestId("condition-rows")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Ajouter une condition" }),
    );
    expect(editor.updateCase).toHaveBeenCalledWith("always", {
      condition: emptyCondition(),
    });
    cleanup();

    renderPanel(<CasePanel editor={editorWith(legacy)} branchId="shadowed" />);
    expect(
      screen.getByText("Un cas précédent n’a pas de condition"),
    ).toBeInTheDocument();
  });

  it("says what is missing while the condition is incomplete", () => {
    renderPanel(
      <CasePanel
        editor={editorWith(decision(), {
          incompleteConditions: new Set(["window"]),
        })}
        branchId="window"
      />,
    );

    expect(
      screen.getByText("Complétez la condition pour pouvoir enregistrer."),
    ).toHaveAttribute("role", "status");
  });

  it("reads the condition out on a read-only tree", () => {
    renderPanel(
      <CasePanel editor={editorWith(decision())} branchId="window" />,
      tree({ editable: false }),
    );

    expect(screen.getByLabelText(/^Nom du cas/)).toBeDisabled();
    expect(screen.queryByTestId("condition-rows")).not.toBeInTheDocument();
    const condition = screen
      .getByRole("heading", { name: "Condition" })
      .closest("section")!;
    expect(within(condition).getByText("comparison.eq")).toBeInTheDocument();
  });

  it("says so when the case is gone", () => {
    renderPanel(
      <CasePanel editor={editorWith(decision())} branchId="removed" />,
    );

    expect(screen.getByText("Cet élément n’existe plus.")).toBeInTheDocument();
  });

  it("sums the case up in plain words, once its condition is complete", () => {
    renderPanel(
      <CaseFooter editor={editorWith(decision())} branchId="empty" />,
    );
    expect(screen.getByText("En clair").nextSibling).toHaveTextContent(
      /^Si .+ : envoyer la notification « Réduire la consigne »\.$/,
    );
    cleanup();

    renderPanel(
      <CaseFooter
        editor={editorWith(decision(), {
          incompleteConditions: new Set(["empty"]),
        })}
        branchId="empty"
      />,
    );
    expect(screen.queryByText("En clair")).not.toBeInTheDocument();
  });
});
