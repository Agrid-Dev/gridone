import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ControlRuntime,
  type AttributeWriter,
  type WriteOutcome,
} from "../controlRuntime";

type Deferred = {
  attribute: string;
  value: unknown;
  resolve: (outcome: WriteOutcome) => void;
  reject: (error: unknown) => void;
};

/** A writer whose completions the test controls one by one. */
function deferredWriter() {
  const calls: Deferred[] = [];
  const writer: AttributeWriter = (attribute, value) =>
    new Promise((resolve, reject) => {
      calls.push({ attribute, value, resolve, reject });
    });
  return { writer, calls };
}

// Fake timers also fake setTimeout: settle promise chains through them.
const flushPromises = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ControlRuntime", () => {
  it("groups a burst of increments into one command sent after the debounce", async () => {
    const { writer, calls } = deferredWriter();
    const runtime = new ControlRuntime(writer, 600);
    runtime.setReported("setpoint", 21);
    for (let i = 1; i <= 10; i += 1) runtime.request("setpoint", 21 + i * 0.5);
    expect(runtime.snapshot("setpoint")).toMatchObject({
      displayed: 26,
      pending: true,
      write: { kind: "idle" },
    });
    await vi.advanceTimersByTimeAsync(599);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([
      expect.objectContaining({ attribute: "setpoint", value: 26 }),
    ]);
    expect(runtime.snapshot("setpoint").write).toEqual({
      kind: "sending",
      requested: 26,
    });
  });

  it("sends a discrete action at once, exactly once", async () => {
    const { writer, calls } = deferredWriter();
    const runtime = new ControlRuntime(writer);
    runtime.request("power", true, { immediate: true });
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1);
  });

  it("keeps one write in flight per attribute and sends the newest intention afterwards", async () => {
    const { writer, calls } = deferredWriter();
    const runtime = new ControlRuntime(writer, 600);
    runtime.request("setpoint", 22);
    await vi.advanceTimersByTimeAsync(600);
    expect(calls).toHaveLength(1);
    // Two more intentions while the first write is in flight: only the last survives.
    runtime.request("setpoint", 22.5);
    runtime.request("setpoint", 23);
    await vi.advanceTimersByTimeAsync(600);
    expect(calls).toHaveLength(1);
    expect(runtime.snapshot("setpoint")).toMatchObject({
      displayed: 23,
      pending: true,
      write: { kind: "sending", requested: 22 },
    });
    calls[0].resolve({ kind: "ok" });
    await flushPromises();
    expect(calls).toHaveLength(2);
    expect(calls[1].value).toBe(23);
    expect(runtime.snapshot("setpoint").write).toEqual({
      kind: "sending",
      requested: 23,
    });
    calls[1].resolve({ kind: "ok" });
    await flushPromises();
    expect(runtime.snapshot("setpoint")).toMatchObject({
      displayed: null,
      pending: false,
      write: { kind: "confirmed", requested: 23 },
    });
  });

  it("never lets a reported update override a newer intention", async () => {
    const { writer, calls } = deferredWriter();
    const runtime = new ControlRuntime(writer, 600);
    runtime.setReported("setpoint", 21);
    runtime.request("setpoint", 22);
    runtime.setReported("setpoint", 21.5);
    expect(runtime.snapshot("setpoint").displayed).toBe(22);
    await vi.advanceTimersByTimeAsync(600);
    runtime.setReported("setpoint", 19);
    expect(runtime.snapshot("setpoint")).toMatchObject({
      displayed: 22,
      reported: 19,
    });
    calls[0].resolve({ kind: "ok" });
    await flushPromises();
    // Once nothing is pending or in flight, the reported value is the truth.
    expect(runtime.snapshot("setpoint").displayed).toBe(19);
  });

  it.each<[WriteOutcome, string]>([
    [{ kind: "error", message: "out of range" }, "error"],
    [{ kind: "unconfirmed", message: "no echo" }, "unconfirmed"],
  ])(
    "shows the real outcome %j and falls back to the reported value",
    async (outcome, kind) => {
      const { writer, calls } = deferredWriter();
      const runtime = new ControlRuntime(writer, 600);
      runtime.setReported("setpoint", 21);
      runtime.request("setpoint", 40, { immediate: true });
      calls[0].resolve(outcome);
      await flushPromises();
      expect(runtime.snapshot("setpoint")).toEqual({
        reported: 21,
        displayed: 21,
        pending: false,
        write: {
          kind,
          requested: 40,
          message: outcome.kind === "ok" ? "" : outcome.message,
        },
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(calls).toHaveLength(1); // no automatic retry
    },
  );

  it("turns a rejected writer into an error state", async () => {
    const { writer, calls } = deferredWriter();
    const runtime = new ControlRuntime(writer);
    runtime.request("power", true, { immediate: true });
    calls[0].reject(new Error("network down"));
    await flushPromises();
    expect(runtime.snapshot("power").write).toEqual({
      kind: "error",
      requested: true,
      message: "network down",
    });
  });

  it("does not report the outcome of a superseded write", async () => {
    const { writer, calls } = deferredWriter();
    const runtime = new ControlRuntime(writer, 600);
    runtime.request("setpoint", 22, { immediate: true });
    runtime.request("setpoint", 23);
    await vi.advanceTimersByTimeAsync(600);
    calls[0].resolve({ kind: "error", message: "old failure" });
    await flushPromises();
    expect(runtime.snapshot("setpoint").write).toEqual({
      kind: "sending",
      requested: 23,
    });
  });

  it("notifies subscribers on intentions, sends, completions and reports", async () => {
    const { writer, calls } = deferredWriter();
    const runtime = new ControlRuntime(writer, 600);
    const listener = vi.fn();
    runtime.subscribe(listener);
    runtime.request("setpoint", 22);
    expect(listener).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(600);
    expect(listener).toHaveBeenCalledTimes(2);
    calls[0].resolve({ kind: "ok" });
    await flushPromises();
    expect(listener).toHaveBeenCalledTimes(3);
    runtime.setReported("setpoint", 22);
    expect(listener).toHaveBeenCalledTimes(4);
    runtime.setReported("setpoint", 22);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("detach cancels pending intentions and ignores late completions until attached again", async () => {
    const { writer, calls } = deferredWriter();
    const runtime = new ControlRuntime(writer, 600);
    runtime.request("power", true, { immediate: true });
    runtime.request("setpoint", 22);
    runtime.detach();
    await vi.advanceTimersByTimeAsync(600);
    expect(calls).toHaveLength(1);
    calls[0].resolve({ kind: "ok" });
    await flushPromises();
    expect(runtime.snapshot("power").write).toEqual({
      kind: "sending",
      requested: true,
    });
    runtime.request("setpoint", 25, { immediate: true });
    expect(calls).toHaveLength(1);
    runtime.attach();
    runtime.request("setpoint", 25, { immediate: true });
    expect(calls).toHaveLength(2);
  });

  it("keeps attributes independent", async () => {
    const { writer, calls } = deferredWriter();
    const runtime = new ControlRuntime(writer, 600);
    runtime.request("setpoint", 22, { immediate: true });
    runtime.request("fan", "high", { immediate: true });
    expect(calls.map((c) => c.attribute)).toEqual(["setpoint", "fan"]);
  });
});
