import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SeverityChip, type Severity } from "./SeverityChip";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "common.severity.alert": "ALERT",
        "common.severity.warning": "WARNING",
        "common.severity.info": "INFO",
      };
      return map[key] ?? key;
    },
  }),
}));

afterEach(cleanup);

describe("SeverityChip", () => {
  const cases: Array<{ severity: Severity; label: string; klass: string }> = [
    { severity: "alert", label: "ALERT", klass: "bg-red-600" },
    { severity: "warning", label: "WARNING", klass: "bg-amber-500" },
    { severity: "info", label: "INFO", klass: "border-slate-300" },
  ];

  it.each(cases)("renders $severity severity", ({ severity, label, klass }) => {
    render(<SeverityChip severity={severity} />);
    const chip = screen.getByText(label);
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass(klass);
  });

  it("merges className prop", () => {
    render(<SeverityChip severity="alert" className="custom-class" />);
    expect(screen.getByText("ALERT")).toHaveClass("custom-class");
  });
});
