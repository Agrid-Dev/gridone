import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/api/apiError";
import {
  DEFAULT_AUTH_VALIDATION_RULES,
  getAuthValidationRules,
} from "@/api/authValidation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LoginFormValues = {
  username: string;
  password: string;
};

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();

  const { data: fetchedValidationRules } = useQuery({
    queryKey: ["auth-validation-rules"],
    queryFn: getAuthValidationRules,
    staleTime: 5 * 60 * 1000,
  });
  const validationRules =
    fetchedValidationRules ?? DEFAULT_AUTH_VALIDATION_RULES;

  const schema = useMemo(
    () =>
      z.object({
        username: z
          .string()
          .trim()
          .min(
            validationRules.usernameMinLength,
            t("auth.login.validation.usernameMinLength", {
              count: validationRules.usernameMinLength,
            }),
          )
          .max(
            validationRules.usernameMaxLength,
            t("auth.login.validation.usernameMaxLength", {
              count: validationRules.usernameMaxLength,
            }),
          ),
        password: z
          .string()
          .min(
            validationRules.passwordMinLength,
            t("auth.login.validation.passwordMinLength", {
              count: validationRules.passwordMinLength,
            }),
          )
          .max(
            validationRules.passwordMaxLength,
            t("auth.login.validation.passwordMaxLength", {
              count: validationRules.passwordMaxLength,
            }),
          ),
      }),
    [t, validationRules],
  );

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    form.clearErrors("root");
    try {
      await login(values.username, values.password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        form.setError("root", {
          message: err.detail || err.details || t("auth.login.error"),
        });
      } else {
        form.setError("root", {
          message: t("auth.login.error"),
        });
      }
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.4em] text-slate-500">
            {t("app.title")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {t("app.subtitle")}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="username"
              className="text-sm font-medium text-slate-700"
            >
              {t("auth.login.username")}
            </label>
            <Input
              id="username"
              type="text"
              autoComplete="username"
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
            <label
              htmlFor="password"
              className="text-sm font-medium text-slate-700"
            >
              {t("auth.login.password")}
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...form.register("password")}
              disabled={form.formState.isSubmitting}
            />
            {form.formState.errors.password && (
              <p className="text-sm text-red-600">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          {form.formState.errors.root?.message && (
            <p className="text-sm text-red-600">
              {form.formState.errors.root.message}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting
              ? t("auth.login.signingIn")
              : t("auth.login.signIn")}
          </Button>
        </form>
      </div>
    </div>
  );
}
