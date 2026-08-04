import type { Role, User } from "@gridone/sdk";
import type { LucideIcon } from "lucide-react";
import {
  Ban,
  CheckCircle2,
  CircleUserRound,
  Ellipsis,
  Eye,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ResourceHeader } from "@/components/ResourceHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getUserInitials, getUserRole, ROLES } from "./userPresentation";
import { useUsersPage, type UserFilter } from "./useUsersPage";

const ROLE_PRESENTATION: Record<
  Role,
  { icon: LucideIcon; badgeClassName: string }
> = {
  admin: {
    icon: ShieldCheck,
    badgeClassName: "bg-status-info/10 text-status-info",
  },
  operator: {
    icon: Wrench,
    badgeClassName: "bg-muted text-muted-foreground",
  },
  viewer: {
    icon: Eye,
    badgeClassName: "bg-muted text-muted-foreground",
  },
};

function RoleBadge({ role }: { role: Role }) {
  const { t } = useTranslation("users");
  const presentation = ROLE_PRESENTATION[role];
  const Icon = presentation.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        presentation.badgeClassName,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {t(`roles.${role}`)}
    </span>
  );
}

function UserStatus({ user }: { user: User }) {
  const { t } = useTranslation("users");

  if (user.is_blocked) {
    return (
      <span className="inline-flex items-center gap-2 text-sm font-medium text-status-error">
        <span className="h-2 w-2 rounded-full bg-status-error" />
        {t("statuses.blocked")}
      </span>
    );
  }

  if (user.must_change_password) {
    return (
      <span className="inline-flex items-center gap-2 text-sm font-medium text-status-warning">
        <span className="h-2 w-2 rounded-full bg-status-warning" />
        {t("statuses.passwordChangeRequired")}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-status-ok">
      <span className="h-2 w-2 rounded-full bg-status-ok" />
      {t("statuses.active")}
    </span>
  );
}

function UsersLoadingState() {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Skeleton className="h-[34rem] rounded-xl" />
      <div className="space-y-6">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { t } = useTranslation(["users", "common"]);
  const {
    activeCount,
    blockedCount,
    canWrite,
    closeDialog,
    confirmPendingAction,
    currentUserId,
    dialogMode,
    filteredUsers,
    form,
    handleSubmit,
    isBusy,
    isLoading,
    isUnblocking,
    openCreate,
    openEdit,
    passwordChangeCount,
    pendingAction,
    query,
    roleCounts,
    roleFilter,
    setPendingAction,
    setQuery,
    setRoleFilter,
    unblockUser,
    users,
  } = useUsersPage();

  const filters: Array<{ value: UserFilter; label: string; count: number }> = [
    { value: "all", label: t("filters.all"), count: users.length },
    ...ROLES.map((role) => ({
      value: role,
      label: t(`roles.${role}`),
      count: roleCounts[role],
    })),
  ];

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("title")}
        caption={<span className="text-base">{t("subtitle")}</span>}
        actions={
          canWrite ? (
            <Button onClick={openCreate} className="shadow-sm">
              <UserPlus />
              {t("create")}
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <UsersLoadingState />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card className="overflow-hidden rounded-xl">
            <div className="flex flex-col gap-3 border-b p-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <div className="relative w-full lg:max-w-sm">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchPlaceholder")}
                  className="h-11 bg-muted/40 pl-10 shadow-none"
                />
              </div>

              <div
                className="flex max-w-full gap-2 overflow-x-auto pb-1 lg:pb-0"
                aria-label={t("filters.label")}
              >
                {filters.map((filter) => (
                  <Button
                    key={filter.value}
                    type="button"
                    size="sm"
                    variant={
                      roleFilter === filter.value ? "default" : "outline"
                    }
                    aria-pressed={roleFilter === filter.value}
                    onClick={() => setRoleFilter(filter.value)}
                    className="rounded-full px-3.5"
                  >
                    {filter.label} · {filter.count}
                  </Button>
                ))}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-52 pl-6 text-[11px] font-semibold uppercase tracking-wider">
                    {t("columns.user")}
                  </TableHead>
                  <TableHead className="min-w-32 text-[11px] font-semibold uppercase tracking-wider">
                    {t("columns.role")}
                  </TableHead>
                  <TableHead className="min-w-32 text-[11px] font-semibold uppercase tracking-wider">
                    {t("columns.title")}
                  </TableHead>
                  <TableHead className="min-w-40 text-[11px] font-semibold uppercase tracking-wider">
                    {t("columns.status")}
                  </TableHead>
                  {canWrite && (
                    <TableHead className="w-16 pr-5 text-right">
                      <span className="sr-only">{t("columns.actions")}</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => {
                    const isCurrentUser = user.id === currentUserId;
                    return (
                      <TableRow
                        key={user.id}
                        className={cn(
                          "h-[5.25rem] hover:bg-accent/30",
                          isCurrentUser && "bg-accent/40",
                        )}
                      >
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-3.5">
                            <span
                              className={cn(
                                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                                isCurrentUser
                                  ? "bg-primary text-primary-foreground"
                                  : user.is_blocked
                                    ? "bg-muted text-muted-foreground"
                                    : "bg-foreground text-background",
                              )}
                            >
                              {getUserInitials(user.name ?? "", user.username)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground">
                                {user.name || user.username}
                                {isCurrentUser && (
                                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                    ({t("you")})
                                  </span>
                                )}
                              </p>
                              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                                {user.email || user.username}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <RoleBadge role={getUserRole(user)} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {user.title || t("notProvided")}
                        </TableCell>
                        <TableCell>
                          <UserStatus user={user} />
                        </TableCell>
                        {canWrite && (
                          <TableCell className="pr-5 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={t("actions.open", {
                                    name: user.name || user.username,
                                  })}
                                  className="h-9 w-9 text-muted-foreground"
                                >
                                  <Ellipsis />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem
                                  onSelect={() => openEdit(user)}
                                >
                                  <Pencil />
                                  {t("edit")}
                                </DropdownMenuItem>
                                {!isCurrentUser && (
                                  <>
                                    {user.is_blocked ? (
                                      <DropdownMenuItem
                                        disabled={isUnblocking}
                                        onSelect={() => unblockUser(user.id)}
                                      >
                                        <CheckCircle2 />
                                        {t("actions.unblock")}
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        onSelect={() =>
                                          setPendingAction({
                                            kind: "block",
                                            user,
                                          })
                                        }
                                      >
                                        <Ban />
                                        {t("actions.block")}
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onSelect={() =>
                                        setPendingAction({
                                          kind: "delete",
                                          user,
                                        })
                                      }
                                    >
                                      <Trash2 />
                                      {t("actions.delete")}
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={canWrite ? 5 : 4}
                      className="h-72 text-center"
                    >
                      <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                          <UsersRound className="h-6 w-6" />
                        </span>
                        <p className="font-semibold text-foreground">
                          {users.length === 0
                            ? t("empty.title")
                            : t("empty.noResults")}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {users.length === 0
                            ? t("empty.description")
                            : t("empty.noResultsDescription")}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <aside className="space-y-6">
            <Card className="rounded-xl p-5">
              <h2 className="flex items-center gap-2.5 font-display text-lg font-semibold">
                <ShieldCheck className="h-5 w-5 text-status-info" />
                {t("roleSummary.title")}
              </h2>
              <div className="mt-5 divide-y">
                {ROLES.map((role) => {
                  const presentation = ROLE_PRESENTATION[role];
                  const Icon = presentation.icon;
                  return (
                    <div
                      key={role}
                      className="flex gap-3 py-4 first:pt-0 last:pb-0"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-status-info/10 text-status-info">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="font-semibold text-foreground">
                            {t(`roles.${role}`)}
                          </p>
                          <span className="text-sm font-medium text-muted-foreground">
                            {roleCounts[role]}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                          {t(`roleSummary.descriptions.${role}`)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="rounded-xl p-5">
              <h2 className="flex items-center gap-2.5 font-display text-lg font-semibold">
                <CircleUserRound className="h-5 w-5 text-status-info" />
                {t("accountSummary.title")}
              </h2>
              <dl className="mt-5 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-status-ok" />
                    {t("statuses.active")}
                  </dt>
                  <dd className="font-semibold text-foreground">
                    {activeCount}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-status-warning" />
                    {t("accountSummary.passwordChange")}
                  </dt>
                  <dd className="font-semibold text-foreground">
                    {passwordChangeCount}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-status-error" />
                    {t("statuses.blocked")}
                  </dt>
                  <dd className="font-semibold text-foreground">
                    {blockedCount}
                  </dd>
                </div>
              </dl>
            </Card>
          </aside>
        </div>
      )}

      <Dialog
        open={dialogMode !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create" ? t("create") : t("edit")}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "create"
                ? t("dialogDescriptions.create")
                : t("dialogDescriptions.edit")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} noValidate>
            <FieldGroup className="gap-4 py-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  className="gap-2"
                  data-invalid={!!form.formState.errors.name}
                >
                  <FieldLabel htmlFor="user-name">
                    {t("fields.name")}
                  </FieldLabel>
                  <Input
                    id="user-name"
                    aria-invalid={!!form.formState.errors.name}
                    {...form.register("name")}
                  />
                  {form.formState.errors.name && (
                    <FieldError errors={[form.formState.errors.name]} />
                  )}
                </Field>
                <Field
                  className="gap-2"
                  data-invalid={!!form.formState.errors.username}
                >
                  <FieldLabel htmlFor="user-username">
                    {t("fields.username")}
                  </FieldLabel>
                  <Input
                    id="user-username"
                    autoComplete="username"
                    aria-invalid={!!form.formState.errors.username}
                    {...form.register("username")}
                  />
                  {form.formState.errors.username && (
                    <FieldError errors={[form.formState.errors.username]} />
                  )}
                </Field>
              </div>

              <Field
                className="gap-2"
                data-invalid={!!form.formState.errors.email}
              >
                <FieldLabel htmlFor="user-email">
                  {t("fields.email")}
                </FieldLabel>
                <Input
                  id="user-email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={!!form.formState.errors.email}
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <FieldError errors={[form.formState.errors.email]} />
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  className="gap-2"
                  data-invalid={!!form.formState.errors.title}
                >
                  <FieldLabel htmlFor="user-title">
                    {t("fields.title")}
                  </FieldLabel>
                  <Input
                    id="user-title"
                    aria-invalid={!!form.formState.errors.title}
                    {...form.register("title")}
                  />
                  {form.formState.errors.title && (
                    <FieldError errors={[form.formState.errors.title]} />
                  )}
                </Field>
                <Field
                  className="gap-2"
                  data-invalid={!!form.formState.errors.role}
                >
                  <FieldLabel htmlFor="user-role">
                    {t("fields.role")}
                  </FieldLabel>
                  <select
                    id="user-role"
                    aria-invalid={!!form.formState.errors.role}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    {...form.register("role")}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {t(`roles.${role}`)}
                      </option>
                    ))}
                  </select>
                  {form.formState.errors.role && (
                    <FieldError errors={[form.formState.errors.role]} />
                  )}
                </Field>
              </div>

              <Field
                className="gap-2"
                data-invalid={!!form.formState.errors.password}
              >
                <FieldLabel htmlFor="user-password">
                  {dialogMode === "edit"
                    ? t("fields.passwordOptional")
                    : t("fields.password")}
                </FieldLabel>
                <Input
                  id="user-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    dialogMode === "edit"
                      ? t("fields.passwordPlaceholder")
                      : undefined
                  }
                  aria-invalid={!!form.formState.errors.password}
                  {...form.register("password")}
                />
                {form.formState.errors.password && (
                  <FieldError errors={[form.formState.errors.password]} />
                )}
              </Field>
            </FieldGroup>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={closeDialog}>
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

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive sm:mx-0">
              {pendingAction?.kind === "block" ? (
                <Ban className="h-5 w-5" />
              ) : (
                <Trash2 className="h-5 w-5" />
              )}
            </span>
            <AlertDialogTitle>
              {pendingAction?.kind === "block"
                ? t("blockConfirmTitle")
                : t("deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.kind === "block"
                ? t("blockConfirmDetails", {
                    name:
                      pendingAction.user.name || pendingAction.user.username,
                  })
                : t("deleteConfirmDetails", {
                    name:
                      pendingAction?.user.name || pendingAction?.user.username,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmPendingAction}
            >
              {pendingAction?.kind === "block"
                ? t("actions.block")
                : t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
