import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Shield, X } from "lucide-react";
import { toast } from "sonner";
import { listUsers, createUser, updateUser, deleteUser } from "@/api/users";
import type { User, UserCreatePayload, UserUpdatePayload } from "@/api/users";
import {
  listRoles,
  listAssignments,
  createAssignment,
  deleteAssignment,
} from "@/api/roles";
import type { UserRoleAssignment } from "@/api/roles";
import { getAssetTree } from "@/api/assets";
import type { AssetTreeNode } from "@/api/assets";
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
  name: string;
  email: string;
  title: string;
};

const emptyForm: UserFormData = {
  username: "",
  password: "",
  name: "",
  email: "",
  title: "",
};

type FlatAssetOption = { id: string; name: string; depth: number };

function flattenTree(
  nodes: AssetTreeNode[],
  depth = 0,
): FlatAssetOption[] {
  const result: FlatAssetOption[] = [];
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, depth });
    if (node.children?.length) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

export default function UsersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { state } = useAuth();
  const currentUserId = state.status === "authenticated" ? state.user.id : null;

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: listRoles,
  });

  const { data: allAssignments = [] } = useQuery({
    queryKey: ["assignments"],
    queryFn: () => listAssignments(),
  });

  const { data: assetTree = [] } = useQuery({
    queryKey: ["assets", "tree"],
    queryFn: getAssetTree,
  });

  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);

  // For adding a new role assignment in the edit dialog
  const [newRoleId, setNewRoleId] = useState("");
  const [newAssetId, setNewAssetId] = useState("");

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

  const addAssignmentMutation = useMutation({
    mutationFn: createAssignment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setNewRoleId("");
      setNewAssetId("");
      toast.success(t("users.assignments.added"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: deleteAssignment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("users.assignments.removed"));
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
      name: user.name,
      email: user.email,
      title: user.title,
    });
    setEditingUser(user);
    setNewRoleId("");
    setNewAssetId("");
    setDialogMode("edit");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dialogMode === "create") {
      createMutation.mutate({
        username: form.username,
        password: form.password,
        name: form.name,
        email: form.email,
        title: form.title,
      });
    } else if (dialogMode === "edit" && editingUser) {
      const payload: UserUpdatePayload = {
        username: form.username || undefined,
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

  const handleAddAssignment = () => {
    if (!editingUser || !newRoleId || !newAssetId) return;
    addAssignmentMutation.mutate({
      userId: editingUser.id,
      roleId: newRoleId,
      assetId: newAssetId,
    });
  };

  const isBusy = createMutation.isPending || updateMutation.isPending;

  // Helpers
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const flatAssets = flattenTree(assetTree);
  const assetNameMap = new Map(flatAssets.map((a) => [a.id, a.name]));

  function getUserAssignments(userId: string): UserRoleAssignment[] {
    return allAssignments.filter((a) => a.userId === userId);
  }

  function getUserRoleNames(userId: string): string[] {
    return getUserAssignments(userId)
      .map((a) => roleMap.get(a.roleId)?.name)
      .filter(Boolean) as string[];
  }

  // Roles available for assigning
  const editingUserAssignments = editingUser
    ? getUserAssignments(editingUser.id)
    : [];

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
                  {t("users.fields.roles")}
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
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {getUserRoleNames(user.id).map((roleName) => (
                        <span
                          key={roleName}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                        >
                          <Shield className="h-3 w-3" />
                          {roleName}
                        </span>
                      ))}
                      {getUserRoleNames(user.id).length === 0 && (
                        <span className="text-xs text-slate-400">
                          {t("users.assignments.none")}
                        </span>
                      )}
                    </div>
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

      <Dialog
        open={dialogMode !== null}
        onOpenChange={() => setDialogMode(null)}
      >
        <DialogContent className="max-w-lg">
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
                  dialogMode === "edit"
                    ? t("users.fields.passwordPlaceholder")
                    : undefined
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

            {/* Role assignments — only in edit mode */}
            {dialogMode === "edit" && editingUser && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  {t("users.fields.roles")}
                </label>
                <div className="rounded-md border border-slate-200 p-3 space-y-2">
                  {editingUserAssignments.length === 0 && (
                    <p className="text-xs text-slate-400">
                      {t("users.assignments.none")}
                    </p>
                  )}
                  {editingUserAssignments.map((assignment) => {
                    const role = roleMap.get(assignment.roleId);
                    const assetName = assetNameMap.get(assignment.assetId);
                    return (
                      <div
                        key={assignment.id}
                        className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <Shield className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-medium text-slate-700">
                            {role?.name ?? assignment.roleId}
                          </span>
                          <span className="text-xs text-slate-400">
                            {assetName ?? assignment.assetId}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            removeAssignmentMutation.mutate(assignment.id)
                          }
                          disabled={removeAssignmentMutation.isPending}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  {/* Add assignment */}
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={newRoleId}
                      onChange={(e) => setNewRoleId(e.target.value)}
                      className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
                    >
                      <option value="">
                        {t("users.assignments.selectRole")}
                      </option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newAssetId}
                      onChange={(e) => setNewAssetId(e.target.value)}
                      className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
                    >
                      <option value="">
                        {t("users.assignments.selectZone")}
                      </option>
                      {flatAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {"  ".repeat(asset.depth) + asset.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleAddAssignment}
                      disabled={
                        !newRoleId ||
                        !newAssetId ||
                        addAssignmentMutation.isPending
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogMode(null)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isBusy}>
                {dialogMode === "create"
                  ? t("common.create")
                  : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
