import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { FaultItem } from "./FaultItem";
import type { FaultAttribute, Severity } from "@/api/devices";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { ago?: string; count?: number }) => {
      const map: Record<string, string> = {
        "common.severity.alert": "alert",
        "common.severity.warning": "warning",
        "common.severity.info": "info",
        "common.faults.ok": "OK",
        "common.timeAgo.justNow": "just now",
      };
      if (map[key]) return map[key];
      if (key === "common.faults.activeSince")
        return `Active since ${opts?.ago ?? ""}`;
      if (key === "common.timeAgo.minutes") return `${opts?.count} minutes`;
      if (key === "common.timeAgo.hours") return `${opts?.count} hours`;
      if (key === "common.timeAgo.days") return `${opts?.count} days`;
      return key;
    },
  }),
}));

const baseActive: FaultAttribute = {
  kind: "fault",
  name: "filter_alarm",
  dataType: "bool",
  readWriteModes: ["read"],
  severity: "alert",
  isFaulty: true,
  currentValue: true,
  lastUpdated: new Date(Date.now() - 10 * 60_000).toISOString(),
  lastChanged: new Date(Date.now() - 10 * 60_000).toISOString(),
};

beforeEach(() => {
  vi.setSystemTime(new Date("2026-04-22T10:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FaultItem — active mode", () => {
  const severities: Severity[] = ["alert", "warning", "info"];

  it.each(severities)(
    "renders %s chip with label and 'Active since' text",
    (severity) => {
      const lastChanged = new Date(
        Date.parse("2026-04-22T10:00:00Z") - 10 * 60_000,
      ).toISOString();
      render(
        <FaultItem attribute={{ ...baseActive, severity, lastChanged }} />,
      );
      expect(screen.getByText(severity)).toBeInTheDocument();
      expect(screen.getByText("Filter Alarm")).toBeInTheDocument();
      expect(screen.getByText(/Active since 10 minutes/)).toBeInTheDocument();
    },
  );

  it("falls back to 'just now' when lastChanged is null", () => {
    render(<FaultItem attribute={{ ...baseActive, lastChanged: null }} />);
    expect(screen.getByText("Active since just now")).toBeInTheDocument();
  });
});

describe("FaultItem — healthy mode", () => {
  const healthy: FaultAttribute = {
    ...baseActive,
    isFaulty: false,
    currentValue: false,
  };

  it("shows label + OK and no severity chip", () => {
    render(<FaultItem attribute={healthy} />);
    expect(screen.getByText("Filter Alarm")).toBeInTheDocument();
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.queryByText("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("warning")).not.toBeInTheDocument();
    expect(screen.queryByText("info")).not.toBeInTheDocument();
  });
});

describe("FaultItem — edge cases", () => {
  it("applies truncate class on the label (long names)", () => {
    render(
      <FaultItem
        attribute={{
          ...baseActive,
          name: "very_long_attribute_name_that_will_overflow_container",
        }}
      />,
    );
    expect(
      screen.getByText("Very Long Attribute Name That Will Overflow Container"),
    ).toHaveClass("truncate");
  });
});

describe("FaultItem — onClick", () => {
  it("fires onClick on click when provided", () => {
    const onClick = vi.fn();
    render(<FaultItem attribute={baseActive} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires onClick on Enter and Space keys", () => {
    const onClick = vi.fn();
    render(<FaultItem attribute={baseActive} onClick={onClick} />);
    const row = screen.getByRole("button");
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("does not fire on other keys", () => {
    const onClick = vi.fn();
    render(<FaultItem attribute={baseActive} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "a" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("has no button role when onClick is absent", () => {
    render(<FaultItem attribute={baseActive} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
