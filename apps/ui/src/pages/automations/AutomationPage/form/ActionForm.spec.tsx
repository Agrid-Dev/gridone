import * as React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "automations:actions.type": "Action type",
    "automations:actions.types.command_template":
      "Use an existing command template",
    "automations:actions.types.command_inline": "Define a new command",
    "automations:actions.types.command_inline_comingSoon":
      "Defining a command inline is coming soon.",
    "actions.types.command_inline_comingSoon":
      "Defining a command inline is coming soon.",
    "common:common.cancel": "Cancel",
    "common:common.save": "Save",
  }),
);

// Stub shadcn Select with a native <select> for jsdom-friendly interaction.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      data-testid="action-type-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

vi.mock("@/components/forms/resourcePickers/CommandTemplatePicker", () => ({
  default: ({ value }: { value?: string }) => (
    <div data-testid="template-picker">value={value ?? ""}</div>
  ),
}));

// TitlePresenter wraps its title in nested spans + Icon — strip it so spec
// assertions can read the label off the select option directly.
vi.mock("../presenters/BasePresenter", () => ({
  TitlePresenter: ({ title }: { title: React.ReactNode }) => <>{title}</>,
}));

import ActionForm from "./ActionForm";

afterEach(() => cleanup());

describe("ActionForm", () => {
  it("renders the action type select with both options and shows the template picker by default", () => {
    render(
      <ActionForm
        initialValue="tpl-1"
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    const select = screen.getByTestId(
      "action-type-select",
    ) as HTMLSelectElement;
    expect(select.value).toBe("command_template");
    expect(
      screen.getByRole("option", { name: "Use an existing command template" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Define a new command" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("template-picker")).toHaveTextContent(
      "value=tpl-1",
    );
  });

  it("switches to the inline body and disables save when the inline placeholder yields no result", () => {
    render(
      <ActionForm
        initialValue="tpl-1"
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.change(screen.getByTestId("action-type-select"), {
      target: { value: "command_inline" },
    });

    expect(
      screen.getByText("Defining a command inline is coming soon."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("template-picker")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
