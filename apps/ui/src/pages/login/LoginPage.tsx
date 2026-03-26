import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/api/apiError";
import { getAuthSchema } from "@/api/authValidation";
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

  const { data: authSchema, isLoading: isSchemaLoading } = useQuery({
    queryKey: ["auth-schema"],
    queryFn: getAuthSchema,
    staleTime: 5 * 60 * 1000,
  });

  const schema = useMemo(() => {
    if (!authSchema) return null;
    return z.fromJSONSchema(authSchema) as z.ZodObject<{
      username: z.ZodString;
      password: z.ZodString;
    }>;
  }, [authSchema]);

  const form = useForm<LoginFormValues>({
    resolver: schema ? zodResolver(schema) : undefined,
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
    <div className="login-bg bg-grid flex min-h-screen items-center justify-center">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/4 top-1/3 h-96 w-96 rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 h-64 w-64 rounded-full bg-primary/[0.02] blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-up">
        {/* Card */}
        <div className="rounded-xl border border-border/60 bg-card/80 p-8 shadow-2xl shadow-black/20 backdrop-blur-sm">
          {/* Brand */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
              <span className="font-display text-xl font-bold text-primary">
                G
              </span>
            </div>
            <p className="font-display text-[10px] font-medium uppercase tracking-[0.4em] text-muted-foreground">
              {t("app.title")}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-foreground">
              {t("app.subtitle")}
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                {t("auth.login.username")}
              </label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                className="h-11 bg-background/50"
                {...form.register("username")}
                disabled={form.formState.isSubmitting}
              />
              {form.formState.errors.username && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.username.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                {t("auth.login.password")}
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                className="h-11 bg-background/50"
                {...form.register("password")}
                disabled={form.formState.isSubmitting}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            {form.formState.errors.root?.message && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                <p className="text-sm text-destructive">
                  {form.formState.errors.root.message}
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="h-11 w-full font-display font-semibold tracking-wide"
              disabled={
                form.formState.isSubmitting || isSchemaLoading || !schema
              }
            >
              {form.formState.isSubmitting
                ? t("auth.login.signingIn")
                : isSchemaLoading
                  ? t("common.loading")
                  : t("auth.login.signIn")}
            </Button>
          </form>
        </div>

        {/* Subtle footer */}
        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground/40">
          Building Management System
        </p>
      </div>
    </div>
  );
}
