import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { updateUser } from "@/api/users";
import { getMe } from "@/api/auth";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ProfileForm = {
  username: string;
  name: string;
  email: string;
  title: string;
  password: string;
  confirmPassword: string;
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const { state } = useAuth();

  const user = state.status === "authenticated" ? state.user : null;

  const [form, setForm] = useState<ProfileForm>({
    username: "",
    name: "",
    email: "",
    title: "",
    password: "",
    confirmPassword: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        username: user.username,
        name: user.name,
        email: user.email,
        title: user.title,
      }));
    }
  }, [user]);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password && form.password !== form.confirmPassword) {
      toast.error(t("settings.passwordMismatch"));
      return;
    }
    setSaving(true);
    try {
      await updateUser(user.id, {
        username: form.username || undefined,
        name: form.name,
        email: form.email,
        title: form.title,
        ...(form.password ? { password: form.password } : {}),
      });
      // Refresh user info in auth context by re-fetching /me
      await getMe();
      toast.success(t("settings.saved"));
      setForm((f) => ({ ...f, password: "", confirmPassword: "" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  };

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
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              {t("users.fields.name")}
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              {t("users.fields.email")}
            </label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              {t("users.fields.title")}
            </label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <hr className="border-slate-200" />

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              {t("settings.newPassword")}
            </label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={t("settings.newPasswordPlaceholder")}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              {t("settings.confirmPassword")}
            </label>
            <Input
              type="password"
              value={form.confirmPassword}
              onChange={(e) =>
                setForm({ ...form, confirmPassword: e.target.value })
              }
              placeholder={t("settings.confirmPasswordPlaceholder")}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
