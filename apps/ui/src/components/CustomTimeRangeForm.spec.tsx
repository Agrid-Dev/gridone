import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { inTimeZone } from "@/test/timeZone";
import { CustomTimeRangeForm } from "./CustomTimeRangeForm";
import {
  customRangeSchema,
  localDateTime,
  localToUtc,
} from "@/lib/customTimeRange";

vi.mock("react-i18next", () =>
  createI18nMock({
    "timeRange.start": "Start",
    "timeRange.end": "End",
    "timeRange.rangeApply": "Apply",
  }),
);
afterEach(cleanup);

describe("browser-local custom ranges", () => {
  inTimeZone("America/Martinique");
  it("reopens ISO links locally and submits explicit UTC independently of building timezone", async () => {
    const onApply = vi.fn();
    const range = {
      kind: "custom" as const,
      start: "2026-03-01T12:00:00Z",
      end: "2026-03-01T18:00:00+02:00",
    };
    render(<CustomTimeRangeForm timeRange={range} onApply={onApply} />);
    expect(screen.getByLabelText("Start")).toHaveValue("2026-03-01T08:00");
    expect(screen.getByLabelText("End")).toHaveValue("2026-03-01T12:00");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith({
        kind: "custom",
        start: "2026-03-01T12:00:00.000Z",
        end: "2026-03-01T16:00:00.000Z",
      }),
    );
    cleanup();
    render(
      <CustomTimeRangeForm
        timeRange={onApply.mock.calls[0][0]}
        onApply={onApply}
      />,
    );
    expect(screen.getByLabelText("Start")).toHaveValue("2026-03-01T08:00");
  });
  it.each(["start", "end"] as const)(
    "allows only a valid %s bound",
    async (field) => {
      const onApply = vi.fn();
      render(
        <CustomTimeRangeForm
          timeRange={{ kind: "preset", preset: "7d" }}
          onApply={onApply}
        />,
      );
      fireEvent.change(
        screen.getByLabelText(field === "start" ? "Start" : "End"),
        { target: { value: "2026-01-01T08:00" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      await waitFor(() =>
        expect(onApply).toHaveBeenCalledWith({
          kind: "custom",
          start: "",
          end: "",
          [field]: "2026-01-01T12:00:00.000Z",
        }),
      );
    },
  );
  it.each([
    { start: "", end: "", message: "required" },
    { start: "2026-01-02T08:00", end: "2026-01-01T08:00", message: "reversed" },
    { start: "2099-01-01T08:00", end: "", message: "future" },
  ])(
    "rejects $message ranges without applying",
    async ({ start, end, message }) => {
      const onApply = vi.fn();
      render(
        <CustomTimeRangeForm
          timeRange={{ kind: "preset", preset: "7d" }}
          onApply={onApply}
        />,
      );
      fireEvent.change(screen.getByLabelText("Start"), {
        target: { value: start },
      });
      fireEvent.change(screen.getByLabelText("End"), {
        target: { value: end },
      });
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        `timeRange.errors.${message}`,
      );
      expect(onApply).not.toHaveBeenCalled();
    },
  );
});

describe("DST wall times", () => {
  inTimeZone("Europe/Paris");
  it("rejects the missing spring hour and invalid dates", () => {
    for (const start of ["2026-03-29T02:30", "2026-02-30T10:00", "invalid"]) {
      expect(customRangeSchema.safeParse({ start, end: "" }).success).toBe(
        false,
      );
    }
  });
  it("round-trips both autumn offsets without shifting an unchanged link", () => {
    for (const timestamp of [
      "2025-10-26T02:30:00+02:00",
      "2025-10-26T02:30:00+01:00",
    ]) {
      expect(localDateTime(timestamp)).toBe("2025-10-26T02:30");
      expect(localToUtc(localDateTime(timestamp), timestamp)).toBe(
        new Date(timestamp).toISOString(),
      );
    }
  });
  it("preserves seconds and fractional seconds", () => {
    const timestamp = "2026-01-01T12:01:23.456Z";
    expect(localToUtc(localDateTime(timestamp))).toBe(timestamp);
  });
  it.each(["12:01:00", "12:01:23.000", "12:01:23.1", "12:01:23.12"])(
    "accepts native input precision %s",
    (time) => {
      expect(
        customRangeSchema.safeParse({ start: `2026-01-01T${time}`, end: "" })
          .success,
      ).toBe(true);
    },
  );
  it("preserves the later autumn offset when the browser shortens milliseconds", () => {
    expect(
      localToUtc("2025-10-26T02:30:00.1", "2025-10-26T02:30:00.100+01:00"),
    ).toBe("2025-10-26T01:30:00.100Z");
  });
});
