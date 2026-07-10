import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { TriangleAlert } from "lucide-react";
import { isGridoneError, NetworkError } from "@gridone/sdk";
import { useAuth } from "@/contexts/AuthContext";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { getAuthSchema } from "@/lib/authSchema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LoginFormValues = {
  username: string;
  password: string;
};

// Minimal client-side validation used when the backend auth schema can't be
// fetched (server unreachable). The server stays the source of truth — this
// only keeps the form usable so the user can attempt to sign in once the
// backend is back, instead of being stuck behind a permanently-disabled button.
const FALLBACK_SCHEMA = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const client = useGridoneClient();
  const navigate = useNavigate();

  const {
    data: authSchema,
    isLoading: isSchemaLoading,
    isError: isSchemaError,
    isFetching: isSchemaFetching,
    refetch: refetchSchema,
  } = useQuery({
    queryKey: ["auth-schema"],
    queryFn: () => getAuthSchema(client),
    staleTime: 5 * 60 * 1000,
  });

  const schema = useMemo(() => {
    if (!authSchema) return FALLBACK_SCHEMA;
    return z.fromJSONSchema(authSchema) as z.ZodObject<{
      username: z.ZodString;
      password: z.ZodString;
    }>;
  }, [authSchema]);

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
      if (isGridoneError(err) && !(err instanceof NetworkError)) {
        form.setError("root", {
          message: err.detail || t("auth.login.error"),
        });
      } else {
        // A NetworkError means the request never completed (transport/network
        // failure): the backend is unreachable, not a credentials problem.
        form.setError("root", {
          message: t("auth.login.unreachable"),
        });
      }
    }
  });

  return (
    <div className="login-bg flex min-h-screen items-center justify-center">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/4 top-1/3 h-96 w-96 rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 h-64 w-64 rounded-full bg-primary/[0.02] blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-up">
        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-8 shadow-lg backdrop-blur-sm">
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
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2"
              >
                <p className="text-sm text-destructive">
                  {form.formState.errors.root.message}
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="h-11 w-full font-display font-semibold tracking-wide"
              disabled={form.formState.isSubmitting || isSchemaLoading}
            >
              {form.formState.isSubmitting
                ? t("auth.login.signingIn")
                : isSchemaLoading
                  ? t("common.loading")
                  : t("auth.login.signIn")}
            </Button>

            {isSchemaError && (
              <div
                role="status"
                className="space-y-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-3"
              >
                <div className="flex items-center gap-2 text-[hsl(var(--warning))]">
                  <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                  <p className="text-sm font-medium">
                    {t("auth.login.unreachableTitle")}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("auth.login.unreachable")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => refetchSchema()}
                  disabled={isSchemaFetching}
                >
                  {isSchemaFetching
                    ? t("common.loading")
                    : t("auth.login.retry")}
                </Button>
              </div>
            )}
          </form>
        </div>

        {/* Subtle footer */}
        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground/40">
          {t("app.description")}
        </p>
      </div>
    </div>
  );
}
