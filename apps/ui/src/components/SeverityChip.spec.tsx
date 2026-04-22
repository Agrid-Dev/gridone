import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SeverityChip } from "./SeverityChip";
import type { Severity } from "@/api/devices";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "common.severity.alert": "alert",
        "common.severity.warning": "warning",
        "common.severity.info": "info",
      };
      return map[key] ?? key;
    },
  }),
}));

afterEach(cleanup);

describe("SeverityChip", () => {
  const severities: Severity[] = ["alert", "warning", "info"];

  it.each(severities)("renders %s severity", (severity) => {
    render(<SeverityChip severity={severity} />);
    const chip = screen.getByText(severity);
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute("data-severity", severity);
  });

  it("merges className prop", () => {
    render(<SeverityChip severity="alert" className="custom-class" />);
    expect(screen.getByText("alert")).toHaveClass("custom-class");
  });
});
