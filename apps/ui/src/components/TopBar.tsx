import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNotificationCount } from "@/hooks/useNotificationCount";

export function TopBar() {
  const { t } = useTranslation("common");
  const unreadCount = useNotificationCount();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="relative max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          className="h-10 rounded-xl border-border bg-card pl-9 focus-visible:ring-offset-0"
          placeholder={t("topbar.searchPlaceholder")}
          aria-label={t("topbar.searchLabel")}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
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
      </div>
    </header>
  );
}
