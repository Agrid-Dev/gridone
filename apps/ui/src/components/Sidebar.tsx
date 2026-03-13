import { NavLink, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Cable,
  ChevronsUpDown,
  Cpu,
  LogOut,
  Puzzle,
  Settings,
  Users,
} from "lucide-react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function getInitials(name: string, username: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}

export function Sidebar() {
  const { t } = useTranslation();
  const { state, logout } = useAuth();
  const can = usePermissions();
  const navigate = useNavigate();

  const user = state.status === "authenticated" ? state.user : null;

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-slate-200 bg-white">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-slate-200 p-6">
          <p className="text-xs font-medium uppercase tracking-[0.4em] text-slate-500">
            {t("app.title")}
          </p>
          <h1 className="mt-1 text-xl font-semibold leading-tight text-slate-900">
            {t("app.subtitle")}
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <NavLink
            to="/assets"
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-slate-900 text-slate-50"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`
            }
          >
            <Building2 className="h-4 w-4" />
            {t("app.assets")}
          </NavLink>

          {(
            [
              { route: "devices", icon: Cpu },
              { route: "drivers", icon: Puzzle },
              { route: "transports", icon: Cable },
            ] as const
          ).map(({ route, icon: Icon }) => (
            <NavLink
              key={route}
              to={`/${route}`}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-slate-900 text-slate-50"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {t(`app.${route}`)}
            </NavLink>
          ))}

          <hr className="border-slate-100 my-2" />

          {can("users:read") && (
            <NavLink
              to="/users"
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-slate-900 text-slate-50"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
            >
              <Users className="h-4 w-4" />
              {t("users.title")}
            </NavLink>
          )}

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-slate-900 text-slate-50"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`
            }
          >
            <Settings className="h-4 w-4" />
            {t("settings.title")}
          </NavLink>
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-200 p-3">
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-slate-100">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-700">
                    {getInitials(user.name, user.username)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {user.name || user.username}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {t(`users.roles.${user.role}`)}
                    </p>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">
                      {user.name || user.username}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="h-4 w-4" />
                  {t("settings.subtitle")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <LanguageSwitcher />
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="h-4 w-4" />
                  {t("auth.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </aside>
  );
}
