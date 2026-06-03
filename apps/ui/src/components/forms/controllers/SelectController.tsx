import * as React from "react";
import {
  useController,
  type FieldPath,
  type FieldValues,
  type UseControllerProps,
} from "react-hook-form";

import { FieldShell } from "./FieldShell";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

type SelectOption<V extends string> = {
  value: V;
  label: React.ReactNode;
  disabled?: boolean;
};

type SelectControllerProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TValue extends string = string,
> = UseControllerProps<TFieldValues, TName> & {
  label?: React.ReactNode;
  description?: React.ReactNode;
  required?: boolean;
  options: ReadonlyArray<SelectOption<TValue>>;
  placeholder?: React.ReactNode;
  allowEmpty?: boolean;
  emptyValue?: undefined | "";
  title?: string;
  /** Optional transform applied to the selected string value before storing
   *  in the form field — use when the field must hold a non-string type
   *  (e.g. coercing "42" → 42 for an int attribute). */
  transform?: (value: string) => unknown;
  selectProps?: Omit<
    React.ComponentProps<typeof Select>,
    "value" | "defaultValue" | "onValueChange" | "disabled"
  >;
  triggerProps?: Omit<
    React.ComponentProps<typeof SelectTrigger>,
    "id" | "aria-invalid" | "disabled"
  >;
  contentProps?: React.ComponentProps<typeof SelectContent>;
};

export function SelectController<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TValue extends string = string,
>({
  label,
  description,
  options,
  placeholder = "Select…",
  allowEmpty = false,
  emptyValue = undefined,
  required,
  transform,
  selectProps,
  triggerProps,
  contentProps,
  title,
  ...controllerProps
}: SelectControllerProps<TFieldValues, TName, TValue>) {
  const { field, fieldState } = useController(controllerProps);

  const id = field.name;

  const valueStr =
    field.value !== undefined && field.value !== null
      ? String(field.value)
      : "";
  const isInOptions = options.some((opt) => String(opt.value) === valueStr);
  const value = isInOptions ? valueStr : "";
  const effectivePlaceholder =
    !isInOptions && valueStr ? valueStr : placeholder;

  return (
    <FieldShell
      id={id}
      invalid={fieldState.invalid}
      label={label}
      required={required}
      description={description}
      error={fieldState.error}
    >
      <Select
        {...selectProps}
        value={value}
        onValueChange={(v) => {
          if (allowEmpty && v === "") field.onChange(emptyValue);
          else field.onChange(transform ? transform(v) : v);
        }}
        disabled={field.disabled}
        required={required}
      >
        <SelectTrigger
          {...triggerProps}
          id={id}
          aria-invalid={fieldState.invalid}
          disabled={field.disabled}
          title={title}
        >
          <SelectValue placeholder={effectivePlaceholder} />
        </SelectTrigger>

        <SelectContent {...contentProps}>
          {allowEmpty && (
            <SelectItem value="">
              {/* you can customize this label */}
              <span className="opacity-70">None</span>
            </SelectItem>
          )}

          {options.map((opt) => (
            <SelectItem
              key={String(opt.value)}
              value={String(opt.value)}
              disabled={opt.disabled}
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}
