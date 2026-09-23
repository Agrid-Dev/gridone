import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { Action, AutomationBranch, WriteCondition } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "tree.otherwise": "Sinon",
    "tree.addCase": "Ajouter un cas",
    "tree.alwaysTrue": "Toujours vrai",
    "tree.chooseCondition": "À compléter",
    "panel.case.untitled": "Cas {{position}}",
    "panel.order.drag": "Déplacer « {{name}} »",
    "panel.order.otherwiseAction": "Exécute une action",
    "panel.order.otherwiseNothing": "Ne fait rien",
  }),
);

/** The drag-and-drop context, kept real, with its drop handler in reach. */
const dnd = vi.hoisted(() => ({
  onDragEnd: undefined as ((event: DragEndEvent) => void) | undefined,
}));
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      dnd.onDragEnd = props.onDragEnd;
      return <actual.DndContext {...props} />;
    },
  };
});

import {
  MAX_TREE_DEPTH,
  ROOT,
  decisionAt,
  type DecisionView,
} from "../tree/model";
import {
  TreeContext,
  type Selection,
  type TreeContextValue,
} from "../tree/TreeContext";
import { CaseOrder } from "./CaseOrder";

const ROOM = "salle20100000000";
const when = (attribute: string): WriteCondition => ({
  op: "eq",
  left: { device_id: ROOM, attribute },
  right: true,
});
const write = (value: number): Action => ({
  provider_id: "write_attribute",
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

/** "Salle vide", an unnamed case, "Froid dehors" — and "otherwise" if given. */
const cases = (otherwise?: Action) => [
  branch("empty", {
    name: "Salle vide",
    condition: when("presence"),
    action: write(17),
  }),
  branch("window", { condition: when("window_open"), action: write(12) }),
  branch("cold", {
    name: "Froid dehors",
    condition: when("frost"),
    action: write(19),
  }),
  ...(otherwise ? [branch("else", { action: otherwise })] : []),
];

function decisionOf(branches: AutomationBranch[]): DecisionView {
  const decision = decisionAt(branches, ROOT);
  if (!decision) throw new Error("the root is a decision");
  return decision;
}

const select = vi.fn<(selection: Selection) => void>();
const onMove = vi.fn<(branchId: string, to: number) => void>();
const onAdd = vi.fn();

function renderOrder(
  branches: AutomationBranch[],
  {
    current,
    ...overrides
  }: Partial<TreeContextValue> & { current?: string } = {},
) {
  const tree: TreeContextValue = {
    editable: true,
    selection: { kind: "automation" },
    select,
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
  return render(
    <TreeContext.Provider value={tree}>
      <CaseOrder
        decision={decisionOf(branches)}
        current={current}
        onMove={onMove}
        onAdd={onAdd}
      />
    </TreeContext.Provider>,
  );
}

const rows = () => within(screen.getByRole("list")).getAllByRole("listitem");
const handles = () => screen.queryAllByRole("button", { name: /^Déplacer/ });
const drop = (active: string, over: string | null) =>
  dnd.onDragEnd!({
    active: { id: active },
    over: over === null ? null : { id: over },
  } as unknown as DragEndEvent);

afterEach(() => {
  cleanup();
  select.mockReset();
  onMove.mockReset();
  onAdd.mockReset();
  dnd.onDragEnd = undefined;
});

describe("CaseOrder", () => {
  it("lists the cases in testing order, numbered, with « Sinon » closing the list", () => {
    renderOrder(cases());

    const [first, second, third, last] = rows();
    expect(rows()).toHaveLength(4);
    expect(first).toHaveTextContent(/^1Salle vide/);
    // An unnamed case is named by its place.
    expect(second).toHaveTextContent(/^2Cas 2/);
    expect(third).toHaveTextContent(/^3Froid dehors/);
    expect(last).toHaveTextContent("SinonNe fait rien");
  });

  it("says when « Sinon » runs an action", () => {
    renderOrder(cases(write(21)));

    expect(rows()).toHaveLength(4);
    expect(rows()[3]).toHaveTextContent("SinonExécute une action");
  });

  it("gives every case a drag handle, and none to « Sinon »", () => {
    renderOrder(cases(write(21)));

    expect(
      handles().map((handle) => handle.getAttribute("aria-label")),
    ).toEqual([
      "Déplacer « Salle vide »",
      "Déplacer « Cas 2 »",
      "Déplacer « Froid dehors »",
    ]);
    expect(
      within(rows()[3]).queryByRole("button", { name: /^Déplacer/ }),
    ).not.toBeInTheDocument();
  });

  it("offers no handle when there is nothing to reorder, or nothing may change", () => {
    renderOrder([cases()[0]]);
    expect(handles()).toHaveLength(0);
    cleanup();

    renderOrder(cases(), { editable: false });
    expect(handles()).toHaveLength(0);
  });

  it("highlights the case whose panel is open, and only it", () => {
    renderOrder(cases(), { current: "window" });

    expect(rows().map((row) => row.getAttribute("aria-current"))).toEqual([
      null,
      "true",
      null,
      null,
    ]);
  });

  it("opens a case, or « Sinon », from the list", async () => {
    const user = userEvent.setup();
    renderOrder(cases());

    await user.click(screen.getByRole("button", { name: /^Froid dehors/ }));
    await user.click(screen.getByRole("button", { name: /^Sinon/ }));

    expect(select.mock.calls).toEqual([
      [{ kind: "case", branchId: "cold" }],
      [{ kind: "otherwise", levelId: ROOT }],
    ]);
  });

  it("moves a dropped case to the place of the case it lands on", () => {
    renderOrder(cases(write(21)));

    drop("cold", "empty");
    drop("empty", "cold");

    expect(onMove.mock.calls).toEqual([
      ["cold", 0],
      ["empty", 2],
    ]);
  });

  it("ignores a drop on nothing, on itself, or anywhere but a case", () => {
    renderOrder(cases(write(21)));

    drop("cold", null);
    drop("cold", "cold");
    drop("cold", "else");

    expect(onMove).not.toHaveBeenCalled();
  });

  it("adds a case, until the tree is full", async () => {
    const user = userEvent.setup();
    renderOrder(cases());

    await user.click(screen.getByRole("button", { name: "Ajouter un cas" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    cleanup();

    renderOrder(cases(), { canAddBranch: false });
    expect(
      screen.getByRole("button", { name: "Ajouter un cas" }),
    ).toBeDisabled();
    cleanup();

    renderOrder(cases(), { editable: false });
    expect(
      screen.queryByRole("button", { name: "Ajouter un cas" }),
    ).not.toBeInTheDocument();
  });

  it("shows a case still to complete, and a legacy case without condition, for what they are", () => {
    renderOrder(
      [
        branch("always", { name: "Toujours", action: write(1) }),
        ...cases(write(21)),
      ],
      { incompleteConditions: new Set(["window"]) },
    );

    expect(rows()[0]).toHaveTextContent("Toujours vrai");
    expect(rows()[2]).toHaveTextContent("À compléter");
    expect(rows()[1]).not.toHaveTextContent("À compléter");
  });
});
