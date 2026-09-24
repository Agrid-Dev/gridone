import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  Action,
  Automation,
  AutomationBranch,
  AutomationCreate,
  AutomationExecution,
  AutomationUpdate,
  Trigger,
  WriteCondition,
} from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import schema from "./__fixtures__/schema.json";

const { client, navigate } = vi.hoisted(() => ({
  client: {
    automations: {
      get: vi.fn<(id: string) => Promise<Automation>>(),
      listExecutions: vi.fn<(id: string) => Promise<AutomationExecution[]>>(),
      listDiagnostics: vi.fn<(id: string) => Promise<unknown[]>>(),
      schema: vi.fn<() => Promise<unknown>>(),
      create: vi.fn<(body: AutomationCreate) => Promise<Automation>>(),
      update:
        vi.fn<(id: string, body: AutomationUpdate) => Promise<Automation>>(),
      delete: vi.fn<(id: string) => Promise<void>>(),
      disable: vi.fn<(id: string, reason?: string) => Promise<Automation>>(),
      enable: vi.fn<(id: string) => Promise<Automation>>(),
    },
    users: { get: vi.fn() },
    devices: { list: vi.fn(), commandTemplates: { get: vi.fn() } },
  },
  navigate: vi.fn(),
}));

let canPermission: (perm: string) => boolean = () => true;

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => client,
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (perm: string) => canPermission(perm),
}));
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigate,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Automatisations",
    enabledBadge: "Activée",
    disabledBadge: "Désactivée",
    "editPage.breadcrumbLabel": "Fil d’Ariane",
    "editPage.lastExecution": "Dernière exécution {{ago}}.",
    "editPage.neverExecuted": "Jamais exécutée pour le moment.",
    "editPage.unsavedChanges": "Modifications non enregistrées",
    "editPage.saveChanges": "Enregistrer les modifications",
    "editPage.deleteHint": "L’historique d’exécution est conservé.",
    "editor.untitled": "Nouvelle automatisation",
    "editor.create": "Créer l’automatisation",
    "editor.toComplete": "{{count}} élément(s) à compléter",
    "editor.show": "Voir",
    "editor.allSaved": "Tout est enregistré",
    "editor.nameRequired": "Donnez un nom à l’automatisation.",
    "editor.enableOnCreate": "Activer dès l’enregistrement",
    "common:common.cancel": "Annuler",
    "common:common.saving": "Enregistrement…",
    "common:deletion.title": "Supprimer {{name}} ?",
    "common:deletion.irreversible": "C’est définitif.",
    "common.cancel": "Annuler",
    "deletion.pending": "Suppression…",
    "fields.name": "Nom",
    "fields.description": "Description",
    "metadata.createdAt": "Créée",
    "metadata.createdBy": "Créée par",
    "metadata.updatedAt": "Dernière modification",
    "actions.delete": "Supprimer",
    "actions.disable": "Désactiver",
    "actions.enable": "Activer",
    "actions.types.inline_write": "Écrire un attribut",
    "actions.types.notification": "Envoyer une notification",
    "deleteConfirm.details": "Supprimer « {{name}} » ?",
    "deactivation.title": "Désactiver {{name}}",
    "deactivation.reason": "Motif (facultatif)",
    "deactivation.confirm": "Désactiver l’automatisme",
    "executions.title": "Exécutions",
    "executions.empty": "Aucune exécution pour le moment",
    "executions.viewBatch": "Commande exécutée",
    "executions.status.success": "Réussie",
    "executions.status.failed": "Échouée",
    "executions.outcome.success": "Réussie",
    "executions.outcome.failed": "Échouée",
    "replay.title": "Relecture de l’exécution · {{moment}}",
    "replay.quit": "Quitter la relecture",
    "replay.older": "Exécution précédente",
    "replay.newer": "Exécution suivante",
    "deactivation.breaker": "Coupe-circuit ouvert",
    "reasons.consecutive_failures": "Échecs répétés des exécutions.",
    "tree.title": "Arbre de l’automatisation",
    "tree.cancel": "Annuler",
    "tree.when": "Quand",
    "tree.decision": "Décision",
    "tree.if": "Si",
    "tree.elseIf": "Sinon, si",
    "tree.otherwise": "Sinon",
    "tree.otherwiseRule": "Aucun cas précédent n’est vrai",
    "tree.nothing": "Ne rien faire",
    "tree.chooseTrigger": "Choisir un déclencheur",
    "tree.chooseAction": "Choisir une action",
    "tree.chooseCondition": "À compléter : choisissez ce qu’il faut comparer",
    "tree.insertCondition": "Ajouter une condition",
    "tree.addCase": "Ajouter un cas",
    "tree.results.matched": "Vrai",
    "tree.results.not_matched": "Faux",
    "tree.results.unknown": "Inconnu",
    "tree.results.skipped": "Non testé",
    "tree.results.taken": "Suivi",
    "panel.label": "Élément sélectionné",
    "panel.tab.configure": "Configurer",
    "panel.tab.executions": "Exécutions",
    "panel.automation.kicker": "Automatisation",
    "panel.trigger.title": "Déclencheur",
    "panel.case.kicker": "Cas {{position}} sur {{total}}",
    "panel.case.untitled": "Cas {{position}}",
    "panel.case.name": "Nom du cas",
    "panel.case.menu": "Actions du cas",
    "panel.case.earlier": "Tester plus tôt",
    "panel.case.later": "Tester plus tard",
    "panel.case.remove": "Supprimer le cas",
    "panel.otherwise.act": "Exécuter une action",
    "panel.executions.detail": "Exécution sélectionnée",
  }),
);

// ------------------------------------------------------------- fixtures

const ROOM = "salle20100000000";

const TRIGGER: Trigger = {
  provider_id: "schedule",
  params: { cron: "0 6 * * *" },
};
const EDITED_TRIGGER: Trigger = {
  provider_id: "schedule",
  params: { cron: "0 7 * * *" },
};
const EDITED_ACTION: Action = {
  provider_id: "notification",
  params: {
    title: "Prévenir l’astreinte",
    body: "",
    severity: "warning",
    user_ids: ["u2"],
  },
};
/** What the (stubbed) condition editor fills a condition with. */
const FILLED: WriteCondition = {
  op: "lt",
  left: { device_id: "meteo00000000000", attribute: "outdoor_temperature" },
  right: 5,
};

// The trigger, action and condition editors own their form state and have
// their own specs; the page only cares about what they report, so each is a
// readout plus buttons that report a value.
vi.mock("./form/TriggerForm", () => ({
  default: ({
    initialValue,
    onChange,
  }: {
    initialValue?: Trigger;
    onChange?: (trigger: Trigger | null) => void;
  }) => (
    <div data-testid="trigger-form">
      type={initialValue?.provider_id}
      <button type="button" onClick={() => onChange?.(EDITED_TRIGGER)}>
        edit trigger
      </button>
    </div>
  ),
}));
/** Counts action form mounts, so a test can tell a re-render from a remount. */
const forms = vi.hoisted(() => ({ mounts: 0 }));
vi.mock("./form/ActionForm", () => ({
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
          edit action
        </button>
        <button type="button" onClick={() => onChange?.(null)}>
          leave action incomplete
        </button>
      </div>
    );
  },
}));
vi.mock("@/pages/devices/device/operating-rules/ConditionRows", () => ({
  ConditionRows: ({
    onChange,
  }: {
    onChange: (condition: WriteCondition) => void;
  }) => (
    <div data-testid="condition-rows">
      <button type="button" onClick={() => onChange(FILLED)}>
        fill condition
      </button>
    </div>
  ),
}));
vi.mock("./presenters/TriggerPresenter", () => ({
  TriggerPresenter: ({ trigger }: { trigger: Trigger }) => (
    <div data-testid="trigger-presenter">type={trigger.provider_id}</div>
  ),
}));
vi.mock("./presenters/ActionPresenter", () => ({
  ActionPresenter: ({ action }: { action: Action }) => (
    <div data-testid="action-presenter">type={action.provider_id}</div>
  ),
}));

import AutomationPage from "./AutomationPage";
import NewAutomationPage from "../NewAutomationPage";

const presenceIs = (value: boolean): WriteCondition => ({
  op: "eq",
  left: { device_id: ROOM, attribute: "presence" },
  right: value,
});
const write = (value: number): Action => ({
  provider_id: "command_template",
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

/** "Salle vide" → write 17; otherwise → notify "Chauffage normal". */
const AUTOMATION = {
  id: "a1",
  name: "Chauffage salle 201",
  description: "Évite de chauffer une salle vide",
  enabled: true,
  trigger: TRIGGER,
  branches: [
    branch("empty", {
      name: "Salle vide",
      condition: presenceIs(false),
      action: write(17),
    }),
    branch("else", { action: notify("Chauffage normal") }),
  ],
  guardrails: {
    max_executions: 10,
    window_seconds: 60,
    max_consecutive_failures: 3,
  },
  created_by: "u1",
  created_at: "2026-09-20T08:00:00Z",
  updated_at: "2026-09-20T08:00:00Z",
} as Automation;

type BranchEvaluation = NonNullable<AutomationExecution["branches"]>[number];
const evaluated = (
  branchId: string,
  result: BranchEvaluation["result"],
  path: number[],
): BranchEvaluation => ({ branch_id: branchId, result, path, missing: [] });

const SUCCESS: AutomationExecution = {
  id: "run-ok",
  automation_id: "a1",
  triggered_at: "2026-09-22T06:00:00Z",
  executed_at: "2026-09-22T06:00:01Z",
  status: "success",
  output_id: "batch-abc",
  branch_id: "empty",
  branches: [evaluated("empty", "matched", [1])],
};
const FAILED: AutomationExecution = {
  id: "run-ko",
  automation_id: "a1",
  triggered_at: "2026-09-22T07:00:00Z",
  executed_at: "2026-09-22T07:00:01Z",
  status: "failed",
  error: "Timeout waiting for device",
  branch_id: "else",
  branches: [
    evaluated("empty", "not_matched", [1]),
    evaluated("else", "matched", [2]),
  ],
};

/** What the fake server holds: `get` answers the last saved version. */
let stored: Automation;

function renderPage(path = "/automations/a1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/automations/new" element={<NewAutomationPage />} />
          <Route
            path="/automations/:automationId"
            element={<AutomationPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The page is on screen and its run log has loaded. */
async function opened(name = AUTOMATION.name) {
  await screen.findByRole("heading", { level: 1, name });
  await screen.findByText(/^Dernière exécution .+\.$/);
}

const canvas = () =>
  screen.getByRole("region", { name: "Arbre de l’automatisation" });
const panel = () =>
  screen.getByRole("complementary", { name: "Élément sélectionné" });
/** The tree card that shows `text`. */
function card(text: string | RegExp): HTMLElement {
  const node = within(canvas()).getByText(text).closest("button");
  if (!node) throw new Error(`no card shows ${String(text)}`);
  return node;
}
const saveButton = () =>
  screen.getByRole("button", { name: "Enregistrer les modifications" });
const insertButtons = () =>
  within(canvas()).queryAllByRole("button", { name: "Ajouter une condition" });
const addCaseButtons = () =>
  within(canvas()).queryAllByRole("button", { name: "Ajouter un cas" });

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

beforeEach(() => {
  canPermission = () => true;
  stored = AUTOMATION;
  client.automations.get.mockImplementation(async () => stored);
  client.automations.listExecutions.mockResolvedValue([SUCCESS, FAILED]);
  client.automations.listDiagnostics.mockResolvedValue([]);
  client.automations.schema.mockResolvedValue(schema);
  client.automations.update.mockImplementation(async (_id, body) => {
    stored = { ...stored, ...(body as Partial<Automation>) };
    return stored;
  });
  client.automations.create.mockImplementation(async (body) => ({
    ...(body as Automation),
    id: "new-automation",
  }));
  client.automations.delete.mockResolvedValue(undefined);
  client.automations.disable.mockImplementation(async () => stored);
  client.users.get.mockResolvedValue({ id: "u1", username: "alice" });
  client.devices.list.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ------------------------------------------------------------------ specs

describe("AutomationPage", () => {
  it("renders the header, the tree and the run log", async () => {
    const user = userEvent.setup();
    renderPage();
    await opened();

    expect(
      screen.getByRole("link", { name: "Automatisations" }),
    ).toHaveAttribute("href", "/automations");
    // The status is shown once, as the badge next to the title; the switch
    // carries its own accessible name.
    expect(screen.getByText("Activée")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Désactiver" })).toBeChecked();
    expect(screen.getByText("Tout est enregistré")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeDisabled();

    expect(card("Quand")).toBeInTheDocument();
    expect(card("Décision")).toBeInTheDocument();
    expect(within(card("Salle vide")).getByText("Si")).toBeInTheDocument();
    expect(card("Sinon")).toBeInTheDocument();
    expect(card("Écrire un attribut")).toBeInTheDocument();
    expect(card("Chauffage normal")).toBeInTheDocument();
    // Editable: a condition can go above the tree and above each action,
    // a case can join the decision.
    expect(insertButtons()).toHaveLength(3);
    expect(addCaseButtons()).toHaveLength(1);

    expect(within(panel()).getByLabelText("Nom")).toHaveValue(
      "Chauffage salle 201",
    );
    expect(within(panel()).getByLabelText("Description")).toHaveValue(
      "Évite de chauffer une salle vide",
    );

    await user.click(screen.getByRole("tab", { name: "Exécutions" }));
    const runs = within(
      screen.getByRole("list", { name: "Exécutions" }),
    ).getAllByRole("button");
    // Newest first.
    expect(runs[0]).toHaveTextContent(
      /Échouée.*Sinon → Envoyer une notification$/,
    );
    expect(runs[1]).toHaveTextContent(
      /Réussie.*Salle vide → Écrire un attribut$/,
    );
    await user.click(runs[1]);
    expect(
      within(
        screen.getByRole("region", { name: "Exécution sélectionnée" }),
      ).getByRole("link", { name: /Commande exécutée/ }),
    ).toHaveAttribute("href", "/devices/commands?batch_id=batch-abc");
  });

  it("shows who created the automation, and when it last changed only if it did", async () => {
    renderPage();
    await opened();

    expect(
      await within(panel()).findByText(/^Créée : .+ · Créée par : alice$/),
    ).toBeInTheDocument();
    expect(
      within(panel()).queryByText(/Dernière modification/),
    ).not.toBeInTheDocument();
    cleanup();

    stored = { ...AUTOMATION, updated_at: "2026-09-22T17:00:00Z" };
    renderPage();
    await opened();
    expect(
      within(panel()).getByText(/ · Dernière modification : /),
    ).toBeInTheDocument();
  });

  it("saves the name, the trigger and the tree in one update", async () => {
    const user = userEvent.setup();
    renderPage();
    await opened();

    const name = within(panel()).getByLabelText("Nom");
    await user.clear(name);
    await user.type(name, "Chauffage salle 202");

    await user.click(card("Quand"));
    await user.click(
      within(panel()).getByRole("button", { name: "edit trigger" }),
    );

    // A condition in front of "Salle vide"'s action: the new case opens.
    await user.click(insertButtons()[1]);
    expect(saveButton()).toBeDisabled();
    await user.click(
      within(panel()).getByRole("button", { name: "fill condition" }),
    );

    await user.click(card("Chauffage normal"));
    await user.click(
      within(panel()).getByRole("button", { name: "edit action" }),
    );

    expect(saveButton()).toBeEnabled();
    await user.click(saveButton());

    await screen.findByText("Tout est enregistré");
    expect(client.automations.update).toHaveBeenCalledTimes(1);
    const [id, body] = client.automations.update.mock.calls[0];
    expect(id).toBe("a1");
    const added = body.branches?.[0]?.branches?.[0]?.id;
    expect(added).toMatch(/^[0-9a-f]{16}$/);
    expect(body).toStrictEqual({
      name: "Chauffage salle 202",
      description: "Évite de chauffer une salle vide",
      trigger: EDITED_TRIGGER,
      branches: [
        branch("empty", {
          name: "Salle vide",
          condition: presenceIs(false),
          branches: [branch(added!, { condition: FILLED, action: write(17) })],
        }),
        branch("else", { action: EDITED_ACTION }),
      ],
    });
    expect(saveButton()).toBeDisabled();
  });

  it("says what is left to complete, and « Voir » opens it", async () => {
    const user = userEvent.setup();
    renderPage();
    await opened();

    await user.click(insertButtons()[1]);
    await user.click(card("Quand"));
    expect(screen.getByText(/^1 élément\(s\) à compléter/)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Voir" }));

    expect(within(panel()).getByText("Cas 1 sur 1")).toBeInTheDocument();
    await user.click(
      within(panel()).getByRole("button", { name: "fill condition" }),
    );
    expect(screen.queryByText(/à compléter/)).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("drops pending edits on cancel", async () => {
    const user = userEvent.setup();
    renderPage();
    await opened();

    await user.type(within(panel()).getByLabelText("Nom"), " bis");
    expect(
      screen.getByText("Modifications non enregistrées"),
    ).toBeInTheDocument();
    await user.click(addCaseButtons()[0]);
    expect(within(canvas()).getAllByText("Sinon, si")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(within(panel()).getByLabelText("Nom")).toHaveValue(
      "Chauffage salle 201",
    );
    expect(within(canvas()).queryByText("Sinon, si")).not.toBeInTheDocument();
    expect(screen.getByText("Tout est enregistré")).toBeInTheDocument();
    expect(client.automations.update).not.toHaveBeenCalled();
  });

  it("keeps Save disabled while the name is empty", async () => {
    const user = userEvent.setup();
    renderPage();
    await opened();

    await user.clear(within(panel()).getByLabelText("Nom"));

    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(/^1 élément\(s\) à compléter/)).toBeInTheDocument();
    expect(
      within(panel()).getByText("Donnez un nom à l’automatisation."),
    ).toBeInTheDocument();
    await user.click(saveButton());
    expect(client.automations.update).not.toHaveBeenCalled();

    await user.type(within(panel()).getByLabelText("Nom"), "Salle 201");
    expect(saveButton()).toBeEnabled();
  });

  it("keeps Save disabled while an action is left incomplete on its card", async () => {
    const user = userEvent.setup();
    renderPage();
    await opened();
    await user.type(within(panel()).getByLabelText("Nom"), " bis");
    expect(saveButton()).toBeEnabled();

    await user.click(card("Chauffage normal"));
    await user.click(
      within(panel()).getByRole("button", { name: "leave action incomplete" }),
    );

    expect(saveButton()).toBeDisabled();
  });

  // Reported defect: the « Sinon » panel ignores an incomplete report from its
  // action form (`if (action) setOtherwise(...)`), so Save stays enabled and
  // saves the previous action while the form shows something else — unlike
  // the same action edited from its card (see the test above).
  it("keeps Save disabled while the « Sinon » action is left incomplete in its panel", async () => {
    const user = userEvent.setup();
    renderPage();
    await opened();
    await user.type(within(panel()).getByLabelText("Nom"), " bis");

    await user.click(card("Sinon"));
    expect(
      within(panel()).getByRole("radio", { name: /^Exécuter une action/ }),
    ).toBeChecked();
    await user.click(
      within(panel()).getByRole("button", {
        name: "leave action incomplete",
      }),
    );

    expect(saveButton()).toBeDisabled();
  });

  it("moves and removes a case from its menu", async () => {
    const user = userEvent.setup();
    stored = {
      ...AUTOMATION,
      branches: [
        branch("empty", {
          name: "Salle vide",
          condition: presenceIs(false),
          action: write(17),
        }),
        branch("window", {
          name: "Fenêtre ouverte",
          condition: presenceIs(true),
          action: write(12),
        }),
        branch("else", { action: notify("Chauffage normal") }),
      ],
    };
    renderPage();
    await opened();

    await user.click(card("Fenêtre ouverte"));
    expect(within(panel()).getByText("Cas 2 sur 2")).toBeInTheDocument();
    await user.click(
      within(panel()).getByRole("button", { name: "Actions du cas" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Tester plus tard" }),
    ).toHaveAttribute("data-disabled");
    await user.click(screen.getByRole("menuitem", { name: "Tester plus tôt" }));

    expect(within(card("Fenêtre ouverte")).getByText("Si")).toBeInTheDocument();
    expect(
      within(card("Salle vide")).getByText("Sinon, si"),
    ).toBeInTheDocument();
    expect(within(panel()).getByText("Cas 1 sur 2")).toBeInTheDocument();

    await user.click(
      within(panel()).getByRole("button", { name: "Actions du cas" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Supprimer le cas" }),
    );

    expect(
      within(canvas()).queryByText("Fenêtre ouverte"),
    ).not.toBeInTheDocument();
    expect(within(card("Salle vide")).getByText("Si")).toBeInTheDocument();
    // The panel falls back to the automation itself.
    expect(within(panel()).getByLabelText("Nom")).toBeInTheDocument();
  });

  it("shows how a failed run ended, in the log and on the tree it ran through", async () => {
    const user = userEvent.setup();
    renderPage();
    await opened();

    await user.click(screen.getByRole("tab", { name: "Exécutions" }));
    const [failed] = within(
      screen.getByRole("list", { name: "Exécutions" }),
    ).getAllByRole("button");
    expect(within(failed).getByText("Échouée")).toBeInTheDocument();
    await user.click(failed);

    expect(
      screen.getByRole("region", { name: "Exécution sélectionnée" }),
    ).toHaveTextContent("Timeout waiting for device");
    expect(
      screen.getByText(/^Relecture de l’exécution · /),
    ).toBeInTheDocument();
    // The tree replays the run: case false, « Sinon » followed, its action failed.
    expect(within(card("Salle vide")).getByText("Faux")).toBeInTheDocument();
    expect(within(card("Sinon")).getByText("Suivi")).toBeInTheDocument();
    expect(
      within(card("Chauffage normal")).getByText("Échouée"),
    ).toBeInTheDocument();
    // What ran cannot be edited while it is replayed.
    expect(insertButtons()).toHaveLength(0);
    expect(addCaseButtons()).toHaveLength(0);

    await user.click(
      screen.getByRole("button", { name: /Quitter la relecture/ }),
    );
    expect(insertButtons()).toHaveLength(3);
    expect(
      within(card("Salle vide")).queryByText("Faux"),
    ).not.toBeInTheDocument();
  });

  it("steps through the runs from the replay banner, newest to oldest", async () => {
    const user = userEvent.setup();
    renderPage();
    await opened();
    await user.click(screen.getByRole("tab", { name: "Exécutions" }));
    const [newest] = within(
      screen.getByRole("list", { name: "Exécutions" }),
    ).getAllByRole("button");
    await user.click(newest);

    expect(
      screen.getByRole("button", { name: "Exécution suivante" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Exécution précédente" }),
    );

    // The older run took "Salle vide" and succeeded.
    expect(within(card("Salle vide")).getByText("Vrai")).toBeInTheDocument();
    expect(
      within(card("Écrire un attribut")).getByText("Réussie"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Exécution précédente" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Exécution suivante" }),
    ).toBeEnabled();
  });

  it("says why a tripped automation is not running", async () => {
    stored = {
      ...AUTOMATION,
      enabled: false,
      deactivation: {
        reason: "consecutive_failures",
        actor_id: "system",
        at: "2026-09-22T08:00:00Z",
        source: "circuit_breaker",
      },
    };
    renderPage();
    await opened();

    const banner = screen
      .getAllByRole("status")
      .find((node) => node.textContent?.includes("Coupe-circuit ouvert"));
    expect(banner).toHaveTextContent(
      /^Coupe-circuit ouvert · Échecs répétés des exécutions\. · system · /,
    );
    // Resuming goes through the same switch, now offering to enable.
    expect(screen.getByRole("switch", { name: "Activer" })).not.toBeChecked();
  });

  it("is read-only without automations:write", async () => {
    const user = userEvent.setup();
    canPermission = (perm) => perm === "automations:read";
    renderPage();
    await opened();

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enregistrer les modifications" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Annuler" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Supprimer" }),
    ).not.toBeInTheDocument();
    expect(insertButtons()).toHaveLength(0);
    expect(addCaseButtons()).toHaveLength(0);
    expect(within(panel()).getByLabelText("Nom")).toBeDisabled();

    await user.click(card("Quand"));
    expect(screen.queryByTestId("trigger-form")).not.toBeInTheDocument();
    expect(screen.getByTestId("trigger-presenter")).toHaveTextContent(
      "type=schedule",
    );
    await user.click(card("Chauffage normal"));
    expect(screen.queryByTestId("action-form")).not.toBeInTheDocument();
    expect(screen.getByTestId("action-presenter")).toHaveTextContent(
      "type=notification",
    );
  });

  it("disables with the reason the operator gives", async () => {
    const user = userEvent.setup();
    renderPage();
    await opened();

    await user.click(screen.getByRole("switch", { name: "Désactiver" }));
    const dialog = screen.getByRole("dialog", {
      name: "Désactiver Chauffage salle 201",
    });
    await user.type(
      within(dialog).getByLabelText(/Motif \(facultatif\)/),
      "Maintenance",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Désactiver l’automatisme" }),
    );

    await waitFor(() =>
      expect(client.automations.disable).toHaveBeenCalledWith(
        "a1",
        "Maintenance",
      ),
    );
  });

  it("disables without a reason when none is given", async () => {
    const user = userEvent.setup();
    renderPage();
    await opened();

    await user.click(screen.getByRole("switch", { name: "Désactiver" }));
    const dialog = screen.getByRole("dialog", {
      name: "Désactiver Chauffage salle 201",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Désactiver l’automatisme" }),
    );

    await waitFor(() =>
      expect(client.automations.disable).toHaveBeenCalledWith("a1", undefined),
    );
  });

  it("deletes after confirmation, then goes back to the list", async () => {
    const user = userEvent.setup();
    renderPage();
    await opened();

    await user.click(
      within(panel()).getByRole("button", { name: "Supprimer" }),
    );
    expect(client.automations.delete).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Supprimer",
      }),
    );

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/automations", {
        replace: true,
        state: null,
      }),
    );
    expect(client.automations.delete).toHaveBeenCalledWith("a1");
  });
});

describe("NewAutomationPage", () => {
  it("builds an automation from « Voir » to « Créer »", async () => {
    const user = userEvent.setup();
    renderPage("/automations/new");
    await screen.findByRole("heading", {
      level: 1,
      name: "Nouvelle automatisation",
    });

    // It opens on the trigger, with no run log to show.
    expect(within(panel()).getByTestId("trigger-form")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(card("Choisir un déclencheur")).toBeInTheDocument();
    expect(card("Choisir une action")).toBeInTheDocument();
    const create = screen.getByRole("button", {
      name: "Créer l’automatisation",
    });
    expect(create).toBeDisabled();
    expect(screen.getByText(/^3 élément\(s\) à compléter/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Voir" }));
    await user.type(
      within(panel()).getByLabelText("Nom"),
      "Chauffage salle 201",
    );
    await user.click(
      within(panel()).getByRole("switch", {
        name: "Activer dès l’enregistrement",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Voir" }));
    await user.click(
      within(panel()).getByRole("button", { name: "edit trigger" }),
    );

    await user.click(screen.getByRole("button", { name: "Voir" }));
    await user.click(
      within(panel()).getByRole("button", { name: "edit action" }),
    );

    expect(screen.queryByText(/à compléter/)).not.toBeInTheDocument();
    expect(create).toBeEnabled();
    await user.click(create);

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/automations/new-automation"),
    );
    expect(client.automations.create).toHaveBeenCalledTimes(1);
    const body = client.automations.create.mock.calls[0][0];
    const pathId = body.branches?.[0]?.id;
    expect(pathId).toMatch(/^[0-9a-f]{16}$/);
    expect(body).toStrictEqual({
      name: "Chauffage salle 201",
      description: "",
      trigger: EDITED_TRIGGER,
      branches: [branch(pathId!, { action: EDITED_ACTION })],
      enabled: false,
    });
  });

  it("keeps the action form in hand when its path gets its first action and its card is clicked", async () => {
    const user = userEvent.setup();
    renderPage("/automations/new");
    await screen.findByRole("heading", {
      level: 1,
      name: "Nouvelle automatisation",
    });

    await user.click(card("Choisir une action"));
    const mount = within(panel()).getByTestId("action-form").dataset.mount;
    await user.click(
      within(panel()).getByRole("button", { name: "edit action" }),
    );
    // The path now shows its action, still selected; opening it keeps the form.
    expect(card("Prévenir l’astreinte")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(card("Prévenir l’astreinte"));

    expect(within(panel()).getByTestId("action-form").dataset.mount).toBe(
      mount,
    );
  });

  it("goes back to the list on cancel", async () => {
    const user = userEvent.setup();
    renderPage("/automations/new");
    await screen.findByRole("heading", {
      level: 1,
      name: "Nouvelle automatisation",
    });

    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(navigate).toHaveBeenCalledWith("/automations");
    expect(client.automations.create).not.toHaveBeenCalled();
  });
});
