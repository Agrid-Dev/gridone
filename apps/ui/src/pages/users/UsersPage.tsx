import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Shield, X } from "lucide-react";
import { toast } from "sonner";
import { listUsers, createUser, updateUser, deleteUser } from "@/api/users";
import type { User, UserUpdatePayload } from "@/api/users";
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
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// --- Schemas ---

const userFormSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().default(""),
  name: z.string().default(""),
  email: z.string().email().or(z.literal("")).default(""),
  title: z.string().default(""),
});

type UserFormValues = z.infer<typeof userFormSchema>;

const assignmentSchema = z.object({
  roleId: z.string().min(1, "Role is required"),
  assetId: z.string().min(1, "Asset is required"),
});

type AssignmentFormValues = z.infer<typeof assignmentSchema>;

const defaultUserValues: UserFormValues = {
  username: "",
  password: "",
  name: "",
  email: "",
  title: "",
};

// --- Helpers ---

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

// --- Component ---

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

  const userForm = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: defaultUserValues,
  });

  const assignmentForm = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { roleId: "", assetId: "" },
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeDialog();
      toast.success(t("users.created"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserUpdatePayload }) =>
      updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeDialog();
      toast.success(t("users.updated"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
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
      assignmentForm.reset({ roleId: "", assetId: "" });
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

  const closeDialog = () => {
    setDialogMode(null);
    setEditingUser(null);
    userForm.reset(defaultUserValues);
    assignmentForm.reset({ roleId: "", assetId: "" });
  };

  const openCreate = () => {
    userForm.reset(defaultUserValues);
    // Switch resolver to create schema (password required)
    setEditingUser(null);
    setDialogMode("create");
  };

  const openEdit = (user: User) => {
    userForm.reset({
      username: user.username,
      password: "",
      name: user.name,
      email: user.email,
      title: user.title,
    });
    assignmentForm.reset({ roleId: "", assetId: "" });
    setEditingUser(user);
    setDialogMode("edit");
  };

  const onUserSubmit = userForm.handleSubmit((values) => {
    if (dialogMode === "create" && !values.password) {
      userForm.setError("password", { message: "Password is required" });
      return;
    }
    if (dialogMode === "create") {
      createMutation.mutate({
        username: values.username,
        password: values.password,
        name: values.name,
        email: values.email,
        title: values.title,
      });
    } else if (dialogMode === "edit" && editingUser) {
      const payload: UserUpdatePayload = {
        username: values.username || undefined,
        name: values.name,
        email: values.email,
        title: values.title,
      };
      if (values.password) {
        payload.password = values.password;
      }
      updateMutation.mutate({ id: editingUser.id, data: payload });
    }
  });

  const onAddAssignment = assignmentForm.handleSubmit((values) => {
    if (!editingUser) return;
    addAssignmentMutation.mutate({
      userId: editingUser.id,
      roleId: values.roleId,
      assetId: values.assetId,
    });
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  // Helpers
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const flatAssets = flattenTree(assetTree);
  const assetNameMap = new Map(flatAssets.map((a) => [a.id, a.name]));

  const roleOptions = roles.map((r) => ({ value: r.id, label: r.name }));
  const assetOptions = flatAssets.map((a) => ({
    value: a.id,
    label: "\u00A0".repeat(a.depth * 2) + a.name,
  }));

  function getUserAssignments(userId: string): UserRoleAssignment[] {
    return allAssignments.filter((a) => a.userId === userId);
  }

  function getUserRoleNames(userId: string): string[] {
    return getUserAssignments(userId)
      .map((a) => roleMap.get(a.roleId)?.name)
      .filter(Boolean) as string[];
  }

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
        onOpenChange={() => closeDialog()}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create" ? t("users.create") : t("users.edit")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onUserSubmit} className="space-y-4">
            <InputController
              name="username"
              control={userForm.control}
              label={t("users.fields.username")}
              required={dialogMode === "create"}
            />
            <InputController
              name="password"
              control={userForm.control}
              label={
                dialogMode === "edit"
                  ? t("users.fields.passwordOptional")
                  : t("users.fields.password")
              }
              type="password"
              required={dialogMode === "create"}
              inputProps={{
                placeholder:
                  dialogMode === "edit"
                    ? t("users.fields.passwordPlaceholder")
                    : undefined,
              }}
            />
            <InputController
              name="name"
              control={userForm.control}
              label={t("users.fields.name")}
            />
            <InputController
              name="email"
              control={userForm.control}
              label={t("users.fields.email")}
              type="email"
            />
            <InputController
              name="title"
              control={userForm.control}
              label={t("users.fields.title")}
            />

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
                    <SelectController
                      name="roleId"
                      control={assignmentForm.control}
                      options={roleOptions}
                      placeholder={t("users.assignments.selectRole")}
                    />
                    <SelectController
                      name="assetId"
                      control={assignmentForm.control}
                      options={assetOptions}
                      placeholder={t("users.assignments.selectZone")}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onAddAssignment}
                      disabled={addAssignmentMutation.isPending}
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
                onClick={() => closeDialog()}
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
