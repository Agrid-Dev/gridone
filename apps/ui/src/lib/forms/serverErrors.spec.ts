import { GridoneError, NetworkError } from "@gridone/sdk";
import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type {
  DefaultValues,
  FieldValues,
  UseFormReturn,
} from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyServerErrors, setServerFieldErrors } from "./serverErrors";

const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mockToastError } }));

afterEach(() => {
  vi.clearAllMocks();
});

function makeForm<T extends FieldValues>(defaultValues: T): UseFormReturn<T> {
  const { result } = renderHook(() => {
    const form: UseFormReturn<T> = useForm<T>({
      defaultValues: defaultValues as DefaultValues<T>,
    });
    // Touch errors during render so react-hook-form's formState proxy
    // subscribes to them and re-renders on setError.
    void form.formState.errors;
    return form;
  });
  // Delegate to the latest render: formState is an immutable snapshot per
  // render, so a captured `result.current` would go stale after setError.
  return new Proxy(result.current, {
    get: (_target, prop) => Reflect.get(result.current, prop),
  });
}

function item(
  loc: (string | number)[],
  msg = "Field required",
  type = "missing",
) {
  return { loc, msg, type };
}

describe("setServerFieldErrors", () => {
  it("sets the error on an exactly matching field", () => {
    const form = makeForm({ name: "" });

    let orphans;
    act(() => {
      orphans = setServerFieldErrors(form, [
        item(["body", "name"], "Name is required"),
      ]);
    });

    expect(orphans).toEqual([]);
    expect(form.getFieldState("name").error).toEqual({
      type: "server",
      message: "Name is required",
      ref: undefined,
    });
  });

  it("strips scope and discriminator prefixes until a field matches", () => {
    const form = makeForm({ host: "", port: 1883 });

    let orphans;
    act(() => {
      orphans = setServerFieldErrors(form, [
        item(["body", "mqtt", "config", "host"], "Field required"),
      ]);
    });

    expect(orphans).toEqual([]);
    expect(form.getFieldState("host").error?.message).toBe("Field required");
  });

  it("prefers the most specific matching path", () => {
    const form = makeForm({ config: { host: "" }, host: "top-level" });

    act(() => {
      setServerFieldErrors(form, [item(["body", "config", "host"], "bad")]);
    });

    expect(form.getFieldState("config.host").error?.message).toBe("bad");
    expect(form.getFieldState("host").error).toBeUndefined();
  });

  it("matches indexed locs against array fields", () => {
    const form = makeForm({
      targets: [{ device_id: "a" }, { device_id: "b" }],
    });

    let orphans;
    act(() => {
      orphans = setServerFieldErrors(form, [
        item(["body", "targets", 1, "device_id"], "Unknown device"),
      ]);
    });

    expect(orphans).toEqual([]);
    expect(form.getFieldState("targets.1.device_id").error?.message).toBe(
      "Unknown device",
    );
  });

  it("reconciles snake_case locs with camelCase field names", () => {
    const form = makeForm({ deviceId: "" });

    let orphans;
    act(() => {
      orphans = setServerFieldErrors(form, [
        item(["body", "device_id"], "Unknown"),
      ]);
    });

    expect(orphans).toEqual([]);
    expect(form.getFieldState("deviceId").error?.message).toBe("Unknown");
  });

  it("matches fields whose current value is undefined", () => {
    const form = makeForm<{ host?: string }>({ host: undefined });

    let orphans;
    act(() => {
      orphans = setServerFieldErrors(form, [item(["body", "host"])]);
    });

    expect(orphans).toEqual([]);
  });

  it("returns errors that match no field as orphans", () => {
    const form = makeForm({ name: "" });
    const orphan = item(
      ["body", "device_id"],
      "Extra inputs are not permitted",
      "extra_forbidden",
    );

    let orphans;
    act(() => {
      orphans = setServerFieldErrors(form, [item(["body", "name"]), orphan]);
    });

    expect(orphans).toEqual([orphan]);
    expect(form.getFieldState("name").error).toBeDefined();
  });

  it("does not match a prefix of a field path without a leaf", () => {
    const form = makeForm({ name: "" });

    let orphans;
    act(() => {
      orphans = setServerFieldErrors(form, [item(["body", "name", "nested"])]);
    });

    expect(orphans).toHaveLength(1);
  });
});

describe("applyServerErrors", () => {
  const options = { fallbackMessage: "Save failed" };

  it("applies field errors and surfaces nothing else when all match", () => {
    const form = makeForm({ host: "" });
    const error = new GridoneError(422, [
      item(["body", "config", "host"], "bad"),
    ]);

    let orphans;
    act(() => {
      orphans = applyServerErrors(form, error, options);
    });

    expect(orphans).toEqual([]);
    expect(form.getFieldState("host").error?.message).toBe("bad");
    expect(form.formState.errors.root).toBeUndefined();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("surfaces the fallback and logs when field errors are orphaned", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const form = makeForm({ name: "" });
    const orphan = item(["body", "device_id"], "Extra", "extra_forbidden");
    const error = new GridoneError(422, [orphan]);

    let orphans;
    act(() => {
      orphans = applyServerErrors(form, error, options);
    });

    expect(orphans).toEqual([orphan]);
    expect(form.formState.errors.root?.server?.message).toBe("Save failed");
    expect(consoleError).toHaveBeenCalledWith(
      "Server field errors matched no form field",
      [orphan],
    );
    consoleError.mockRestore();
  });

  it("puts a domain message on root by default", () => {
    const form = makeForm({ name: "" });
    const error = new GridoneError(409, "Name already taken");

    act(() => {
      applyServerErrors(form, error, options);
    });

    expect(form.formState.errors.root?.server?.message).toBe(
      "Name already taken",
    );
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("routes messages to a toast when surface is toast", () => {
    const form = makeForm({ name: "" });
    const error = new GridoneError(404, "Transport not found");

    act(() => {
      applyServerErrors(form, error, { ...options, surface: "toast" });
    });

    expect(mockToastError).toHaveBeenCalledWith("Transport not found");
    expect(form.formState.errors.root).toBeUndefined();
  });

  it.each([
    ["a 500", new GridoneError(500, "Traceback: boom")],
    ["a network error", new NetworkError("fetch failed")],
    ["a non-Gridone error", new Error("boom")],
  ])("surfaces the generic fallback for %s", (_label, error) => {
    const form = makeForm({ name: "" });

    act(() => {
      applyServerErrors(form, error, { ...options, surface: "toast" });
    });

    expect(mockToastError).toHaveBeenCalledWith("Save failed");
  });
});
