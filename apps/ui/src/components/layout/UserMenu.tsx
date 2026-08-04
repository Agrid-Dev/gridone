import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { LogOut, Settings } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Initials for the avatar: first + last initial when the name has several
 *  parts, otherwise the first two characters of the name or username. */
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

/** Account avatar and its menu: profile, appearance/language, sign out. */
export function UserMenu() {
  const { t } = useTranslation(["common", "users"]);
  const { state, logout } = useAuth();
  const navigate = useNavigate();

  const user = state.status === "authenticated" ? state.user : null;
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={user.name || user.username}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-mono text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {getInitials(user.name, user.username)}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="bottom" align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{user.name || user.username}</p>
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
  );
}
