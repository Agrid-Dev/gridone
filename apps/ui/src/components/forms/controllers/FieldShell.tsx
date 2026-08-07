// FieldShell.tsx
import * as React from "react";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import type { FieldError as RHFFieldError } from "react-hook-form";

interface FieldShellProps {
  id: string;
  invalid?: boolean;
  label?: React.ReactNode;
  required?: boolean;
  description?: React.ReactNode;
  error?: RHFFieldError;
  /** ``horizontal`` puts the label beside the control (settings-row layout)
   *  instead of above it. */
  orientation?: React.ComponentProps<typeof Field>["orientation"];
  children: React.ReactNode;
}

export function FieldShell({
  id,
  invalid,
  label,
  description,
  required,
  error,
  orientation,
  children,
}: FieldShellProps) {
  return (
    <Field data-invalid={invalid} orientation={orientation}>
      {label && (
        <FieldLabel htmlFor={id}>
          {label} {required && <span aria-hidden="true">*</span>}
        </FieldLabel>
      )}
      {description && <FieldDescription>{description}</FieldDescription>}
      {children}
      {invalid && <FieldError errors={[error]} />}
    </Field>
  );
}
