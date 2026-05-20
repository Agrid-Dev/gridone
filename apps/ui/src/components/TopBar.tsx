import { NavLink, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Bell, LogOut, Settings } from "lucide-react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationCount } from "@/hooks/useNotificationCount";
import { isFeatureEnabled } from "@/utils/featureFlags";
import { buildingPlaceholderData } from "@/pages/home/placeholderData";
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

export function TopBar() {
  const { t } = useTranslation(["common", "users"]);
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useNotificationCount();

  const user = state.status === "authenticated" ? state.user : null;
  const showBuildingName = isFeatureEnabled("buildingHomepage");

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="min-w-0 flex-1">
        {showBuildingName && (
          <NavLink
            to="/"
            className="inline-block max-w-full truncate font-display text-lg font-semibold text-foreground transition-colors hover:text-primary"
          >
            {buildingPlaceholderData.name}
          </NavLink>
        )}
      </div>

      <div className="flex items-center gap-2">
        <NavLink
          to="/notifications"
          aria-label={t("topbar.notifications")}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
          )}
        </NavLink>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={user.name || user.username}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
              >
                {getInitials(user.name, user.username)}
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent side="bottom" align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">
                    {user.name || user.username}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user.email || t(`users:roles.${user.role}`)}
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
        )}
      </div>
    </header>
  );
}
