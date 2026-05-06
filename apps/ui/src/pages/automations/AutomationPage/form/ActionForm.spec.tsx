import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "automations:actions.type": "Action type",
    "automations:actions.types.command_template": "Run a command",
    "common:common.cancel": "Cancel",
    "common:common.save": "Save",
  }),
);

// The unified body fetches templates + assets; stub it down to a marker so
// this spec only asserts the host's shape (descriptor wiring, default body
// render). The body's own behaviour is covered separately.
vi.mock("./actionTypes/CommandActionForm", () => ({
  CommandActionForm: () => <div data-testid="command-action-body" />,
}));

import ActionForm from "./ActionForm";

afterEach(() => cleanup());

describe("ActionForm", () => {
  it("renders the descriptor body and hides the type Select while only one descriptor is registered", () => {
    render(<ActionForm onSubmit={() => {}} onCancel={() => {}} />);

    expect(screen.getByTestId("command-action-body")).toBeInTheDocument();
    // The type picker only renders once we have more than one action type
    // descriptor (e.g. when ``notification`` lands).
    expect(screen.queryByLabelText("Action type")).not.toBeInTheDocument();
  });

  it("disables Save until the body emits a result", () => {
    render(<ActionForm onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
