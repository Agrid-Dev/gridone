import { GridoneError } from "@gridone/sdk";
import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type {
  DefaultValues,
  FieldValues,
  UseFormReturn,
} from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyServerFieldErrors,
  useClearServerErrorOnChange,
} from "./serverErrors";
import { normalizeSchema } from "./normalizeSchema";
import { schemaFieldPaths } from "./SchemaFields";

const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mockToastError } }));

afterEach(() => {
  vi.clearAllMocks();
});

function makeForm<T extends FieldValues>(defaultValues: T): UseFormReturn<T> {
  const { result } = renderHook(() => {
    const form = useForm<T>({
      defaultValues: defaultValues as DefaultValues<T>,
    });
    void form.formState.errors;
    return form;
  });
  return new Proxy(result.current, {
    get: (_target, prop) => Reflect.get(result.current, prop),
  });
}

const item = (
  loc: (string | number)[],
  msg = "Field required",
  type = "missing",
) => ({ loc, msg, type });

const options = {
  fieldNames: ["host", "port"],
  fallbackMessage: "Save failed",
};

describe("applyServerFieldErrors", () => {
  it("maps the transport-create body, union, and config prefixes", () => {
    const form = makeForm({ host: "", port: 1883 });

    act(() => {
      applyServerFieldErrors(
        form,
        new GridoneError(422, [
          item(["body", "mqtt", "config", "host"], "Host is invalid"),
        ]),
        { ...options, prefixes: ["config"], unionTag: "mqtt" },
      );
    });

    expect(form.getFieldState("host").error?.message).toBe("Host is invalid");
    expect(form.formState.errors.root).toBeUndefined();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("maps a transport-update location relative to the config model", () => {
    const form = makeForm({ host: "", port: 1883 });

    act(() => {
      applyServerFieldErrors(
        form,
        new GridoneError(422, [item(["port"], "Input must be positive")]),
        options,
      );
    });

    expect(form.getFieldState("port").error?.message).toBe(
      "Input must be positive",
    );
  });

  it("surfaces a model-validator location on root plus the fallback toast", () => {
    const form = makeForm({ host: "" });

    act(() => {
      applyServerFieldErrors(
        form,
        new GridoneError(422, [
          item([], "client_cert and client_key must be provided together"),
        ]),
        { ...options, fieldNames: ["host"] },
      );
    });

    expect(form.formState.errors.root?.server?.message).toBe(
      "client_cert and client_key must be provided together",
    );
    expect(mockToastError).toHaveBeenCalledWith("Save failed");
  });

  it("surfaces a string-detail 422 on root plus the fallback toast", () => {
    const form = makeForm({ host: "" });

    act(() => {
      applyServerFieldErrors(
        form,
        new GridoneError(422, "Transport config was rejected"),
        { ...options, fieldNames: ["host"] },
      );
    });

    expect(form.formState.errors.root?.server?.message).toBe(
      "Transport config was rejected",
    );
    expect(mockToastError).toHaveBeenCalledWith("Save failed");
  });

  it("maps an indexed app-config location to its concrete row field", () => {
    const form = makeForm({ meters: [{ point_id: "" }] });

    act(() => {
      applyServerFieldErrors(
        form,
        new GridoneError(422, [
          item(["meters", 0, "point_id"], "Must be a string", "type"),
        ]),
        {
          ...options,
          fieldNames: ["meters", "meters.0", "meters.0.point_id"],
        },
      );
    });

    expect(form.getFieldState("meters.0.point_id").error?.message).toBe(
      "Must be a string",
    );
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("never drops a location that matches no rendered field", () => {
    const form = makeForm({ host: "" });

    act(() => {
      applyServerFieldErrors(
        form,
        new GridoneError(422, [item(["unknown"], "Unknown field")]),
        { ...options, fieldNames: ["host"] },
      );
    });

    expect(form.formState.errors.root?.server?.message).toBe("Unknown field");
    expect(mockToastError).toHaveBeenCalledWith("Save failed");
  });

  it("routes errors on unsupported (non-rendering) fields to the root banner", () => {
    // An object property normalizes to kind "unsupported", whose placeholder
    // renders no FieldError. schemaFieldPaths must therefore not register it:
    // a matched-but-invisible setError would drop the failure entirely
    // (no field text, no banner, no toast).
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { fields } = normalizeSchema({
      type: "object",
      properties: {
        host: { type: "string" },
        thresholds: { type: "object", properties: {} },
      },
    });
    const form = makeForm({ host: "", thresholds: { max: 40 } });

    act(() => {
      applyServerFieldErrors(
        form,
        new GridoneError(422, [item(["thresholds", "max"], "Too high")]),
        { ...options, fieldNames: schemaFieldPaths(fields, form.getValues()) },
      );
    });

    expect(form.formState.errors.root?.server?.message).toBe("Too high");
    expect(mockToastError).toHaveBeenCalledWith("Save failed");
  });

  it("strips configured scopes around one union tag", () => {
    const form = makeForm({ cron: "" });

    act(() => {
      applyServerFieldErrors(
        form,
        new GridoneError(422, [
          item(
            ["body", "trigger", "schedule", "params", "cron"],
            "Invalid cron",
          ),
        ]),
        {
          ...options,
          fieldNames: ["cron"],
          prefixes: ["trigger", "params"],
          unionTag: "schedule",
        },
      );
    });

    expect(form.getFieldState("cron").error?.message).toBe("Invalid cron");
  });
});

it("clears root.server on the next field change", () => {
  const { result } = renderHook(() => {
    const form = useForm({ defaultValues: { name: "" } });
    useClearServerErrorOnChange(form);
    void form.formState.errors;
    return form;
  });

  act(() => {
    result.current.setError("root.server", {
      type: "server",
      message: "Try again",
    });
  });
  expect(result.current.formState.errors.root?.server).toBeDefined();

  act(() => {
    result.current.setValue("name", "changed", { shouldDirty: true });
  });
  expect(result.current.formState.errors.root).toBeUndefined();
});
