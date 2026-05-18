import { NavLink, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Blocks,
  ChevronsUpDown,
  Cpu,
  LogOut,
  Puzzle,
  Settings,
  TriangleAlert,
  Users,
  Zap,
} from "lucide-react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getHealth } from "@/api/health";

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
  `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? "bg-accent text-accent-foreground"
      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
  }`;

export function Sidebar() {
  const { t } = useTranslation(["common", "users"]);
  const { state, logout } = useAuth();
  const can = usePermissions();
  const navigate = useNavigate();
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const user = state.status === "authenticated" ? state.user : null;
  const version = health?.version?.trim() || null;
  const versionLabel = version ? t("app.version", { version }) : null;

  return (
    <aside className="fixed left-0 top-0 z-30 h-screen w-64 border-r border-border bg-sidebar">
      <div className="flex h-full flex-col">
        {/* User profile at top */}
        <div className="border-b border-border px-3 py-3">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent/60">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                    {getInitials(user.name, user.username)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {user.name || user.username}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email || t(`users:roles.${user.role}`)}
                    </p>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent side="bottom" align="start" className="w-56">
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

                <div className="space-y-3 px-2 py-2">
                  <ThemeSwitcher />
                  <LanguageSwitcher />
                </div>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={logout}>
                  <LogOut className="h-4 w-4" />
                  {t("auth.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <span className="font-display text-base font-bold text-primary">
                  G
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold tracking-wide text-foreground">
                  {t("app.title")}
                </p>
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          <NavLink to="/assets" className={navLinkClass}>
            <Building2 className="h-4 w-4" />
            {t("app.assets")}
          </NavLink>

          {(
            [
              { route: "devices", icon: Cpu },
              { route: "drivers", icon: Puzzle },
            ] as const
          ).map(({ route, icon: Icon }) => (
            <NavLink key={route} to={`/${route}`} className={navLinkClass}>
              <Icon className="h-4 w-4" />
              {t(`app.${route}`)}
            </NavLink>
          ))}

          <NavLink to="/apps" className={navLinkClass}>
            <Blocks className="h-4 w-4" />
            {t("app.apps")}
          </NavLink>

          <NavLink to="/automations" className={navLinkClass}>
            <Zap className="h-4 w-4" />
            {t("app.automations")}
          </NavLink>

          <NavLink to="/faults" className={navLinkClass}>
            <TriangleAlert className="h-4 w-4" />
            {t("app.faults")}
          </NavLink>

          <hr className="!my-3 border-border" />

          {can("users:read") && (
            <NavLink to="/users" className={navLinkClass}>
              <Users className="h-4 w-4" />
              {t("app.users")}
            </NavLink>
          )}

          <NavLink to="/settings" className={navLinkClass}>
            <Settings className="h-4 w-4" />
            {t("settings.title")}
          </NavLink>
        </nav>

        {/* Footer: brand + version */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-xs font-semibold tracking-wide text-muted-foreground">
              {t("app.title")}
            </p>
            {version && versionLabel && (
              <p
                aria-label={versionLabel}
                className="font-mono text-xs font-medium text-muted-foreground"
                title={versionLabel}
              >
                v{version}
              </p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
