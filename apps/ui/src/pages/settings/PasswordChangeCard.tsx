import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { type MeResponse } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { useAuthSchemaBounds } from "@/hooks/useAuthSchemaBounds";
import { serverErrorMessage } from "@/lib/serverErrorMessage";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InputController } from "@/components/forms/controllers/InputController";

type PasswordFormValues = {
  currentPassword: string;
  password: string;
  confirmPassword: string;
};

/** The server bound is bytes, so multi-byte characters run out sooner. */
const ENCODER = new TextEncoder();
const passwordByteLength = (value: string): number =>
  ENCODER.encode(value).length;

const EMPTY_FORM = {
  currentPassword: "",
  password: "",
  confirmPassword: "",
};

type PasswordChangeCardProps = {
  user: MeResponse;
  refreshMe: () => Promise<MeResponse>;
};

/** Self-service password change, via `/auth/password`. No `users:write` needed. */
export function PasswordChangeCard({
  user,
  refreshMe,
}: PasswordChangeCardProps) {
  const { t } = useTranslation();
  const client = useGridoneClient();
  const { password: bounds } = useAuthSchemaBounds();
  const { min, max } = bounds;

  const schema = useMemo(
    () =>
      z
        .object({
          currentPassword: z
            .string()
            .min(1, t("settings.validation.currentPasswordRequired")),
          password: z
            .string()
            .min(
              min,
              t("settings.validation.passwordMinLength", { count: min }),
            )
            .refine(
              (value) => passwordByteLength(value) <= max,
              t("settings.validation.passwordMaxLength", { count: max }),
            ),
          confirmPassword: z.string(),
        })
        .superRefine((values, ctx) => {
          if (values.confirmPassword.length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["confirmPassword"],
              message: t("settings.validation.confirmPasswordRequired"),
            });
          } else if (values.confirmPassword !== values.password) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["confirmPassword"],
              message: t("settings.passwordMismatch"),
            });
          }
        }),
    [t, min, max],
  );

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_FORM,
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    form.clearErrors("root");
    try {
      await client.users.changePassword({
        current_password: values.currentPassword,
        new_password: values.password,
      });

      await refreshMe();
      toast.success(t("settings.passwordUpdated"));
      form.reset(EMPTY_FORM);
    } catch (err) {
      const message = serverErrorMessage(err) ?? t("common.error");
      form.setError("root", { message });
      toast.error(message);
    }
  });

  const isSubmitting = form.formState.isSubmitting;
  const isDirty = form.formState.isDirty;

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.sections.security.title")}</CardTitle>
          <CardDescription>
            {t("settings.sections.security.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user.must_change_password && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t("settings.mustChangePasswordTitle")}</AlertTitle>
              <AlertDescription>
                {t("settings.mustChangePassword")}
              </AlertDescription>
            </Alert>
          )}

          <InputController
            name="currentPassword"
            control={form.control}
            type="password"
            label={t("settings.currentPassword")}
            inputProps={{
              disabled: isSubmitting,
              placeholder: t("settings.currentPasswordPlaceholder"),
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <InputController
              name="password"
              control={form.control}
              type="password"
              label={t("settings.newPassword")}
              inputProps={{
                disabled: isSubmitting,
                placeholder: t("settings.newPasswordPlaceholder"),
              }}
            />
            <InputController
              name="confirmPassword"
              control={form.control}
              type="password"
              label={t("settings.confirmPassword")}
              inputProps={{
                disabled: isSubmitting,
                placeholder: t("settings.confirmPasswordPlaceholder"),
              }}
            />
          </div>

          {form.formState.errors.root?.message && (
            <Alert variant="destructive">
              <AlertDescription>
                {form.formState.errors.root.message}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => form.reset(EMPTY_FORM)}
              disabled={isSubmitting || !isDirty}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? t("common.saving") : t("settings.updatePassword")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
