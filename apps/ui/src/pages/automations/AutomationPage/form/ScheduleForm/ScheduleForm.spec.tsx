import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Trigger } from "@gridone/sdk";

const translations: Record<string, string> = {
  "triggers.schedule.frequency": "Repeats",
  "triggers.schedule.frequencies.minutes": "Every few minutes",
  "triggers.schedule.frequencies.hours": "Every few hours",
  "triggers.schedule.frequencies.daily": "Daily",
  "triggers.schedule.frequencies.weekly": "Weekly",
  "triggers.schedule.frequencies.monthly": "Monthly",
  "triggers.schedule.frequencies.custom": "Custom schedule",
  "triggers.schedule.minuteInterval": "Minute interval",
  "triggers.schedule.hourInterval": "Hour interval",
  "triggers.schedule.minute": "At minute",
  "triggers.schedule.time": "Time",
  "triggers.schedule.weekdays.label": "Days",
  "triggers.schedule.weekdays.short.0": "Sun",
  "triggers.schedule.weekdays.short.1": "Mon",
  "triggers.schedule.weekdays.short.2": "Tue",
  "triggers.schedule.weekdays.short.3": "Wed",
  "triggers.schedule.weekdays.short.4": "Thu",
  "triggers.schedule.weekdays.short.5": "Fri",
  "triggers.schedule.weekdays.short.6": "Sat",
  "triggers.schedule.monthDay": "Day of month",
  "triggers.schedule.preview": "Schedule",
  "triggers.schedule.customHelp":
    "This automation uses an advanced schedule. Choose a frequency above to replace it.",
  "triggers.schedule.descriptionUnavailable": "Schedule unavailable",
  "common.cancel": "Cancel",
  "common.save": "Save",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
    i18n: { resolvedLanguage: "en" },
  }),
}));

import { ScheduleForm } from ".";

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = () => {};
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(() => cleanup());

function renderForm({
  initialValue,
  onSubmit = vi.fn(),
  hideActions = false,
}: {
  initialValue?: Trigger;
  onSubmit?: (trigger: Trigger) => void;
  hideActions?: boolean;
} = {}) {
  render(
    <ScheduleForm
      type="schedule"
      initialValue={initialValue}
      onSubmit={onSubmit}
      onCancel={() => {}}
      formId="schedule-form"
      hideActions={hideActions}
    />,
  );
  return onSubmit;
}

describe("ScheduleForm", () => {
  it("creates a daily schedule without exposing a cron input", async () => {
    const onSubmit = renderForm({ hideActions: true });

    expect(screen.getByText("At 09:00 AM, every day")).toBeInTheDocument();
    expect(screen.queryByLabelText(/cron/i)).not.toBeInTheDocument();

    const timeInput = screen.getByLabelText("Time *");
    fireEvent.change(timeInput, {
      target: { value: "10:30" },
    });
    fireEvent.submit(document.getElementById("schedule-form")!);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        provider_id: "schedule",
        params: { cron: "30 10 * * *" },
      }),
    );
  });

  it("round-trips a weekly schedule through day and time controls", async () => {
    const onSubmit = renderForm({
      initialValue: {
        provider_id: "schedule",
        params: { cron: "30 8 * * 1-5" },
      },
    });

    expect(screen.getByRole("button", { name: "Mon" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Sun" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await userEvent.click(screen.getByRole("button", { name: "Sun" }));
    fireEvent.change(screen.getByLabelText("Time *"), {
      target: { value: "09:15" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith({
      provider_id: "schedule",
      params: { cron: "15 9 * * 0,1,2,3,4,5" },
    });
  });

  it("preserves advanced saved schedules until a new frequency is chosen", () => {
    renderForm({
      initialValue: {
        provider_id: "schedule",
        params: { cron: "0 9 L * *" },
      },
    });

    expect(screen.getByRole("combobox", { name: "Repeats" })).toHaveTextContent(
      "Custom schedule",
    );
    expect(
      screen.getByText(/This automation uses an advanced schedule/),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue("0 9 L * *")).not.toBeInTheDocument();
  });

  it("does not let an abandoned field block a different schedule mode", async () => {
    const onSubmit = renderForm({
      initialValue: {
        provider_id: "schedule",
        params: { cron: "0 9 31 * *" },
      },
    });

    fireEvent.change(screen.getByLabelText("Day of month *"), {
      target: { value: "" },
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await userEvent.click(screen.getByRole("combobox", { name: "Repeats" }));
    await userEvent.click(screen.getByRole("option", { name: "Daily" }));

    const saveButton = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await userEvent.click(saveButton);

    expect(onSubmit).toHaveBeenCalledWith({
      provider_id: "schedule",
      params: { cron: "0 9 * * *" },
    });
  });
});
