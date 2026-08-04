import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { mostSevere, SEVERITY_DOT_CLASS } from "@/lib/severity";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "./GlobalSearch";
import { LiveClock } from "./LiveClock";
import { UserMenu } from "./UserMenu";

export function TopBar() {
  const { t } = useTranslation("common");
  const { page: notifications } = useNotifications({ dismissed: false });
  const unreadCount = notifications?.total ?? 0;
  const topSeverity = mostSevere(
    (notifications?.items ?? []).map((d) => d.notification.severity),
  );

  return (
    /* Starts at the sidebar's right edge — see the stacking note in Sidebar.
     * Opaque `bg-sidebar` (pure white in light mode) rather than a translucent
     * background: it makes the topbar and sidebar one continuous chrome
     * surface, and there is nothing left to blur behind an opaque bar. */
    <header className="fixed left-64 right-0 top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-border bg-sidebar px-6">
      <div className="w-1/2 min-w-0">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-3">
        <LiveClock />

        <NavLink
          to="/notifications"
          aria-label={t("topbar.notifications")}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute right-2 top-2 h-2 w-2 rounded-full ring-2 ring-background",
                topSeverity
                  ? SEVERITY_DOT_CLASS[topSeverity]
                  : "bg-destructive",
              )}
            />
          )}
        </NavLink>

        <UserMenu />
      </div>
    </header>
  );
}
