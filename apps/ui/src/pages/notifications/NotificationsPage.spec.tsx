import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { NotificationDispatch } from "@/api/notifications";
import type { Page } from "@/api/pagination";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        "notifications.title": "Notifications",
        "notifications.subtitle": "Inbox",
        "notifications.unableToLoad": "Unable to load notifications",
        "notifications.dismiss": "Dismiss",
        "notifications.dismissSelected": "Dismiss selected ({{count}})",
        "notifications.showMore": "Show more",
        "notifications.showLess": "Show less",
        "notifications.emptyTitle": "No notifications",
        "notifications.emptyDescription": "You have no notifications yet.",
        "notifications.emptyUnreadTitle": "All caught up",
        "notifications.emptyUnreadDescription": "No unread notifications.",
        "notifications.columns.title": "Title",
        "notifications.columns.severity": "Severity",
        "notifications.columns.dispatchedAt": "Received",
        "notifications.columns.dismissedAt": "Dismissed at",
        "notifications.filter.all": "All",
        "notifications.filter.unread": "Unread",
        "notifications.filter.dismissed": "Dismissed",
        "common:common.previous": "Previous",
        "common:common.next": "Next",
        "empty.noMatch": "No matching {{resourceName}}",
        "empty.title": "No {{resourceName}} yet",
        "empty.clearFiltersHint": "Try adjusting or clearing your filters.",
        "empty.clearFilters": "Clear filters",
        "common.severity.alert": "alert",
        "common.severity.warning": "warning",
        "common.severity.info": "info",
        "common.timeAgo.justNow": "just now",
        "common.timeAgo.minutes": "{{count}} minutes",
        "common.timeAgo.hours": "{{count}} hours",
        "common.timeAgo.days": "{{count}} days",
      };
      let value = map[key] ?? key;
      if (opts) {
        for (const [k, v] of Object.entries(opts)) {
          value = value.replaceAll(`{{${k}}}`, String(v));
        }
      }
      return value;
    },
  }),
}));

const mockDismiss = vi.fn();
const mockDismissMany = vi.fn();
const mockUseNotifications = vi.fn();

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => mockUseNotifications(),
}));

import NotificationsPage from "./NotificationsPage";

const DISPATCHED_AT = "2026-01-01T00:00:00Z";

function makeDispatch(
  overrides: Partial<NotificationDispatch> = {},
): NotificationDispatch {
  return {
    notification: {
      id: "n1",
      title: "System alert",
      body: "The chiller is offline and requires immediate attention.",
      severity: "alert",
      correlationId: null,
      createdBy: null,
      createdAt: DISPATCHED_AT,
    },
    userId: "u1",
    dispatchedAt: DISPATCHED_AT,
    dismissedAt: null,
    ...overrides,
  };
}

function makePage(items: NotificationDispatch[]): Page<NotificationDispatch> {
  return {
    items,
    total: items.length,
    page: 1,
    size: 20,
    totalPages: 1,
    links: { self: "", first: "", last: "", next: null, prev: null },
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseNotifications.mockReturnValue({
    page: makePage([makeDispatch()]),
    loading: false,
    error: null,
    dismiss: mockDismiss,
    dismissMany: mockDismissMany,
  });
});

afterEach(() => {
  cleanup();
  mockUseNotifications.mockReset();
  mockDismiss.mockReset();
  mockDismissMany.mockReset();
});

describe("NotificationsPage", () => {
  it("renders a row per dispatch with title, severity chip, and dismiss button", () => {
    renderPage();
    expect(screen.getByText("System alert")).toBeInTheDocument();
    const chip = screen.getByText("alert");
    expect(chip.closest("[data-severity]")).toHaveAttribute(
      "data-severity",
      "alert",
    );
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("shows body collapsed by default and expands on Show more", async () => {
    renderPage();
    const showMore = screen.getByRole("button", { name: "Show more" });
    expect(showMore).toBeInTheDocument();
    await userEvent.click(showMore);
    expect(
      screen.getByRole("button", { name: "Show less" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(
      screen.getByRole("button", { name: "Show more" }),
    ).toBeInTheDocument();
  });

  it("calls dismiss with the notification id when Dismiss is clicked", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(mockDismiss).toHaveBeenCalledWith("n1");
  });

  it("selects notification via checkbox and bulk-dismisses", async () => {
    renderPage();
    const [, rowCheckbox] = screen.getAllByRole("checkbox");
    await userEvent.click(rowCheckbox);
    const bulkBtn = screen.getByRole("button", { name: /Dismiss selected/ });
    expect(bulkBtn).toBeInTheDocument();
    await userEvent.click(bulkBtn);
    expect(mockDismissMany).toHaveBeenCalledWith(["n1"]);
  });

  it("shows empty state when there are no notifications", () => {
    mockUseNotifications.mockReturnValue({
      page: makePage([]),
      loading: false,
      error: null,
      dismiss: mockDismiss,
      dismissMany: mockDismissMany,
    });
    renderPage();
    expect(screen.getByText("No notifications")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("dismissed row has disabled dismiss button and shows dismissed-at time", () => {
    const dismissed = makeDispatch({
      notification: {
        id: "n2",
        title: "Old alert",
        body: "Resolved.",
        severity: "warning",
        correlationId: null,
        createdBy: null,
        createdAt: DISPATCHED_AT,
      },
      dismissedAt: DISPATCHED_AT,
    });
    mockUseNotifications.mockReturnValue({
      page: makePage([dismissed]),
      loading: false,
      error: null,
      dismiss: mockDismiss,
      dismissMany: mockDismissMany,
    });
    renderPage();
    const row = within(screen.getAllByRole("row")[1]);
    expect(row.getByRole("button", { name: "Dismiss" })).toBeDisabled();
  });

  it("shows loading skeleton while loading", () => {
    mockUseNotifications.mockReturnValue({
      page: undefined,
      loading: true,
      error: null,
      dismiss: mockDismiss,
      dismissMany: mockDismissMany,
    });
    const { container } = renderPage();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows error fallback when the hook returns an error", () => {
    mockUseNotifications.mockReturnValue({
      page: undefined,
      loading: false,
      error: "Network error",
      dismiss: mockDismiss,
      dismissMany: mockDismissMany,
    });
    renderPage();
    expect(
      screen.getByText("Unable to load notifications"),
    ).toBeInTheDocument();
  });
});
