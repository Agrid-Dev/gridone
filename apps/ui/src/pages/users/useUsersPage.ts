import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Role,
  User,
  UserCreateRequest,
  UserUpdateRequest,
} from "@gridone/sdk";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { getUserRole, ROLES } from "./userPresentation";

const emptyForm = {
  username: "",
  password: "",
  role: "operator" as const,
  name: "",
  email: "",
  title: "",
};

export type UserFormData = {
  username: string;
  password: string;
  role: Role;
  name: string;
  email: string;
  title: string;
};

export type UserFilter = "all" | Role;

export type PendingAction = {
  kind: "block" | "delete";
  user: User;
};

export function useUsersPage() {
  const { t } = useTranslation("users");
  const queryClient = useQueryClient();
  const client = useGridoneClient();
  const { state } = useAuth();
  const can = usePermissions();
  const canWrite = can("users:write");
  const currentUserId = state.status === "authenticated" ? state.user.id : null;

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => client.users.list() as Promise<User[]>,
  });

  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserFilter>("all");

  const formSchema = useMemo(
    () =>
      z
        .object({
          username: z.string().trim().min(1, t("validation.usernameRequired")),
          password: z.string(),
          role: z.enum(["admin", "operator", "viewer"]),
          name: z.string(),
          email: z
            .string()
            .refine(
              (value) => value === "" || z.email().safeParse(value).success,
              t("validation.emailInvalid"),
            ),
          title: z.string(),
        })
        .superRefine((values, context) => {
          if (dialogMode === "create" && values.password.length === 0) {
            context.addIssue({
              code: "custom",
              path: ["password"],
              message: t("validation.passwordRequired"),
            });
          }
        }),
    [dialogMode, t],
  );

  const form = useForm<UserFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyForm,
  });

  const closeDialog = () => {
    setDialogMode(null);
    setEditingUser(null);
    form.reset(emptyForm);
  };

  const createMutation = useMutation({
    mutationFn: (data: UserCreateRequest) => client.users.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeDialog();
      toast.success(t("created"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserUpdateRequest }) =>
      client.users.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeDialog();
      toast.success(t("updated"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => client.users.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("deleted"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const blockMutation = useMutation({
    mutationFn: (id: string) => client.users.block(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("blocked"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unblockMutation = useMutation({
    mutationFn: (id: string) => client.users.unblock(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("unblocked"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const roleCounts = useMemo(
    () =>
      Object.fromEntries(
        ROLES.map((role) => [
          role,
          users.filter((user) => getUserRole(user) === role).length,
        ]),
      ) as Record<Role, number>,
    [users],
  );

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return users.filter((user) => {
      if (roleFilter !== "all" && getUserRole(user) !== roleFilter) {
        return false;
      }
      if (!normalizedQuery) return true;
      return [user.name, user.username, user.email, user.title]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [query, roleFilter, users]);

  const openCreate = () => {
    setEditingUser(null);
    form.reset(emptyForm);
    setDialogMode("create");
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    form.reset({
      username: user.username,
      password: "",
      role: getUserRole(user),
      name: user.name ?? "",
      email: user.email ?? "",
      title: user.title ?? "",
    });
    setDialogMode("edit");
  };

  const handleSubmit = form.handleSubmit((values) => {
    if (dialogMode === "create") {
      createMutation.mutate(values);
      return;
    }

    if (dialogMode === "edit" && editingUser) {
      const payload: UserUpdateRequest = {
        username: values.username,
        role: values.role,
        name: values.name,
        email: values.email,
        title: values.title,
      };
      if (values.password) payload.password = values.password;
      updateMutation.mutate({ id: editingUser.id, data: payload });
    }
  });

  const confirmPendingAction = () => {
    if (!pendingAction) return;
    if (pendingAction.kind === "block") {
      blockMutation.mutate(pendingAction.user.id);
    } else {
      deleteMutation.mutate(pendingAction.user.id);
    }
    setPendingAction(null);
  };

  const activeCount = users.filter((user) => !user.is_blocked).length;

  return {
    activeCount,
    blockedCount: users.length - activeCount,
    canWrite,
    closeDialog,
    confirmPendingAction,
    currentUserId,
    dialogMode,
    filteredUsers,
    form,
    handleSubmit,
    isBusy: createMutation.isPending || updateMutation.isPending,
    isLoading,
    isUnblocking: unblockMutation.isPending,
    openCreate,
    openEdit,
    passwordChangeCount: users.filter(
      (user) => !user.is_blocked && user.must_change_password,
    ).length,
    pendingAction,
    query,
    roleCounts,
    roleFilter,
    setPendingAction,
    setQuery,
    setRoleFilter,
    unblockUser: (id: string) => unblockMutation.mutate(id),
    users,
  };
}
