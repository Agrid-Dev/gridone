import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listUsers, createUser, updateUser, deleteUser } from "@/api/users";
import type { User, UserCreatePayload, UserUpdatePayload } from "@/api/users";
import { useAuth } from "@/contexts/AuthContext";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type UserFormData = {
  username: string;
  password: string;
  isAdmin: boolean;
  name: string;
  email: string;
  title: string;
};

const emptyForm: UserFormData = {
  username: "",
  password: "",
  isAdmin: false,
  name: "",
  email: "",
  title: "",
};

export default function UsersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { state } = useAuth();
  const currentUserId =
    state.status === "authenticated" ? state.user.id : null;

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
  });

  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);

  const createMutation = useMutation({
    mutationFn: (data: UserCreatePayload) => createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDialogMode(null);
      toast.success(t("users.created"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserUpdatePayload }) =>
      updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDialogMode(null);
      toast.success(t("users.updated"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("users.deleted"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openCreate = () => {
    setForm(emptyForm);
    setEditingUser(null);
    setDialogMode("create");
  };

  const openEdit = (user: User) => {
    setForm({
      username: user.username,
      password: "",
      isAdmin: user.isAdmin,
      name: user.name,
      email: user.email,
      title: user.title,
    });
    setEditingUser(user);
    setDialogMode("edit");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dialogMode === "create") {
      createMutation.mutate({
        username: form.username,
        password: form.password,
        isAdmin: form.isAdmin,
        name: form.name,
        email: form.email,
        title: form.title,
      });
    } else if (dialogMode === "edit" && editingUser) {
      const payload: UserUpdatePayload = {
        username: form.username || undefined,
        isAdmin: form.isAdmin,
        name: form.name,
        email: form.email,
        title: form.title,
      };
      if (form.password) {
        payload.password = form.password;
      }
      updateMutation.mutate({ id: editingUser.id, data: payload });
    }
  };

  const isBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("users.subtitle")}
        resourceName={t("users.title")}
        actions={
          <Button onClick={openCreate}>
            <Plus />
            {t("users.create")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  {t("users.fields.username")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  {t("users.fields.name")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  {t("users.fields.email")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  {t("users.fields.role")}
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {user.username}
                    {user.id === currentUserId && (
                      <span className="ml-2 text-xs text-slate-400">
                        ({t("users.you")})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{user.name}</td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {user.isAdmin ? t("users.roles.admin") : t("users.roles.user")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(user)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {user.id !== currentUserId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:border-red-200"
                          onClick={() => deleteMutation.mutate(user.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogMode !== null} onOpenChange={() => setDialogMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create" ? t("users.create") : t("users.edit")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                {t("users.fields.username")}
              </label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required={dialogMode === "create"}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                {dialogMode === "edit"
                  ? t("users.fields.passwordOptional")
                  : t("users.fields.password")}
              </label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={dialogMode === "create"}
                placeholder={
                  dialogMode === "edit" ? t("users.fields.passwordPlaceholder") : undefined
                }
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
            <div className="flex items-center gap-2">
              <input
                id="isAdmin"
                type="checkbox"
                checked={form.isAdmin}
                onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              <label htmlFor="isAdmin" className="text-sm text-slate-700">
                {t("users.fields.isAdmin")}
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogMode(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isBusy}>
                {dialogMode === "create" ? t("common.create") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
