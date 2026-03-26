import { NavLink, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Blocks,
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

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
    isActive
      ? "bg-primary/10 text-primary"
      : "text-sidebar-foreground hover:bg-white/[0.04] hover:text-white/90"
  }`;

const activeIndicator = (isActive: boolean) =>
  isActive ? (
    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
  ) : null;

export function Sidebar() {
  const { t } = useTranslation();
  const { state, logout } = useAuth();
  const can = usePermissions();
  const navigate = useNavigate();

  const user = state.status === "authenticated" ? state.user : null;

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-white/[0.06] bg-sidebar text-sidebar-foreground">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-white/[0.06] p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
              <span className="font-display text-sm font-bold text-primary">
                G
              </span>
            </div>
            <div>
              <p className="font-display text-[10px] font-medium uppercase tracking-[0.3em] text-sidebar-foreground/60">
                {t("app.title")}
              </p>
              <h1 className="font-display text-base font-semibold leading-tight text-white/90">
                {t("app.subtitle")}
              </h1>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          <NavLink to="/assets" className={navLinkClass}>
            {({ isActive }) => (
              <>
                {activeIndicator(isActive)}
                <Building2 className="h-4 w-4" />
                {t("app.assets")}
              </>
            )}
          </NavLink>

          {(
            [
              { route: "devices", icon: Cpu },
              { route: "drivers", icon: Puzzle },
              { route: "transports", icon: Cable },
            ] as const
          ).map(({ route, icon: Icon }) => (
            <NavLink key={route} to={`/${route}`} className={navLinkClass}>
              {({ isActive }) => (
                <>
                  {activeIndicator(isActive)}
                  <Icon className="h-4 w-4" />
                  {t(`app.${route}`)}
                </>
              )}
            </NavLink>
          ))}

          <NavLink to="/apps" className={navLinkClass}>
            {({ isActive }) => (
              <>
                {activeIndicator(isActive)}
                <Blocks className="h-4 w-4" />
                {t("apps.title")}
              </>
            )}
          </NavLink>

          <hr className="!my-3 border-white/[0.06]" />

          {can("users:read") && (
            <NavLink to="/users" className={navLinkClass}>
              {({ isActive }) => (
                <>
                  {activeIndicator(isActive)}
                  <Users className="h-4 w-4" />
                  {t("users.title")}
                </>
              )}
            </NavLink>
          )}

          <NavLink to="/settings" className={navLinkClass}>
            {({ isActive }) => (
              <>
                {activeIndicator(isActive)}
                <Settings className="h-4 w-4" />
                {t("settings.title")}
              </>
            )}
          </NavLink>
        </nav>

        {/* Footer */}
        <div className="border-t border-white/[0.06] p-3">
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-all duration-200 hover:bg-white/[0.04]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-semibold text-primary">
                    {getInitials(user.name, user.username)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white/90">
                      {user.name || user.username}
                    </p>
                    <p className="truncate text-xs text-sidebar-foreground/60">
                      {t(`users.roles.${user.role}`)}
                    </p>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground/40" />
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
