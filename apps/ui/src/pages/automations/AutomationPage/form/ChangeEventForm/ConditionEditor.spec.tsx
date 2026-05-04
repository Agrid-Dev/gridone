import * as React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "triggers.operator": "Operator",
    "triggers.threshold": "Threshold",
    "operators.gt": ">",
    "operators.lt": "<",
    "operators.gte": "≥",
    "operators.lte": "≤",
    "operators.eq": "=",
    "operators.ne": "≠",
    "common.true": "True",
    "common.false": "False",
  }),
);

// Stub shadcn Select with a native <select> for jsdom-friendly interaction.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <select
      data-testid="select"
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{flattenToText(children)}</option>,
}));

function flattenToText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenToText).join(" ");
  if (React.isValidElement(node)) {
    return flattenToText(
      (node.props as { children?: React.ReactNode }).children,
    );
  }
  return "";
}

import { ConditionEditor, defaultConditionFor } from "./ConditionEditor";

afterEach(cleanup);

describe("ConditionEditor", () => {
  it("renders nothing while the dataType is unknown", () => {
    const { container } = render(
      <ConditionEditor
        value={defaultConditionFor("int")}
        onChange={vi.fn()}
        dataType={undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the value is still null (parent will seed)", () => {
    const { container } = render(
      <ConditionEditor value={null} onChange={vi.fn()} dataType="int" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("limits operators to eq/ne when dataType is bool", () => {
    render(
      <ConditionEditor
        value={{ operator: "eq", threshold: false }}
        onChange={vi.fn()}
        dataType="bool"
      />,
    );

    const operatorSelect = screen.getAllByTestId(
      "select",
    )[0] as HTMLSelectElement;
    const opValues = Array.from(operatorSelect.options).map((o) => o.value);
    expect(opValues).toEqual(["eq", "ne"]);
  });

  it("renders a number threshold input for int and emits numeric values", () => {
    const onChange = vi.fn();
    render(
      <ConditionEditor
        value={{ operator: "gt", threshold: 0 }}
        onChange={onChange}
        dataType="int"
      />,
    );

    const numberInput = screen.getByLabelText(/Threshold/) as HTMLInputElement;
    expect(numberInput).toHaveAttribute("type", "number");

    fireEvent.change(numberInput, { target: { value: "42" } });
    expect(onChange).toHaveBeenCalledWith({ operator: "gt", threshold: 42 });
  });

  it("renders a text threshold input for str and emits string values", () => {
    const onChange = vi.fn();
    render(
      <ConditionEditor
        value={{ operator: "eq", threshold: "" }}
        onChange={onChange}
        dataType="str"
      />,
    );

    const textInput = screen.getByLabelText(/Threshold/) as HTMLInputElement;
    expect(textInput).toHaveAttribute("type", "text");

    fireEvent.change(textInput, { target: { value: "running" } });
    expect(onChange).toHaveBeenCalledWith({
      operator: "eq",
      threshold: "running",
    });
  });

  it("changing the operator emits a new condition with the same threshold", () => {
    const onChange = vi.fn();
    render(
      <ConditionEditor
        value={{ operator: "gt", threshold: 5 }}
        onChange={onChange}
        dataType="int"
      />,
    );

    fireEvent.change(screen.getAllByTestId("select")[0], {
      target: { value: "lte" },
    });

    expect(onChange).toHaveBeenCalledWith({ operator: "lte", threshold: 5 });
  });
});
