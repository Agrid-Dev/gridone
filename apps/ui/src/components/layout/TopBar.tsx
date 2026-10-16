import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { GlobalSearch } from "./GlobalSearch";
import { LiveClock } from "./LiveClock";
import { UserMenu } from "./UserMenu";

export function TopBar({ menu }: { menu?: ReactNode }) {
  const { t } = useTranslation("common");
  const { page: notifications } = useNotifications({ dismissed: false });
  const unreadCount = notifications?.total ?? 0;

  return (
    /* Starts at the sidebar's right edge — see the stacking note in Sidebar.
     * Opaque `bg-card` rather than a translucent background: there is nothing
     * left to blur behind an opaque bar. It no longer follows the sidebar,
     * which is dark in both themes. */
    <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between gap-2 border-b border-border bg-card px-4 sm:gap-4 sm:px-6 lg:left-64">
      {menu}
      <div className="min-w-0 flex-1 sm:max-w-[50%]">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:block">
          <LiveClock />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <NavLink
              to="/notifications"
              aria-label={
                unreadCount
                  ? t("topbar.unread", { count: unreadCount })
                  : t("topbar.notifications")
              }
              title={
                unreadCount
                  ? t("topbar.unread", { count: unreadCount })
                  : t("topbar.notifications")
              }
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold text-destructive-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </NavLink>
          </TooltipTrigger>
          <TooltipContent>
            {unreadCount
              ? t("topbar.unread", { count: unreadCount })
              : t("topbar.notifications")}
          </TooltipContent>
        </Tooltip>

        <UserMenu />
      </div>
    </header>
  );
}
