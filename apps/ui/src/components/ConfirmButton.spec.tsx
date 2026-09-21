import { createI18nMock } from "@/test/i18nMock";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GridoneError } from "@gridone/sdk";
import { ConfirmButton } from "./ConfirmButton";
vi.mock("react-i18next", () =>
  createI18nMock({
    "common.cancel": "Cancel",
    "deletion.pending": "Deleting…",
    "deletion.error": "Could not delete. Try again.",
  }),
);
afterEach(cleanup);
function mount(onConfirm: () => Promise<unknown>) {
  render(
    <ConfirmButton
      confirmTitle="Delete Pump?"
      confirmDetails="Cannot be undone."
      confirmLabel="Confirm deletion"
      onConfirm={onConfirm}
    >
      Delete
    </ConfirmButton>,
  );
}
function mountUnlink(onConfirm: () => Promise<unknown>) {
  render(
    <ConfirmButton
      confirmTitle="Unlink Pump?"
      confirmDetails="It keeps its data."
      confirmLabel="Unlink"
      confirmPendingLabel="Unlinking…"
      confirmErrorLabel="Could not unlink. Try again."
      onConfirm={onConfirm}
    >
      Unlink
    </ConfirmButton>,
  );
}
describe("async confirmation", () => {
  it("initially focuses Cancel; Escape returns focus without a mutation", async () => {
    const confirm = vi.fn();
    mount(confirm);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus();
  });
  it("stays open, disables cancellation and prevents repeated submission while pending", async () => {
    let resolve!: () => void;
    const confirm = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    mount(confirm);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.dblClick(
      screen.getByRole("button", { name: "Confirm deletion" }),
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    resolve();
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });
  it("keeps failure visible without raw server details and allows retry", async () => {
    const confirm = vi
      .fn()
      .mockRejectedValueOnce(new Error("SQL /secret/path"))
      .mockResolvedValue(undefined);
    mount(confirm);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm deletion" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not delete. Try again.",
    );
    expect(screen.queryByText(/SQL/)).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm deletion" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(confirm).toHaveBeenCalledTimes(2);
  });
  // AGR-1223 §6: the business refusal is what the user can act on; the generic
  // sentence is only the fallback.
  it("shows the refusal the server explains", async () => {
    const confirm = vi
      .fn()
      .mockRejectedValue(new GridoneError(409, "Dashboard still has widgets"));
    mount(confirm);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm deletion" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dashboard still has widgets",
    );
  });
  it("words an action that is not a deletion as itself", async () => {
    let resolve!: () => void;
    const confirm = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((done) => {
            resolve = done;
          }),
      )
      .mockRejectedValue(new Error("nope"));
    mountUnlink(confirm);
    await userEvent.click(screen.getByRole("button", { name: "Unlink" }));
    await userEvent.click(screen.getByRole("button", { name: "Unlink" }));
    expect(screen.getByRole("button", { name: "Unlinking…" })).toBeDisabled();
    expect(screen.queryByText("Deleting…")).not.toBeInTheDocument();
    resolve();
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Unlink" }));
    await userEvent.click(screen.getByRole("button", { name: "Unlink" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not unlink. Try again.",
    );
  });
});
