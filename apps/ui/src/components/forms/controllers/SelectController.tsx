// SelectController.tsx
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
  selectProps,
  triggerProps,
  contentProps,
  title,
  ...controllerProps
}: SelectControllerProps<TFieldValues, TName, TValue>) {
  const { field, fieldState } = useController(controllerProps);

  const id = field.name;

  const value = (field.value ?? "") as string;

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
          else field.onChange(v);
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
          <SelectValue placeholder={placeholder} />
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
