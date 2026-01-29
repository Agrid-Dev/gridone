import * as React from "react";
import {
  useController,
  type FieldPath,
  type FieldValues,
  type UseControllerProps,
} from "react-hook-form";

import { Textarea } from "@/components/ui/textarea";
import { FieldShell } from "./FieldShell";

type TextareaControllerProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = UseControllerProps<TFieldValues, TName> & {
  label?: React.ReactNode;
  description?: React.ReactNode;
  placeholder?: string;
  required?: boolean;
  textareaProps?: Omit<
    React.ComponentProps<typeof Textarea>,
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
    | "placeholder"
  >;
};

export function TextareaController<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  label,
  description,
  required,
  textareaProps,
  placeholder,
  ...controllerProps
}: TextareaControllerProps<TFieldValues, TName>) {
  const { field, fieldState } = useController(controllerProps);

  const id = field.name;

  return (
    <FieldShell
      id={id}
      invalid={fieldState.invalid}
      label={label}
      description={description}
      error={fieldState.error}
      required={required}
    >
      <Textarea
        id={id}
        aria-invalid={fieldState.invalid}
        autoComplete="off"
        aria-required={required}
        placeholder={placeholder}
        {...field}
        {...textareaProps}
      />
    </FieldShell>
  );
}
