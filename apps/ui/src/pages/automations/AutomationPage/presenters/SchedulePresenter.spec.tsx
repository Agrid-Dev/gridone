import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "triggers.schedule.descriptionUnavailable") {
        return "Schedule unavailable";
      }
      return key;
    },
    i18n: { resolvedLanguage: "en" },
  }),
}));

let timezone: string | undefined;

vi.mock("@/hooks/useBuildingProfile", () => ({
  useBuildingTimezone: () => timezone,
}));

import { SchedulePresenter } from "./SchedulePresenter";

afterEach(() => cleanup());
beforeEach(() => {
  timezone = "Europe/Paris";
});

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
    expect(screen.getByText("(Europe/Paris)")).toBeInTheDocument();
    expect(screen.queryByText("0 10 * * *")).not.toBeInTheDocument();
  });

  it("omits the timezone until the building profile has loaded", () => {
    timezone = undefined;
    render(
      <SchedulePresenter
        trigger={{ provider_id: "schedule", params: { cron: "0 10 * * *" } }}
      />,
    );

    expect(screen.getByText("At 10:00 AM, every day")).toBeInTheDocument();
    expect(screen.queryByText(/^\(.*\)$/)).not.toBeInTheDocument();
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
