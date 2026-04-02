import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Ban, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  blockUser,
  unblockUser,
} from "@/api/users";
import type { User, UserCreatePayload, UserUpdatePayload } from "@/api/users";
import type { UserRole } from "@/api/auth";
import { useAuth } from "@/contexts/AuthContext";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmButton } from "@/components/ConfirmButton";
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
  role: UserRole;
  name: string;
  email: string;
  title: string;
};

const emptyForm: UserFormData = {
  username: "",
  password: "",
  role: "operator",
  name: "",
  email: "",
  title: "",
};

function getUserInitials(name: string, username: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}

export default function UsersPage() {
  const { t } = useTranslation("users");
  const queryClient = useQueryClient();
  const { state } = useAuth();
  const currentUserId = state.status === "authenticated" ? state.user.id : null;

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
      toast.success(t("created"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserUpdatePayload }) =>
      updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDialogMode(null);
      toast.success(t("updated"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("deleted"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const blockMutation = useMutation({
    mutationFn: (id: string) => blockUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("blocked"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const unblockMutation = useMutation({
    mutationFn: (id: string) => unblockUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("unblocked"));
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
      role: user.role,
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
        role: form.role,
        name: form.name,
        email: form.email,
        title: form.title,
      });
    } else if (dialogMode === "edit" && editingUser) {
      const payload: UserUpdatePayload = {
        username: form.username || undefined,
        role: form.role,
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
        title={t("subtitle")}
        resourceName={t("title")}
        actions={
          <Button onClick={openCreate}>
            <Plus />
            {t("create")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {users.map((user) => (
            <Card key={user.id}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-sm font-medium text-primary">
                    {getUserInitials(user.name, user.username)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {user.name || user.username}
                      </p>
                      {user.id === currentUserId && (
                        <span className="text-xs text-muted-foreground">
                          ({t("you")})
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {user.username}
                    </p>
                    {user.email && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    )}
                    <div className="mt-2 flex gap-1.5">
                      <Badge variant="secondary">
                        {t(`users:roles.${user.role}`)}
                      </Badge>
                      {user.isBlocked && (
                        <Badge variant="destructive">{t("blockedBadge")}</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(user)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {user.id !== currentUserId && !user.isBlocked && (
                    <ConfirmButton
                      variant="outline"
                      size="sm"
                      onConfirm={() => blockMutation.mutate(user.id)}
                      confirmTitle={t("blockConfirmTitle")}
                      confirmDetails={t("blockConfirmDetails", {
                        name: user.name || user.username,
                      })}
                      icon={<Ban />}
                      disabled={blockMutation.isPending}
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </ConfirmButton>
                  )}
                  {user.id !== currentUserId && user.isBlocked && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => unblockMutation.mutate(user.id)}
                      disabled={unblockMutation.isPending}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {user.id !== currentUserId && (
                    <ConfirmButton
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onConfirm={() => deleteMutation.mutate(user.id)}
                      confirmTitle={t("deleteConfirmTitle")}
                      confirmDetails={t("deleteConfirmDetails", {
                        name: user.name || user.username,
                      })}
                      icon={<Trash2 />}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </ConfirmButton>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={dialogMode !== null}
        onOpenChange={() => setDialogMode(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create" ? t("create") : t("edit")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">
                {t("fields.username")}
              </label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required={dialogMode === "create"}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">
                {dialogMode === "edit"
                  ? t("fields.passwordOptional")
                  : t("fields.password")}
              </label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={dialogMode === "create"}
                placeholder={
                  dialogMode === "edit"
                    ? t("fields.passwordPlaceholder")
                    : undefined
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">
                {t("fields.name")}
              </label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">
                {t("fields.email")}
              </label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">
                {t("fields.title")}
              </label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">
                {t("fields.role")}
              </label>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as UserRole })
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="admin">{t("roles.admin")}</option>
                <option value="operator">{t("roles.operator")}</option>
                <option value="viewer">{t("roles.viewer")}</option>
              </select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogMode(null)}
              >
                {t("common:common.cancel")}
              </Button>
              <Button type="submit" disabled={isBusy}>
                {dialogMode === "create"
                  ? t("common:common.create")
                  : t("common:common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
