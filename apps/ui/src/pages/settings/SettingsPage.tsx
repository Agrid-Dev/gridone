import { useEffect, useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { isGridoneError, type MeResponse } from "@gridone/sdk";
import { useAuth } from "@/contexts/AuthContext";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { getAuthSchema } from "@/lib/authSchema";
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

/** A user-safe message for a failed save — never leaks raw server internals. */
function toErrorMessage(err: unknown, fallback: string): string {
  if (isGridoneError(err)) return err.detail || fallback;
  if (err instanceof Error) return err.message;
  return fallback;
}

type ProfileFormValues = {
  username: string;
  name: string;
  email: string;
  title: string;
};

type ProfileSectionProps = {
  user: MeResponse;
  refreshMe: () => Promise<MeResponse>;
  usernameMin: number;
  usernameMax: number;
};

function ProfileSection({
  user,
  refreshMe,
  usernameMin,
  usernameMax,
}: ProfileSectionProps) {
  const { t } = useTranslation();
  const client = useGridoneClient();

  const schema = useMemo(
    () =>
      z.object({
        username: z
          .string()
          .trim()
          .min(
            usernameMin,
            t("settings.validation.usernameMinLength", { count: usernameMin }),
          )
          .max(
            usernameMax,
            t("settings.validation.usernameMaxLength", { count: usernameMax }),
          ),
        name: z.string().trim(),
        email: z
          .string()
          .trim()
          .email(t("settings.validation.emailInvalid"))
          .or(z.literal("")),
        title: z.string().trim(),
      }),
    [t, usernameMin, usernameMax],
  );

  const defaultValues = useMemo<ProfileFormValues>(
    () => ({
      username: user.username,
      name: user.name,
      email: user.email,
      title: user.title,
    }),
    [user],
  );

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [form, defaultValues]);

  const handleSubmit = form.handleSubmit(async (values) => {
    form.clearErrors("root");
    try {
      await client.users.update(user.id, {
        username: values.username || undefined,
        name: values.name,
        email: values.email,
        title: values.title,
      });

      await refreshMe();
      toast.success(t("settings.saved"));
      form.reset(values);
    } catch (err) {
      const message = toErrorMessage(err, t("common.error"));
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
          <CardTitle>{t("settings.sections.profile.title")}</CardTitle>
          <CardDescription>
            {t("settings.sections.profile.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
              onClick={() => form.reset(defaultValues)}
              disabled={isSubmitting || !isDirty}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

type SecurityFormValues = {
  password: string;
  confirmPassword: string;
};

type SecuritySectionProps = {
  user: MeResponse;
  refreshMe: () => Promise<MeResponse>;
  passwordMin: number;
  passwordMax: number;
};

function SecuritySection({
  user,
  refreshMe,
  passwordMin,
  passwordMax,
}: SecuritySectionProps) {
  const { t } = useTranslation();
  const client = useGridoneClient();

  const schema = useMemo(
    () =>
      z
        .object({
          password: z
            .string()
            .min(
              passwordMin,
              t("settings.validation.passwordMinLength", {
                count: passwordMin,
              }),
            )
            .max(
              passwordMax,
              t("settings.validation.passwordMaxLength", {
                count: passwordMax,
              }),
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
    [t, passwordMin, passwordMax],
  );

  const form = useForm<SecurityFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    form.clearErrors("root");
    try {
      await client.users.update(user.id, { password: values.password });

      await refreshMe();
      toast.success(t("settings.passwordUpdated"));
      form.reset({ password: "", confirmPassword: "" });
    } catch (err) {
      const message = toErrorMessage(err, t("common.error"));
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
              onClick={() => form.reset({ password: "", confirmPassword: "" })}
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

export default function SettingsPage() {
  const { t } = useTranslation();
  const { state, refreshMe } = useAuth();
  const client = useGridoneClient();

  const user = state.status === "authenticated" ? state.user : null;

  const { data: authSchema } = useQuery({
    queryKey: ["auth-schema"],
    queryFn: () => getAuthSchema(client),
    staleTime: 5 * 60 * 1000,
  });

  const usernameMin = authSchema?.properties?.username?.minLength ?? 3;
  const usernameMax = authSchema?.properties?.username?.maxLength ?? 64;
  const passwordMin = authSchema?.properties?.password?.minLength ?? 5;
  const passwordMax = authSchema?.properties?.password?.maxLength ?? 128;

  if (!user) return null;

  return (
    <section className="space-y-6">
      <ResourceHeader title={t("settings.subtitle")} />

      <ProfileSection
        user={user}
        refreshMe={refreshMe}
        usernameMin={usernameMin}
        usernameMax={usernameMax}
      />

      <SecuritySection
        user={user}
        refreshMe={refreshMe}
        passwordMin={passwordMin}
        passwordMax={passwordMax}
      />
    </section>
  );
}
