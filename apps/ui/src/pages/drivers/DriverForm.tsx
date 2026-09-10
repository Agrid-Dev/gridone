import { useId } from "react";
import { Controller } from "react-hook-form";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardFooter, Button } from "@/components/ui";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TextareaController } from "@/components/forms/controllers/TextAreaController";
import { useDriverForm } from "./useDriverForm";
import type { DriverPackageInput } from "./useDriverPackage";

type DriverFormProps = {
  onSubmit: (payload: DriverPackageInput) => Promise<void>;
  driverId?: string;
  disabled?: boolean;
  pending?: boolean;
};

export default function DriverForm({
  onSubmit,
  driverId,
  disabled,
  pending,
}: DriverFormProps) {
  const { t } = useTranslation("drivers");
  const { form, source, sourceField, submit } = useDriverForm(
    onSubmit,
    driverId,
  );
  const navigate = useNavigate();
  const id = useId();
  return (
    <Card>
      <CardContent className="py-4">
        <form id={id} onSubmit={submit} className="space-y-6">
          <fieldset disabled={pending} className="space-y-6">
            <legend className="sr-only">{t("package.source")}</legend>
            <div className="flex gap-6">
              {(["yaml", "file"] as const).map((value) => (
                <Field key={value} orientation="horizontal" className="w-auto">
                  <input
                    id={`${id}-${value}`}
                    type="radio"
                    value={value}
                    {...sourceField}
                  />
                  <FieldLabel htmlFor={`${id}-${value}`}>
                    {t(`package.${value}`)}
                  </FieldLabel>
                </Field>
              ))}
            </div>
            {source === "yaml" ? (
              <TextareaController
                label={t("package.yaml")}
                placeholder={t("package.yamlPlaceholder")}
                name="yaml"
                control={form.control}
                textareaProps={{ rows: 12 }}
                required
              />
            ) : (
              <>
                {!driverId && (
                  <Field data-invalid={!!form.formState.errors.driverId}>
                    <FieldLabel htmlFor={`${id}-driver-id`}>
                      {t("package.driverId")}
                    </FieldLabel>
                    <Input
                      id={`${id}-driver-id`}
                      aria-invalid={!!form.formState.errors.driverId}
                      {...form.register("driverId")}
                    />
                    <FieldDescription>
                      {t("package.driverIdHint")}
                    </FieldDescription>
                    <FieldError errors={[form.formState.errors.driverId]} />
                  </Field>
                )}
                <Controller
                  name="file"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${id}-upload`}>
                        {t("package.file")}
                      </FieldLabel>
                      <Input
                        id={`${id}-upload`}
                        type="file"
                        accept=".yaml,.yml,.zip"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        onChange={(event) =>
                          field.onChange(event.target.files?.[0])
                        }
                        aria-invalid={fieldState.invalid}
                      />
                      <FieldDescription>
                        {t("package.fileHint")}
                      </FieldDescription>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              </>
            )}
          </fieldset>
        </form>
      </CardContent>
      <CardFooter className="flex justify-end gap-4 mt-4">
        <Button
          variant="outline"
          onClick={() =>
            navigate(
              driverId
                ? `/drivers/${encodeURIComponent(driverId)}`
                : "/drivers",
            )
          }
        >
          {t("package.cancel")}
        </Button>
        <Button
          type="submit"
          form={id}
          disabled={disabled || form.formState.isSubmitting}
        >
          {pending
            ? t("package.installing")
            : driverId
              ? t("package.replace")
              : t("package.install")}
        </Button>
      </CardFooter>
    </Card>
  );
}
