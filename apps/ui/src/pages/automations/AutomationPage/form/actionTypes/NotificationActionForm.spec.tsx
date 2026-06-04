import * as React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import type { ActionFormResult } from "../../presenters/types";

vi.mock("react-i18next", () =>
  createI18nMock({
    "actions.notificationForm.title": "Title",
    "actions.notificationForm.body": "Message",
    "actions.notificationForm.severity": "Severity",
    "actions.notificationForm.recipients": "Recipients",
  }),
);

// Native <select> stand-in so jsdom can drive the severity picker.
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
      data-testid="severity-select"
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

vi.mock("@/components/SeverityChip", () => ({
  SeverityChip: ({ severity }: { severity: string }) => <>{severity}</>,
}));

// Stand-in picker exposing a button that selects a fixed recipient, so we can
// drive the "recipients" requirement without booting the real Popover/cmdk.
vi.mock("@/components/forms/resourcePickers/UserPicker", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string[];
    onChange: (ids: string[]) => void;
  }) => (
    <button
      type="button"
      data-testid="pick-user"
      onClick={() => onChange([...value, "u1"])}
    >
      recipients={value.join(",")}
    </button>
  ),
}));

import { NotificationActionForm } from "./NotificationActionForm";

afterEach(() => cleanup());

describe("NotificationActionForm", () => {
  it("emits null until both a title and a recipient are present", () => {
    const onChange = vi.fn();
    render(<NotificationActionForm onChange={onChange} />);

    // Title only — still incomplete (recipient required by the backend).
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "Someone wants to be warm" },
    });
    expect(onChange).toHaveBeenLastCalledWith(null);

    // Adding a recipient completes the draft.
    fireEvent.click(screen.getByTestId("pick-user"));
    expect(onChange).toHaveBeenLastCalledWith({
      providerId: "notification",
      params: {
        title: "Someone wants to be warm",
        body: "",
        severity: "info",
        userIds: ["u1"],
      },
    } satisfies ActionFormResult);
  });

  it("captures body and severity in the emitted result", () => {
    const onChange = vi.fn();
    render(<NotificationActionForm onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "Heat alert" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "la la la la" },
    });
    fireEvent.change(screen.getByTestId("severity-select"), {
      target: { value: "warning" },
    });
    fireEvent.click(screen.getByTestId("pick-user"));

    expect(onChange).toHaveBeenLastCalledWith({
      providerId: "notification",
      params: {
        title: "Heat alert",
        body: "la la la la",
        severity: "warning",
        userIds: ["u1"],
      },
    });
  });

  it("pre-populates fields when editing an existing notification action", () => {
    render(
      <NotificationActionForm
        initialValue={{
          providerId: "notification",
          params: {
            title: "Existing",
            body: "old body",
            severity: "alert",
            userIds: ["u1"],
          },
        }}
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText(/Title/)).toHaveValue("Existing");
    expect(screen.getByLabelText("Message")).toHaveValue("old body");
    expect(screen.getByTestId("severity-select")).toHaveValue("alert");
    expect(screen.getByTestId("pick-user")).toHaveTextContent("recipients=u1");
  });
});
