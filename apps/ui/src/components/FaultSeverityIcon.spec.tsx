import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { FaultSeverityIcon } from "./FaultSeverityIcon";
import type { Severity } from "@/lib/severity";

vi.mock("react-i18next", () =>
  createI18nMock({
    "common.severity.alert": "alert",
    "common.severity.warning": "warning",
    "common.severity.info": "info",
  }),
);

afterEach(cleanup);

describe("FaultSeverityIcon", () => {
  const cases: Array<[Severity, string]> = [
    ["alert", "text-red-600"],
    ["warning", "text-amber-500"],
    ["info", "text-slate-500"],
  ];

  it.each(cases)(
    "renders %s severity with the %s color class",
    (severity, colorClass) => {
      render(<FaultSeverityIcon severity={severity} />);
      const icon = screen.getByLabelText(severity);
      expect(icon).toHaveAttribute("data-severity", severity);
      expect(icon).toHaveClass(colorClass);
    },
  );

  it("merges className prop", () => {
    render(<FaultSeverityIcon severity="alert" className="custom-class" />);
    expect(screen.getByLabelText("alert")).toHaveClass("custom-class");
  });
});
