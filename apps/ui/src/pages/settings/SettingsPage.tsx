import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { type MeResponse } from "@gridone/sdk";
import { useAuth } from "@/contexts/AuthContext";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { useAuthSchemaBounds } from "@/hooks/useAuthSchemaBounds";
import { serverErrorMessage } from "@/lib/serverErrorMessage";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InputController } from "@/components/forms/controllers/InputController";
import { PasswordChangeCard } from "./PasswordChangeCard";

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

export default function SettingsPage() {
  const { t } = useTranslation();
  const { state, refreshMe } = useAuth();
  const { username: usernameBounds } = useAuthSchemaBounds();

  const user = state.status === "authenticated" ? state.user : null;

  if (!user) return null;

  return (
    <section className="space-y-6">
      <ResourceHeader title={t("settings.subtitle")} />

      <ProfileSection
        user={user}
        refreshMe={refreshMe}
        usernameMin={usernameBounds.min}
        usernameMax={usernameBounds.max}
      />

      <PasswordChangeCard user={user} refreshMe={refreshMe} />
    </section>
  );
}
