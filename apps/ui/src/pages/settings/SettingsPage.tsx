import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { updateUser } from "@/api/users";
import { ApiError } from "@/api/apiError";
import { getAuthSchema } from "@/api/authValidation";
import { ResourceHeader } from "@/components/ResourceHeader";
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

type ProfileFormValues = {
  username: string;
  name: string;
  email: string;
  title: string;
  password: string;
  confirmPassword: string;
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const { state, refreshMe } = useAuth();

  const user = state.status === "authenticated" ? state.user : null;

  const { data: authSchema } = useQuery({
    queryKey: ["auth-schema"],
    queryFn: getAuthSchema,
    staleTime: 5 * 60 * 1000,
  });

  const usernameMin = authSchema?.properties?.username?.minLength ?? 3;
  const usernameMax = authSchema?.properties?.username?.maxLength ?? 64;
  const passwordMin = authSchema?.properties?.password?.minLength ?? 5;
  const passwordMax = authSchema?.properties?.password?.maxLength ?? 128;

  const schema = useMemo(
    () =>
      z
        .object({
          username: z
            .string()
            .trim()
            .min(
              usernameMin,
              t("settings.validation.usernameMinLength", {
                count: usernameMin,
              }),
            )
            .max(
              usernameMax,
              t("settings.validation.usernameMaxLength", {
                count: usernameMax,
              }),
            ),
          name: z.string().trim(),
          email: z
            .string()
            .trim()
            .email(t("settings.validation.emailInvalid"))
            .or(z.literal("")),
          title: z.string().trim(),
          password: z.string().max(
            passwordMax,
            t("settings.validation.passwordMaxLength", {
              count: passwordMax,
            }),
          ),
          confirmPassword: z.string(),
        })
        .superRefine((values, ctx) => {
          if (
            values.password.length === 0 &&
            values.confirmPassword.length > 0
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["confirmPassword"],
              message: t("settings.passwordMismatch"),
            });
            return;
          }

          if (values.password.length > 0) {
            if (values.password.length < passwordMin) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["password"],
                message: t("settings.validation.passwordMinLength", {
                  count: passwordMin,
                }),
              });
            }

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
          }
        }),
    [t, usernameMin, usernameMax, passwordMin, passwordMax],
  );

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "",
      name: "",
      email: "",
      title: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        username: user.username,
        name: user.name,
        email: user.email,
        title: user.title,
        password: "",
        confirmPassword: "",
      });
    }
  }, [form, user]);

  if (!user) return null;

  const handleSubmit = form.handleSubmit(async (values) => {
    form.clearErrors("root");
    try {
      await updateUser(user.id, {
        username: values.username || undefined,
        name: values.name,
        email: values.email,
        title: values.title,
        ...(values.password ? { password: values.password } : {}),
      });

      await refreshMe();
      toast.success(t("settings.saved"));

      form.reset({
        ...values,
        password: "",
        confirmPassword: "",
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.detail || err.details
          : err instanceof Error
            ? err.message
            : t("common.error");
      form.setError("root", { message });
      toast.error(message);
    }
  });

  const isSubmitting = form.formState.isSubmitting;

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("settings.subtitle")}
        resourceName={t("settings.title")}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.sections.profile.title")}</CardTitle>
            <CardDescription>
              {t("settings.sections.profile.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <InputController
              name="username"
              control={form.control}
              label={t("settings.fields.username")}
              inputProps={{ disabled: isSubmitting }}
            />
            <InputController
              name="name"
              control={form.control}
              label={t("settings.fields.name")}
              inputProps={{ disabled: isSubmitting }}
            />
            <InputController
              name="email"
              control={form.control}
              type="email"
              label={t("settings.fields.email")}
              inputProps={{ disabled: isSubmitting }}
            />
            <InputController
              name="title"
              control={form.control}
              label={t("settings.fields.title")}
              inputProps={{ disabled: isSubmitting }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.sections.security.title")}</CardTitle>
            <CardDescription>
              {t("settings.sections.security.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user.mustChangePassword && (
              <Alert variant="destructive">
                <AlertTitle>{t("settings.mustChangePasswordTitle")}</AlertTitle>
                <AlertDescription>
                  {t("settings.mustChangePassword")}
                </AlertDescription>
              </Alert>
            )}

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
          </CardContent>
        </Card>

        {form.formState.errors.root?.message && (
          <Alert variant="destructive">
            <AlertDescription>
              {form.formState.errors.root.message}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </form>
    </section>
  );
}
