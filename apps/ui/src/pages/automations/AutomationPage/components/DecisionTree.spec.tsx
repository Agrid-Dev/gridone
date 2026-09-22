import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AutomationBranch } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import schema from "../__fixtures__/schema.json";
import { useBranchForm } from "../hooks/useDecisionTree";
import { DecisionTree } from "./DecisionTree";

vi.mock("react-i18next", () => createI18nMock({}));
vi.mock("../hooks/useDecisionTree", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useDecisionTree")>()),
  useAutomationCatalog: () => ({ devices: [] }),
  useAutomationSchema: () => ({ data: schema }),
}));
vi.mock("../presenters/ActionPresenter", () => ({
  ActionPresenter: ({ action }: { action: { params: { title: string } } }) => (
    <span>{action.params.title}</span>
  ),
}));

const first: AutomationBranch = {
  id: "one",
  name: "Standby healthy",
  condition: { op: "eq", left: { event: "value" }, right: false },
  action: {
    provider_id: "notification",
    params: {
      title: "Start standby",
      body: "",
      severity: "info",
      user_ids: ["u"],
    },
  },
};
const second: AutomationBranch = {
  id: "two",
  name: "Restart primary",
  condition: { op: "eq", left: { event: "previous_value" }, right: true },
  action: {
    provider_id: "notification",
    params: {
      title: "Restart primary action",
      body: "",
      severity: "info",
      user_ids: ["u"],
    },
  },
};
afterEach(cleanup);

describe("DecisionTree", () => {
  it("shows ordered condition/action branches and the no-match outcome", () => {
    render(<DecisionTree branches={[first, second]} />);
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Start standby")).toBeInTheDocument();
    expect(
      within(rows[1]).getByText("Restart primary action"),
    ).toBeInTheDocument();
    expect(screen.getByText("tree.firstMatch")).toBeInTheDocument();
    expect(screen.getByText("tree.otherwise")).toBeInTheDocument();
    expect(screen.getByText("tree.noMatch")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("reorders branches without changing their identities or actions", async () => {
    const change = vi.fn();
    render(<DecisionTree branches={[first, second]} onChange={change} />);
    const down = screen.getAllByRole("button", { name: "tree.moveDown" });
    await userEvent.click(down[0]);
    expect(change).toHaveBeenCalledWith([second, first]);
    expect(down[1]).toBeDisabled();
  });

  it("cannot remove the last branch", () => {
    render(<DecisionTree branches={[first]} onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "tree.removeBranch" }),
    ).toBeDisabled();
  });

  it("validates and preserves event expressions using the server schema", async () => {
    const { result } = renderHook(() => useBranchForm(schema, first));
    const save = vi.fn();
    await act(async () => {
      await result.current.form.handleSubmit(save)();
    });
    expect(save.mock.calls[0][0]).toEqual(first);
    await act(async () => {
      result.current.form.setValue("condition", {
        op: "eq",
        left: { device_id: "", attribute: "running" },
        right: true,
      });
      await result.current.form.handleSubmit(save)();
    });
    expect(save).toHaveBeenCalledTimes(1);
  });
});
