import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "automations:actions.type": "Action type",
    "automations:actions.types.command_template": "Run a command",
    "automations:actions.types.notification": "Send a notification",
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
vi.mock("./actionTypes/NotificationActionForm", () => ({
  NotificationActionForm: () => <div data-testid="notification-action-body" />,
}));

import ActionForm from "./ActionForm";

afterEach(() => cleanup());

describe("ActionForm", () => {
  it("renders one type card per registered descriptor and the default body", () => {
    render(<ActionForm onSubmit={() => {}} onCancel={() => {}} />);

    const picker = screen.getByRole("radiogroup", { name: "Action type" });
    const radios = within(picker).getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(
      within(picker).getByRole("radio", { name: /Run a command/ }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("command-action-body")).toBeInTheDocument();
  });

  it("switches the body when another type card is selected", () => {
    render(<ActionForm onSubmit={() => {}} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole("radio", { name: /Send a notification/ }));

    expect(screen.getByTestId("notification-action-body")).toBeInTheDocument();
    expect(screen.queryByTestId("command-action-body")).not.toBeInTheDocument();
  });

  it("disables Save until the body emits a result", () => {
    render(<ActionForm onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
