import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { AppStatus } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { AppStatusBadge } from "./AppStatusBadge";
import { AppPushStatusBadge } from "./AppPushStatusBadge";

vi.mock("react-i18next", () =>
  createI18nMock({
    "status.healthy": "Healthy",
    "status.needs_config": "Needs configuration",
    "status.unhealthy": "Unhealthy",
    "status.registered": "Registered",
    "config.pushStatus.ok": "Delivered",
    "config.pushStatus.pending": "Delivery pending",
    "config.pushStatus.rejected": "Refused by the app",
    "config.pushStatusHint.pending": "Saved, but not taken by the app yet.",
  }),
);

afterEach(cleanup);

describe("AppStatusBadge", () => {
  it.each([
    ["healthy", "Healthy"],
    ["needs_config", "Needs configuration"],
    ["unhealthy", "Unhealthy"],
    ["registered", "Registered"],
  ] as [AppStatus, string][])("labels %s", (status, label) => {
    render(<AppStatusBadge status={status} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("sets an app awaiting its config apart from a healthy one", () => {
    const { container: needsConfig } = render(
      <AppStatusBadge status="needs_config" />,
    );
    const { container: healthy } = render(<AppStatusBadge status="healthy" />);

    expect(needsConfig.firstElementChild?.className).not.toEqual(
      healthy.firstElementChild?.className,
    );
  });
});

describe("AppPushStatusBadge", () => {
  it("reports a config the app has not taken yet", () => {
    render(<AppPushStatusBadge status="pending" />);

    expect(screen.getByText("Delivery pending")).toBeInTheDocument();
    expect(
      screen.getByTitle("Saved, but not taken by the app yet."),
    ).toBeInTheDocument();
  });

  it("shows nothing before a first save", () => {
    const { container } = render(<AppPushStatusBadge status={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
