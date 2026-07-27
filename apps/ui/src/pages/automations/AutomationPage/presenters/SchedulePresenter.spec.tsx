import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === "triggers.schedule.descriptionUnavailable"
        ? "Schedule unavailable"
        : key,
    i18n: { resolvedLanguage: "en" },
  }),
}));

import { SchedulePresenter } from "./SchedulePresenter";

afterEach(() => cleanup());

describe("SchedulePresenter", () => {
  it("replaces the cron expression with a human-readable sentence", () => {
    render(
      <SchedulePresenter
        trigger={{
          provider_id: "schedule",
          params: { cron: "0 10 * * *" },
        }}
      />,
    );

    expect(screen.getByText("At 10:00 AM, every day")).toBeInTheDocument();
    expect(screen.queryByText("0 10 * * *")).not.toBeInTheDocument();
  });

  it("uses a safe fallback for malformed schedule data", () => {
    render(
      <SchedulePresenter
        trigger={{ provider_id: "schedule", params: { cron: "invalid" } }}
      />,
    );

    expect(screen.getByText("Schedule unavailable")).toBeInTheDocument();
  });
});
