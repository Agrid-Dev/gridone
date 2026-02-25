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
import { Input } from "@/components/ui/input";

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

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("settings.subtitle")}
        resourceName={t("settings.title")}
      />

      <div className="rounded-lg border border-slate-200 bg-white p-6 max-w-lg">
        {user.mustChangePassword && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {t("settings.mustChangePassword")}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              {t("users.fields.username")}
            </label>
            <Input
              {...form.register("username")}
              disabled={form.formState.isSubmitting}
            />
            {form.formState.errors.username && (
              <p className="text-sm text-red-600">
                {form.formState.errors.username.message}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              {t("users.fields.name")}
            </label>
            <Input
              {...form.register("name")}
              disabled={form.formState.isSubmitting}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              {t("users.fields.email")}
            </label>
            <Input
              type="email"
              {...form.register("email")}
              disabled={form.formState.isSubmitting}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-red-600">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              {t("users.fields.title")}
            </label>
            <Input
              {...form.register("title")}
              disabled={form.formState.isSubmitting}
            />
          </div>

          <hr className="border-slate-200" />

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              {t("settings.newPassword")}
            </label>
            <Input
              type="password"
              {...form.register("password")}
              disabled={form.formState.isSubmitting}
              placeholder={t("settings.newPasswordPlaceholder")}
            />
            {form.formState.errors.password && (
              <p className="text-sm text-red-600">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              {t("settings.confirmPassword")}
            </label>
            <Input
              type="password"
              {...form.register("confirmPassword")}
              disabled={form.formState.isSubmitting}
              placeholder={t("settings.confirmPasswordPlaceholder")}
            />
            {form.formState.errors.confirmPassword && (
              <p className="text-sm text-red-600">
                {form.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          {form.formState.errors.root?.message && (
            <p className="text-sm text-red-600">
              {form.formState.errors.root.message}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? t("common.saving")
                : t("common.save")}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
