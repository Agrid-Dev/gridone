import { cleanup, render, screen } from "@testing-library/react";
import type { UnitCommand } from "@gridone/sdk";
import { afterEach, expect, it, vi } from "vitest";
import { CommandConfirmationDetails } from "./CommandConfirmationDetails";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(cleanup);
const command: UnitCommand = {
  id: 1,
  batch_id: null,
  template_id: null,
  device_id: "device",
  attribute: "setting",
  value: "new",
  data_type: "str",
  user_id: "operator",
  status: "error",
  status_details: "unconfirmed",
  created_at: "2026-09-17T00:00:00Z",
  executed_at: "2026-09-17T00:00:01Z",
  completed_at: "2026-09-17T00:00:02Z",
  ui_confirmation: {
    message: "Connectivity may be lost.",
    language: "en",
    previous_value: "old",
    previous_value_known: true,
  },
};

it("keeps accepted warning and values visible after a missing reply", () => {
  render(<CommandConfirmationDetails command={command} />);
  expect(screen.getByText("Connectivity may be lost.")).toBeInTheDocument();
  expect(screen.getByText("groups.before: old")).toBeInTheDocument();
  expect(screen.getByText("groups.after: new")).toBeInTheDocument();
  expect(screen.getByText("confirmation.noResponse")).toBeInTheDocument();
});

it("does not imply a possible write for a refused command", () => {
  render(
    <CommandConfirmationDetails
      command={{ ...command, validation: { eligible: false } }}
    />,
  );
  expect(screen.queryByText("confirmation.noResponse")).not.toBeInTheDocument();
});

it("identifies an unknown previous value", () => {
  render(
    <CommandConfirmationDetails
      command={{
        ...command,
        ui_confirmation: {
          ...command.ui_confirmation!,
          previous_value_known: false,
        },
      }}
    />,
  );
  expect(
    screen.getByText("groups.before: confirmation.unknown"),
  ).toBeInTheDocument();
  expect(screen.getByText("groups.after: new")).toBeInTheDocument();
});

it("does not invent confirmation evidence for legacy or non-UI commands", () => {
  const { container } = render(
    <CommandConfirmationDetails
      command={{ ...command, ui_confirmation: null }}
    />,
  );
  expect(container).toBeEmptyDOMElement();
});
