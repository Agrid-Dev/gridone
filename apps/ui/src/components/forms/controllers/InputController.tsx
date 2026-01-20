// InputController.tsx (or rename to InputController.tsx)
import * as React from "react";
import {
  useController,
  type FieldPath,
  type FieldValues,
  type UseControllerProps,
} from "react-hook-form";

import { Input } from "@/components/ui";
import { FieldShell } from "./FieldShell";

type InputControllerProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = UseControllerProps<TFieldValues, TName> & {
  label?: React.ReactNode;
  description?: React.ReactNode;
  required?: boolean;
  type?: React.HTMLInputTypeAttribute;
  inputProps?: Omit<
    React.ComponentProps<typeof Input>,
    | "aria-invalid"
    | "autoComplete"
    | "id"
    | "name"
    | "value"
    | "defaultValue"
    | "onChange"
    | "onBlur"
    | "ref"
    | "type"
  >;
};

export function InputController<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  label,
  description,
  type = "text",
  required,
  inputProps,
  ...controllerProps
}: InputControllerProps<TFieldValues, TName>) {
  const { field, fieldState } = useController(controllerProps);

  const id = field.name;
  const parsedType = type === "integer" ? "number" : "type";

  const inputValue =
    type === "number" ? (field.value ?? "") : (field.value ?? "");

  return (
    <FieldShell
      id={id}
      invalid={fieldState.invalid}
      label={label}
      description={description}
      error={fieldState.error}
      required={required}
    >
      <Input
        id={id}
        aria-invalid={fieldState.invalid}
        autoComplete="off"
        aria-required={required}
        type={parsedType}
        {...field}
        {...inputProps}
        value={inputValue}
        onChange={(e) => {
          if (parsedType !== "number") return field.onChange(e);

          const raw = e.currentTarget.value;
          if (raw === "") return field.onChange(undefined); // or null

          const n = e.currentTarget.valueAsNumber;
          field.onChange(Number.isNaN(n) ? undefined : n);
        }}
      />
    </FieldShell>
  );
}
