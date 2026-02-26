import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Shield, Eye } from "lucide-react";
import { toast } from "sonner";
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listPermissions,
} from "@/api/roles";
import type { Role, RoleCreate, RoleUpdate } from "@/api/roles";
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

type RoleFormData = {
  name: string;
  description: string;
  permissions: string[];
};

const emptyForm: RoleFormData = {
  name: "",
  description: "",
  permissions: [],
};

// Group permissions by resource prefix for the UI
function groupPermissions(perms: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const p of perms) {
    const [resource] = p.split(":");
    if (!groups[resource]) groups[resource] = [];
    groups[resource].push(p);
  }
  return groups;
}

export default function RolesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: listRoles,
  });

  const { data: allPermissions = [] } = useQuery({
    queryKey: ["permissions"],
    queryFn: listPermissions,
  });

  const [dialogMode, setDialogMode] = useState<
    "create" | "edit" | "view" | null
  >(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [form, setForm] = useState<RoleFormData>(emptyForm);

  const createMutation = useMutation({
    mutationFn: (data: RoleCreate) => createRole(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      setDialogMode(null);
      toast.success(t("roles.created"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RoleUpdate }) =>
      updateRole(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      setDialogMode(null);
      toast.success(t("roles.updated"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success(t("roles.deleted"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openCreate = () => {
    setForm(emptyForm);
    setEditingRole(null);
    setDialogMode("create");
  };

  const openEdit = (role: Role) => {
    setForm({
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
    });
    setEditingRole(role);
    setDialogMode("edit");
  };

  const openView = (role: Role) => {
    setForm({
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
    });
    setEditingRole(role);
    setDialogMode("view");
  };

  const togglePermission = (perm: string) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dialogMode === "create") {
      createMutation.mutate({
        name: form.name,
        description: form.description,
        permissions: form.permissions,
      });
    } else if (dialogMode === "edit" && editingRole) {
      updateMutation.mutate({
        id: editingRole.id,
        data: {
          name: form.name,
          description: form.description,
          permissions: form.permissions,
        },
      });
    }
  };

  const isBusy = createMutation.isPending || updateMutation.isPending;
  const grouped = groupPermissions(allPermissions);

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("roles.subtitle")}
        resourceName={t("roles.title")}
        actions={
          <Button onClick={openCreate}>
            <Plus />
            {t("roles.create")}
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
                  {t("roles.fields.name")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  {t("roles.fields.description")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  {t("roles.fields.permissions")}
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  {t("roles.fields.type")}
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roles.map((role) => (
                <tr key={role.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-slate-400" />
                      {role.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {role.description}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {role.permissions.length}
                  </td>
                  <td className="px-4 py-3">
                    {role.isSystem ? (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {t("roles.system")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {t("roles.custom")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {role.isSystem ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openView(role)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(role)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 hover:border-red-200"
                            onClick={() => deleteMutation.mutate(role.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
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
              {dialogMode === "create"
                ? t("roles.create")
                : dialogMode === "view"
                  ? editingRole?.name ?? ""
                  : t("roles.edit")}
            </DialogTitle>
          </DialogHeader>
          {dialogMode === "view" ? (
            <div className="space-y-4">
              {editingRole?.description && (
                <p className="text-sm text-slate-600">
                  {editingRole.description}
                </p>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  {t("roles.fields.permissions")}
                </label>
                <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200 p-3 space-y-3">
                  {Object.entries(grouped).map(([resource, perms]) => (
                    <div key={resource}>
                      <p className="text-xs font-semibold uppercase text-slate-400 mb-1">
                        {resource}
                      </p>
                      <div className="space-y-1">
                        {perms.map((perm) => (
                          <label
                            key={perm}
                            className="flex items-center gap-2 text-sm text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={form.permissions.includes(perm)}
                              disabled
                              className="h-4 w-4 rounded border-slate-300"
                            />
                            {t(`permissions.${perm}`, perm)}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogMode(null)}
                >
                  {t("common.close")}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                  {t("roles.fields.name")}
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                  {t("roles.fields.description")}
                </label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  {t("roles.fields.permissions")}
                </label>
                <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200 p-3 space-y-3">
                  {Object.entries(grouped).map(([resource, perms]) => (
                    <div key={resource}>
                      <p className="text-xs font-semibold uppercase text-slate-400 mb-1">
                        {resource}
                      </p>
                      <div className="space-y-1">
                        {perms.map((perm) => (
                          <label
                            key={perm}
                            className="flex items-center gap-2 text-sm text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={form.permissions.includes(perm)}
                              onChange={() => togglePermission(perm)}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                            {t(`permissions.${perm}`, perm)}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
