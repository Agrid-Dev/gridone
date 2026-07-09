import * as React from "react";
import {
  useController,
  type FieldPath,
  type FieldValues,
  type UseControllerProps,
} from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Button, Input } from "@/components/ui";
import { FieldShell } from "./FieldShell";
import { InputController } from "./InputController";

type ObjectSecretField = {
  name: string;
  label: string;
  type?: React.HTMLInputTypeAttribute;
  required?: boolean;
};

type SecretFieldControllerProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = UseControllerProps<TFieldValues, TName> & {
  label?: React.ReactNode;
  description?: React.ReactNode;
  required?: boolean;
  /** The value is already set on the server (write-only). */
  configured: boolean;
  /** The user chose to replace an already-configured secret. */
  revealing: boolean;
  onReveal: () => void;
  onCancel: () => void;
  /**
   * When the secret's value is a structured object (e.g. KNX's
   * secure_credentials) rather than a scalar, render one input per field
   * instead of a single masked input.
   */
  objectFields?: ObjectSecretField[];
};

/**
 * Write-only secret field. A configured secret is never read back: it renders
 * as "Configured" with a Replace affordance, and only becomes an editable
 * (masked) input once the user opts to replace it. New (unconfigured) secrets
 * render as a normal password input.
 */
export function SecretFieldController<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  label,
  description,
  required,
  configured,
  revealing,
  onReveal,
  onCancel,
  objectFields,
  ...controllerProps
}: SecretFieldControllerProps<TFieldValues, TName>) {
  const { t } = useTranslation("transports");
  const { field, fieldState } = useController(controllerProps);
  const id = field.name;

  if (configured && !revealing) {
    return (
      <FieldShell id={id} label={label} description={description}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t("fields.secretConfigured")}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onReveal}>
            {t("fields.secretReplace")}
          </Button>
        </div>
      </FieldShell>
    );
  }

  const cancelButton = configured && revealing && (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        field.onChange(undefined);
        onCancel();
      }}
    >
      {t("fields.secretCancel")}
    </Button>
  );

  if (objectFields) {
    return (
      <FieldShell
        id={id}
        label={label}
        description={description}
        required={required}
      >
        <div className="flex flex-col gap-2">
          {objectFields.map((sub) => (
            <InputController
              key={sub.name}
              name={`${id}.${sub.name}` as TName}
              control={controllerProps.control}
              label={sub.label}
              type={sub.type}
              required={sub.required}
            />
          ))}
          {cancelButton}
        </div>
      </FieldShell>
    );
  }

  return (
    <FieldShell
      id={id}
      invalid={fieldState.invalid}
      label={label}
      description={description}
      error={fieldState.error}
      required={required}
    >
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="password"
          autoComplete="new-password"
          aria-invalid={fieldState.invalid}
          aria-required={required}
          {...field}
          value={field.value ?? ""}
        />
        {cancelButton}
      </div>
    </FieldShell>
  );
}
