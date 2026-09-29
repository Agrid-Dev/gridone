import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { AutomationDeactivation } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "reasons.consecutive_failures": "Repeated executions failed.",
  }),
);

import { DeactivationReason } from "./DeactivationReason";

afterEach(cleanup);

const deactivation = (
  overrides: Partial<AutomationDeactivation>,
): AutomationDeactivation => ({
  actor_id: "system",
  at: "2026-09-29T08:00:00Z",
  ...overrides,
});

const text = (value: AutomationDeactivation) =>
  render(<DeactivationReason deactivation={value} />).container.textContent;

describe("DeactivationReason", () => {
  it("translates the reason code of a tripped guard", () => {
    expect(
      text(
        deactivation({
          source: "circuit_breaker",
          reason: "consecutive_failures",
        }),
      ),
    ).toBe("Repeated executions failed.");
  });

  it("shows an unknown guard code as it is", () => {
    expect(
      text(deactivation({ source: "circuit_breaker", reason: "new_guard" })),
    ).toBe("new_guard");
  });

  it.each(["operator", undefined] as const)(
    "shows an operator's reason as typed, even when it matches a code (%s)",
    (source) => {
      expect(
        text(deactivation({ source, reason: "consecutive_failures" })),
      ).toBe("consecutive_failures");
    },
  );

  it.each([null, undefined, ""])(
    "renders nothing without a reason (%s)",
    (reason) => {
      expect(text(deactivation({ source: "circuit_breaker", reason }))).toBe(
        "",
      );
    },
  );
});
