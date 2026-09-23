import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  Action,
  AutomationBranch,
  AutomationExecution,
  Trigger,
  WriteCondition,
} from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "tree.when": "Quand",
    "tree.chooseTrigger": "Choisir un déclencheur",
    "tree.decision": "Décision",
    "tree.decisionRule": "Le 1er cas vrai, de gauche à droite",
    "tree.if": "Si",
    "tree.elseIf": "Sinon, si",
    "tree.otherwise": "Sinon",
    "tree.otherwiseRule": "Aucun cas précédent n’est vrai",
    "tree.alwaysTrue": "Toujours vrai",
    "tree.unreachable": "Jamais testé",
    "tree.chooseCondition": "À compléter : choisissez ce qu’il faut comparer",
    "tree.nothing": "Ne rien faire",
    "tree.chooseAction": "Choisir une action",
    "tree.actionIncomplete": "Action à compléter",
    "tree.insertCondition": "Ajouter une condition",
    "tree.addCase": "Ajouter un cas",
    "tree.limitReached": "{{max}} cas au maximum par automatisation",
    "tree.results.matched": "Vrai",
    "tree.results.not_matched": "Faux",
    "tree.results.unknown": "Inconnu",
    "tree.results.skipped": "Non testé",
    "tree.results.taken": "Suivi",
    "actions.types.write_attribute": "Écrire un attribut",
    "actions.types.notification": "Envoyer une notification",
    "actions.types.command_template": "Exécuter une commande",
    "executions.outcome.success": "Réussie",
    "executions.outcome.no_match": "Aucun cas vrai",
    "executions.outcome.rejected": "Refusée par une règle",
  }),
);

// Command cards look their template up; it never answers here, so they keep
// their generic title and no request settles after a test.
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: { commandTemplates: { get: () => new Promise(() => {}) } },
  }),
}));

import { AutomationTree } from "./AutomationTree";
import {
  MAX_TREE_DEPTH,
  ROOT,
  replayOf,
  type InsertTarget,
  type LevelId,
} from "./model";
import {
  TreeContext,
  type Selection,
  type TreeContextValue,
} from "./TreeContext";

// ------------------------------------------------------------- fixtures

const ROOM = "salle20100000000";
const WEATHER = "meteo00000000000";

const TRIGGER: Trigger = {
  provider_id: "schedule",
  params: { cron: "0 7 * * *" },
};

const presenceIs = (value: boolean): WriteCondition => ({
  op: "eq",
  left: { device_id: ROOM, attribute: "presence" },
  right: value,
});
const windowOpen: WriteCondition = {
  op: "eq",
  left: { device_id: ROOM, attribute: "window_open" },
  right: true,
};
const coldOutside: WriteCondition = {
  op: "lt",
  left: { device_id: WEATHER, attribute: "outdoor_temperature" },
  right: 5,
};
const probeSilent: WriteCondition = {
  op: "not",
  condition: {
    op: "is_known",
    value: { device_id: ROOM, attribute: "room_temperature" },
  },
};

const notify = (title: string): Action => ({
  provider_id: "notification",
  params: { title, body: "", severity: "info", user_ids: ["u1"] },
});
const write = (value: number): Action => ({
  provider_id: "write_attribute",
  params: { device_id: null, attribute: "heating_setpoint", value },
});
const command = (templateId: string): Action => ({
  provider_id: "command_template",
  params: { template_id: templateId },
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

/** Trigger → one action: the whole automation is a single path. */
const SINGLE = [branch("only", { action: notify("Alerte chaufferie") })];

/** One decision: three cases tested left to right, then "otherwise". */
const flat = (otherwise?: Action) => [
  branch("empty", {
    name: "Salle vide",
    condition: presenceIs(false),
    action: notify("Réduire la consigne"),
  }),
  branch("window", {
    name: "Fenêtre ouverte",
    condition: windowOpen,
    action: notify("Fermer la fenêtre"),
  }),
  branch("cold", {
    name: "Froid dehors",
    condition: coldOutside,
    action: notify("Préchauffer"),
  }),
  ...(otherwise ? [branch("else", { action: otherwise })] : []),
];

/**
 * A decision whose second case opens another decision (the harness tree):
 *
 *   Sonde muette → notify | Salle vide → (Froid dehors → write | Sinon → command) | Sinon → nothing
 */
const NESTED = [
  branch("probe", {
    name: "Sonde muette",
    condition: probeSilent,
    action: notify("Alerte sonde"),
  }),
  branch("empty", {
    name: "Salle vide",
    condition: presenceIs(false),
    branches: [
      branch("cold", {
        name: "Froid dehors",
        condition: coldOutside,
        action: write(17),
      }),
      branch("cold-else", { action: command("tpl-stop") }),
    ],
  }),
];

// ---------------------------------------------------------------- harness

const select = vi.fn<(selection: Selection) => void>();
const insertCondition = vi.fn<(target: InsertTarget) => void>();
const addCase = vi.fn<(levelId: LevelId) => void>();
/** The canvas behind the tree: its background click selects the automation. */
const background = vi.fn();

function renderTree(
  branches: AutomationBranch[],
  overrides: Partial<TreeContextValue> = {},
) {
  const value: TreeContextValue = {
    editable: true,
    selection: { kind: "automation" },
    select,
    trigger: TRIGGER,
    catalog: { devices: [] },
    incompleteConditions: new Set(),
    incompleteActions: new Set(),
    replay: null,
    insertCondition,
    addCase,
    canAddBranch: true,
    maxDepth: MAX_TREE_DEPTH,
    ...overrides,
  };
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TreeContext.Provider value={value}>
        <div onClick={background}>
          <AutomationTree branches={branches} />
        </div>
      </TreeContext.Provider>
    </QueryClientProvider>,
  );
}

/** The card (every tree node is one button) that shows `text`. */
function card(text: string | RegExp): HTMLElement {
  const node = screen.getByText(text).closest("button");
  if (!node) throw new Error(`no card shows ${String(text)}`);
  return node;
}

/**
 * Every card labelled `label`, in document order: a nested decision's cards
 * come before the lanes to the right of the case that opens it.
 */
function cards(label: string): HTMLElement[] {
  return screen.getAllByText(label).map((node) => node.closest("button")!);
}

const insertButtons = () =>
  screen.queryAllByRole("button", { name: "Ajouter une condition" });
const addCaseButtons = () =>
  screen.queryAllByRole("button", { name: "Ajouter un cas" });

function run(extra: Partial<AutomationExecution>): AutomationExecution {
  return {
    id: "run-1",
    automation_id: "a1",
    triggered_at: "2026-09-23T06:00:00Z",
    executed_at: "2026-09-23T06:00:01Z",
    status: "success",
    ...extra,
  };
}

type BranchEvaluation = NonNullable<AutomationExecution["branches"]>[number];

const evaluated = (
  branchId: string,
  result: BranchEvaluation["result"],
  path: number[],
): BranchEvaluation => ({ branch_id: branchId, result, path, missing: [] });

// jsdom lays nothing out. A decision's fork (and its "Ajouter un cas") is
// drawn from measured lanes, so give every element a width and each sibling
// its own position.
const LAYOUT: Record<string, PropertyDescriptor> = {
  offsetWidth: { get: () => 240 },
  offsetLeft: {
    get(this: HTMLElement) {
      const siblings = this.parentElement?.children ?? [];
      return Array.prototype.indexOf.call(siblings, this) * 240;
    },
  },
};
const jsdomLayout: Record<string, PropertyDescriptor | undefined> = {};
beforeAll(() => {
  for (const [name, descriptor] of Object.entries(LAYOUT)) {
    jsdomLayout[name] = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      name,
    );
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      ...descriptor,
    });
  }
});
afterAll(() => {
  for (const [name, descriptor] of Object.entries(jsdomLayout))
    if (descriptor)
      Object.defineProperty(HTMLElement.prototype, name, descriptor);
});

afterEach(() => {
  cleanup();
  select.mockReset();
  insertCondition.mockReset();
  addCase.mockReset();
  background.mockReset();
});

// ------------------------------------------------------------------ specs

describe("AutomationTree — shape", () => {
  it("draws trigger → action without any decision", () => {
    renderTree(SINGLE);

    expect(card("Quand")).toBeInTheDocument();
    expect(card("Alerte chaufferie")).toHaveTextContent(
      "Envoyer une notification",
    );
    expect(screen.queryByText("Décision")).not.toBeInTheDocument();
    expect(screen.queryByText("Si")).not.toBeInTheDocument();
    expect(screen.queryByText("Sinon")).not.toBeInTheDocument();
  });

  it("labels the cases of a decision Si, Sinon, si… in testing order, with Sinon last", () => {
    renderTree(flat(notify("Chauffage normal")));

    expect(screen.getByText("Décision")).toBeInTheDocument();
    expect(
      screen
        .getAllByText(/^(Si|Sinon, si|Sinon)$/)
        .map((label) => label.textContent),
    ).toEqual(["Si", "Sinon, si", "Sinon, si", "Sinon"]);
    expect(within(card("Salle vide")).getByText("Si")).toBeInTheDocument();
    expect(
      within(card("Fenêtre ouverte")).getByText("Sinon, si"),
    ).toBeInTheDocument();
    expect(
      within(card("Froid dehors")).getByText("Sinon, si"),
    ).toBeInTheDocument();
    // "Otherwise" leads to its own action, so nothing is "do nothing".
    expect(card("Chauffage normal")).toBeInTheDocument();
    expect(screen.queryByText("Ne rien faire")).not.toBeInTheDocument();
  });

  it("closes a decision without otherwise branch on « Ne rien faire »", () => {
    renderTree(flat());

    expect(cards("Sinon")).toHaveLength(1);
    expect(card("Ne rien faire")).toBeInTheDocument();
  });

  it("asks for an action on a path that has none, and for a trigger when there is none", () => {
    renderTree([branch("path")], { trigger: null });

    expect(card("Choisir un déclencheur")).toBeInTheDocument();
    expect(card("Choisir une action")).toBeInTheDocument();
  });

  it("marks the cases after an always-true legacy case as never tested", () => {
    renderTree([
      branch("always", { name: "Toujours", action: notify("A") }),
      branch("shadowed", {
        name: "Masqué",
        condition: windowOpen,
        action: notify("B"),
      }),
      branch("else", { action: notify("C") }),
    ]);

    expect(within(card("Toujours")).getByText("Toujours vrai")).toBeVisible();
    expect(within(card("Masqué")).getByText("Jamais testé")).toBeVisible();
    expect(
      within(card("Toujours")).queryByText("Jamais testé"),
    ).not.toBeInTheDocument();
  });

  it("flags the case and the action still to complete", () => {
    renderTree(flat(), {
      incompleteConditions: new Set(["window"]),
      incompleteActions: new Set(["cold"]),
    });

    expect(
      within(card("Fenêtre ouverte")).getByText(/^À compléter/),
    ).toBeInTheDocument();
    expect(
      within(card("Salle vide")).queryByText(/^À compléter/),
    ).not.toBeInTheDocument();
    expect(
      within(card("Préchauffer")).getByText("Action à compléter"),
    ).toBeInTheDocument();
    expect(
      within(card("Fermer la fenêtre")).queryByText("Action à compléter"),
    ).not.toBeInTheDocument();
  });
});

describe("AutomationTree — selection", () => {
  it("selects what each card stands for, without reaching the canvas behind", async () => {
    const user = userEvent.setup();
    renderTree(NESTED);

    const clicks: [HTMLElement, Selection][] = [
      [card("Quand"), { kind: "trigger" }],
      [cards("Décision")[0], { kind: "decision", levelId: ROOT }],
      [cards("Décision")[1], { kind: "decision", levelId: "empty" }],
      [card("Salle vide"), { kind: "case", branchId: "empty" }],
      [card("Froid dehors"), { kind: "case", branchId: "cold" }],
      // The inner "otherwise" first, then the outer one.
      [cards("Sinon")[0], { kind: "otherwise", levelId: "empty" }],
      [cards("Sinon")[1], { kind: "otherwise", levelId: ROOT }],
      [card("Ne rien faire"), { kind: "otherwise", levelId: ROOT }],
      [card("Alerte sonde"), { kind: "action", branchId: "probe" }],
      [
        card("Exécuter une commande"),
        { kind: "action", branchId: "cold-else" },
      ],
    ];
    for (const [target] of clicks) await user.click(target);

    expect(select.mock.calls).toEqual(clicks.map(([, expected]) => [expected]));
    expect(background).not.toHaveBeenCalled();
  });

  it("selects the path of a missing action", async () => {
    const user = userEvent.setup();
    renderTree([branch("path")]);

    await user.click(card("Choisir une action"));

    expect(select).toHaveBeenCalledWith({ kind: "empty", branchId: "path" });
  });

  it("presses the selected card only", () => {
    renderTree(NESTED, { selection: { kind: "action", branchId: "cold" } });

    const pressed = screen
      .getAllByRole("button", { pressed: true })
      .map((node) => node.textContent);
    expect(pressed).toEqual([card("Écrire un attribut").textContent]);
    // Same branch, other kind: the case card stays unpressed.
    expect(card("Froid dehors")).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps a path pressed once it got its first action", () => {
    // Selected while it waited for an action; the draft now has one.
    renderTree(NESTED, { selection: { kind: "empty", branchId: "cold" } });

    expect(card("Écrire un attribut")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("AutomationTree — editing", () => {
  it("inserts a condition above the whole tree, above a case's action, or above a nested decision", async () => {
    const user = userEvent.setup();
    renderTree(NESTED);

    const buttons = insertButtons();
    for (const button of buttons) await user.click(button);

    expect(insertCondition.mock.calls).toEqual([
      [{ kind: "level", levelId: ROOT }],
      [{ kind: "terminal", branchId: "probe" }],
      // "Salle vide" leads to a decision: the condition wraps its cases.
      [{ kind: "level", levelId: "empty" }],
      [{ kind: "terminal", branchId: "cold" }],
      [{ kind: "terminal", branchId: "cold-else" }],
      // "Ne rien faire" has no action to put a condition in front of.
    ]);
    expect(select).not.toHaveBeenCalled();
    expect(background).not.toHaveBeenCalled();
  });

  it("adds a case to the decision whose bar holds the « + »", async () => {
    const user = userEvent.setup();
    renderTree(NESTED);

    for (const button of addCaseButtons()) await user.click(button);

    expect(addCase.mock.calls).toEqual([[ROOT], ["empty"]]);
    expect(select).not.toHaveBeenCalled();
    expect(background).not.toHaveBeenCalled();
  });

  it("offers no « + » on a read-only tree", () => {
    renderTree(NESTED, { editable: false });

    expect(insertButtons()).toHaveLength(0);
    expect(addCaseButtons()).toHaveLength(0);
  });

  it("disables every « + » once the tree reached its limit, and says why", () => {
    renderTree(NESTED, { canAddBranch: false });

    // The server's own limit (MAX_RULES), not the editor's constant.
    const limit = "64 cas au maximum par automatisation";
    const plus = [...insertButtons(), ...addCaseButtons()];
    expect(plus).toHaveLength(7);
    for (const button of plus) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", limit);
    }
  });

  it("keeps every « + » enabled below the limit", () => {
    renderTree(NESTED);

    const plus = [...insertButtons(), ...addCaseButtons()];
    expect(plus).toHaveLength(7);
    for (const button of plus) expect(button).toBeEnabled();
    expect(insertButtons()[0]).toHaveAttribute(
      "title",
      "Ajouter une condition",
    );
  });
});

describe("AutomationTree — replay", () => {
  const chip = (target: HTMLElement, label: string) =>
    within(target).queryByText(label);

  it("shows what each case gave on the path the run followed, and the run's outcome on its action", () => {
    renderTree(NESTED, {
      editable: false,
      replay: replayOf(
        run({
          branch_id: "cold",
          context: {
            timestamp: "2026-09-23T06:00:00Z",
            device_id: "tmk0000000000003",
            attribute: "mode",
            previous_value: "off",
            value: "heat",
            has_previous: true,
            is_initial: false,
          },
          branches: [
            evaluated("probe", "not_matched", [1]),
            evaluated("empty", "matched", [2]),
            evaluated("cold", "matched", [2, 1]),
          ],
        }),
      ),
    });

    expect(chip(card("Sonde muette"), "Faux")).toBeInTheDocument();
    expect(chip(card("Salle vide"), "Vrai")).toBeInTheDocument();
    expect(chip(card("Froid dehors"), "Vrai")).toBeInTheDocument();
    const [inner, outer] = cards("Sinon");
    expect(chip(inner, "Non testé")).toBeInTheDocument();
    expect(chip(outer, "Non testé")).toBeInTheDocument();
    // Only the action that ran carries the run's outcome.
    expect(chip(card("Écrire un attribut"), "Réussie")).toBeInTheDocument();
    expect(chip(card("Alerte sonde"), "Réussie")).not.toBeInTheDocument();
    expect(
      chip(card("Exécuter une commande"), "Réussie"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Réussie")).toHaveLength(1);
    // The trigger card recalls the event that started the run.
    expect(within(card("Quand")).getByText("off → heat")).toBeInTheDocument();
  });

  it("follows « Sinon » when every case was false", () => {
    renderTree(NESTED, {
      editable: false,
      replay: replayOf(
        run({
          status: "no_match",
          reason: "no_matching_branch",
          branches: [
            evaluated("probe", "not_matched", [1]),
            evaluated("empty", "not_matched", [2]),
          ],
        }),
      ),
    });

    const [inner, outer] = cards("Sinon");
    expect(chip(outer, "Suivi")).toBeInTheDocument();
    expect(chip(card("Ne rien faire"), "Aucun cas vrai")).toBeInTheDocument();
    // The nested decision was never reached.
    expect(chip(card("Froid dehors"), "Non testé")).toBeInTheDocument();
    expect(chip(inner, "Non testé")).toBeInTheDocument();
    expect(screen.getAllByText("Suivi")).toHaveLength(1);
  });

  it("stops at an unknown value: nothing after it is tested, « Sinon » included", () => {
    renderTree(NESTED, {
      editable: false,
      replay: replayOf(
        run({
          status: "failed",
          reason: "condition_unknown",
          branches: [
            evaluated("probe", "not_matched", [1]),
            evaluated("empty", "unknown", [2]),
          ],
        }),
      ),
    });

    expect(chip(card("Sonde muette"), "Faux")).toBeInTheDocument();
    expect(chip(card("Salle vide"), "Inconnu")).toBeInTheDocument();
    expect(chip(cards("Sinon")[1], "Non testé")).toBeInTheDocument();
    expect(screen.queryByText("Suivi")).not.toBeInTheDocument();
    expect(
      within(card("Ne rien faire")).queryByText("Aucun cas vrai"),
    ).not.toBeInTheDocument();
  });

  it("never falls back from a nested decision to its parent's « Sinon »", () => {
    renderTree(
      [
        branch("empty", {
          name: "Salle vide",
          condition: presenceIs(false),
          branches: [
            branch("cold", {
              name: "Froid dehors",
              condition: coldOutside,
              action: write(17),
            }),
          ],
        }),
        branch("else", { action: notify("Chauffage normal") }),
      ],
      {
        editable: false,
        replay: replayOf(
          run({
            status: "no_match",
            reason: "no_matching_branch",
            branches: [
              evaluated("empty", "matched", [1]),
              evaluated("cold", "not_matched", [1, 1]),
            ],
          }),
        ),
      },
    );

    const [inner, outer] = cards("Sinon");
    expect(chip(inner, "Suivi")).toBeInTheDocument();
    expect(chip(card("Ne rien faire"), "Aucun cas vrai")).toBeInTheDocument();
    expect(chip(outer, "Non testé")).toBeInTheDocument();
    expect(
      chip(card("Chauffage normal"), "Aucun cas vrai"),
    ).not.toBeInTheDocument();
  });

  it("follows a nested « Sinon » action and shows how its run ended", () => {
    renderTree(NESTED, {
      editable: false,
      replay: replayOf(
        run({
          status: "failed",
          reason: "write_rejected",
          branch_id: "cold-else",
          branches: [
            evaluated("probe", "not_matched", [1]),
            evaluated("empty", "matched", [2]),
            evaluated("cold", "not_matched", [2, 1]),
            evaluated("cold-else", "matched", [2, 2]),
          ],
        }),
      ),
    });

    const [inner, outer] = cards("Sinon");
    expect(chip(inner, "Suivi")).toBeInTheDocument();
    expect(chip(outer, "Non testé")).toBeInTheDocument();
    expect(
      chip(card("Exécuter une commande"), "Refusée par une règle"),
    ).toBeInTheDocument();
    expect(chip(card("Froid dehors"), "Faux")).toBeInTheDocument();
  });
});
