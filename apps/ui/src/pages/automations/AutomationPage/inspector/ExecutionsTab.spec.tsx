import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type {
  Action,
  AutomationBranch,
  AutomationExecution,
  Device,
  WriteCondition,
} from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "executions.title": "Exécutions",
    "executions.empty": "Aucune exécution pour le moment",
    "executions.viewBatch": "Commande exécutée",
    "executions.status.success": "Réussie",
    "executions.status.failed": "Échouée",
    "executions.status.no_match": "Aucun cas vrai",
    "executions.outcome.success": "Réussie",
    "executions.outcome.failed": "Échouée",
    "executions.outcome.no_match": "Aucun cas vrai",
    "executions.outcome.rejected": "Refusée par une règle",
    "executions.outcome.unknown": "Arrêtée · donnée inconnue",
    "panel.case.untitled": "Cas {{position}}",
    "panel.executions.removedCase": "Cas supprimé",
    "panel.executions.stoppedAt": "Donnée inconnue dans « {{name}} »",
    "panel.executions.detail": "Exécution sélectionnée",
    "panel.executions.event": "Événement",
    "panel.executions.path": "Chemin",
    "panel.executions.result": "Résultat",
    "panel.executions.missing": "Inconnue ou périmée : {{refs}}",
    "tree.otherwise": "Sinon",
    "tree.nothing": "Ne rien faire",
    "tree.results.matched": "Vrai",
    "tree.results.not_matched": "Faux",
    "tree.results.unknown": "Inconnu",
    "actions.types.write_attribute": "Écrire un attribut",
    "actions.types.notification": "Envoyer une notification",
    "actions.types.command_template": "Exécuter une commande",
    "reasons.condition_unknown": "Une condition ne peut pas être évaluée.",
    "reasons.write_rejected": "L’écriture a été refusée par une protection.",
    "reasons.no_matching_branch": "Aucune branche ne correspond.",
  }),
);

import { MAX_TREE_DEPTH } from "../tree/model";
import { TreeContext, type TreeContextValue } from "../tree/TreeContext";
import { ExecutionsTab } from "./ExecutionsTab";

// ------------------------------------------------------------- fixtures

const ROOM = "salle20100000000";
const THERMOSTAT = {
  id: "tmk0000000000003",
  name: "TMK_mqtt_3",
  attributes: { mode: { name: "mode", data_type: "str" } },
} as unknown as Device;

const when = (attribute: string): WriteCondition => ({
  op: "eq",
  left: { device_id: ROOM, attribute },
  right: true,
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

/** Sonde muette → notify | Salle vide → (Froid dehors → write | Sinon → command) */
const TREE = [
  branch("probe", {
    name: "Sonde muette",
    condition: when("probe"),
    action: notify("Alerte sonde"),
  }),
  branch("empty", {
    name: "Salle vide",
    condition: when("presence"),
    branches: [
      branch("cold", {
        name: "Froid dehors",
        condition: when("frost"),
        action: write(17),
      }),
      branch("cold-else", {
        action: { provider_id: "command_template", params: {} },
      }),
    ],
  }),
];

type BranchEvaluation = NonNullable<AutomationExecution["branches"]>[number];
const evaluated = (
  branchId: string,
  result: BranchEvaluation["result"],
  path: number[],
  missing: string[] = [],
): BranchEvaluation => ({ branch_id: branchId, result, path, missing });

function run(
  id: string,
  extra: Partial<AutomationExecution>,
): AutomationExecution {
  return {
    id,
    automation_id: "a1",
    triggered_at: "2026-09-23T06:00:00Z",
    executed_at: "2026-09-23T06:00:01Z",
    status: "success",
    context: {
      timestamp: "2026-09-23T06:00:00Z",
      device_id: THERMOSTAT.id,
      attribute: "mode",
      previous_value: "off",
      value: "heat",
      has_previous: true,
      is_initial: false,
    },
    ...extra,
  };
}

const RUNS = [
  run("followed", {
    branch_id: "cold",
    branches: [
      evaluated("probe", "not_matched", [1]),
      evaluated("empty", "matched", [2]),
      evaluated("cold", "matched", [2, 1]),
    ],
  }),
  run("nothing", {
    status: "no_match",
    reason: "no_matching_branch",
    branches: [
      evaluated("probe", "not_matched", [1]),
      evaluated("empty", "not_matched", [2]),
    ],
  }),
  run("unknown", {
    status: "failed",
    reason: "condition_unknown",
    branches: [
      evaluated("probe", "not_matched", [1]),
      evaluated("empty", "unknown", [2], [`${ROOM}/presence`]),
    ],
  }),
  run("rejected", {
    status: "failed",
    reason: "write_rejected",
    branch_id: "cold-else",
    error: "Refused by the frost rule",
    output_id: "batch-7",
    branches: [
      evaluated("probe", "not_matched", [1]),
      evaluated("empty", "matched", [2]),
      evaluated("cold", "not_matched", [2, 1]),
      evaluated("cold-else", "matched", [2, 2]),
    ],
  }),
  run("probe", {
    branch_id: "probe",
    branches: [evaluated("probe", "matched", [1])],
  }),
];

const onReplay = vi.fn<(id: string | null) => void>();

function renderTab({
  executions = RUNS,
  branches = TREE,
  replayId = null,
  isLoading = false,
}: {
  executions?: AutomationExecution[];
  branches?: AutomationBranch[];
  replayId?: string | null;
  isLoading?: boolean;
} = {}) {
  const tree: TreeContextValue = {
    editable: false,
    selection: { kind: "automation" },
    select: vi.fn(),
    trigger: null,
    catalog: { devices: [THERMOSTAT] },
    incompleteConditions: new Set(),
    incompleteActions: new Set(),
    replay: null,
    insertCondition: vi.fn(),
    addCase: vi.fn(),
    canAddBranch: true,
    maxDepth: MAX_TREE_DEPTH,
  };
  return render(
    <MemoryRouter>
      <TreeContext.Provider value={tree}>
        <ExecutionsTab
          executions={executions}
          isLoading={isLoading}
          replayId={replayId}
          onReplay={onReplay}
          branches={branches}
        />
      </TreeContext.Provider>
    </MemoryRouter>,
  );
}

const entries = () =>
  within(screen.getByRole("list", { name: "Exécutions" })).getAllByRole(
    "button",
  );
const detail = () =>
  screen.getByRole("region", { name: "Exécution sélectionnée" });

afterEach(() => {
  cleanup();
  onReplay.mockReset();
});

describe("ExecutionsTab", () => {
  it("lists every run with how it ended and the path it took on the tree", () => {
    renderTab();

    const summaries = entries().map((entry) => entry.textContent);
    expect(summaries).toHaveLength(5);
    expect(summaries[0]).toMatch(
      /Réussie.*Salle vide › Froid dehors → Écrire un attribut$/,
    );
    expect(summaries[1]).toMatch(/Aucun cas vrai.*Ne rien faire$/);
    expect(summaries[2]).toMatch(
      /Arrêtée · donnée inconnue.*Donnée inconnue dans « Salle vide »$/,
    );
    expect(summaries[3]).toMatch(
      /Refusée par une règle.*Salle vide › Sinon → Exécuter une commande$/,
    );
    expect(summaries[4]).toMatch(
      /Réussie.*Sonde muette → Envoyer une notification$/,
    );
  });

  it("replays a run on click, and stops the replay on a second click", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(entries()[2]);
    expect(onReplay).toHaveBeenLastCalledWith("unknown");
    cleanup();

    renderTab({ replayId: "unknown" });
    expect(
      entries().map((entry) => entry.getAttribute("aria-pressed")),
    ).toEqual(["false", "false", "true", "false", "false"]);
    await user.click(entries()[2]);
    expect(onReplay).toHaveBeenLastCalledWith(null);
  });

  it("details the replayed run: its event, every case tested, the values it missed, its result", () => {
    renderTab({ replayId: "unknown" });

    const section = detail();
    expect(section).toHaveTextContent("TMK_mqtt_3 · Mode : off → heat");
    const path = within(section).getAllByRole("listitem");
    expect(path.map((step) => step.textContent)).toEqual([
      "Sonde muette — faux",
      `Salle vide — inconnuInconnue ou périmée : ${ROOM}/presence`,
    ]);
    expect(section).toHaveTextContent(
      "Une condition ne peut pas être évaluée.",
    );
  });

  it("shows the error of a failed run and the commands it sent", () => {
    renderTab({ replayId: "rejected" });

    const section = detail();
    expect(section).toHaveTextContent("Refused by the frost rule");
    expect(
      within(section).getByRole("link", { name: /Commande exécutée/ }),
    ).toHaveAttribute("href", "/devices/commands?batch_id=batch-7");
  });

  it("shows no detail until a run is picked", () => {
    renderTab();

    expect(
      screen.queryByRole("region", { name: "Exécution sélectionnée" }),
    ).not.toBeInTheDocument();
  });

  it("names a case removed since the run", () => {
    renderTab({
      executions: [
        run("old", {
          branch_id: "gone",
          branches: [evaluated("gone", "matched", [1])],
        }),
      ],
    });

    expect(entries()[0]).toHaveTextContent(/Cas supprimé$/);
  });

  it("waits for the log, then says when it is empty", () => {
    renderTab({ isLoading: true });
    expect(
      screen.queryByRole("list", { name: "Exécutions" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Aucune exécution pour le moment"),
    ).not.toBeInTheDocument();
    cleanup();

    renderTab({ executions: [] });
    expect(
      screen.getByText("Aucune exécution pour le moment"),
    ).toBeInTheDocument();
  });

  // Reported defect: a trigger → action automation has no case on the tree
  // (no decision is drawn), yet its runs read "Cas 1 → …": the lone path is
  // labelled by its position like a case.
  it("names no case on a trigger → action automation", () => {
    renderTab({
      branches: [branch("only", { action: write(17) })],
      executions: [
        run("simple", {
          branch_id: "only",
          branches: [evaluated("only", "matched", [1])],
        }),
      ],
    });

    expect(entries()[0]).toHaveTextContent(/Écrire un attribut$/);
    expect(entries()[0]).not.toHaveTextContent("Cas 1");
  });
});
