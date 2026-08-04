import { ComponentType, FC } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Check, CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { NotificationDispatch } from "@gridone/sdk";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotifications } from "@/hooks/useNotifications";
import { SEVERITY_LEVEL, type StatusLevel } from "@/lib/semanticColors";
import type { Severity } from "@/lib/severity";
import { cn, formatTimeAgo } from "@/lib/utils";
import { CardHeaderLink } from "./CardHeaderLink";

/** The card lists only the freshest few; "view all" covers the rest. */
const MAX_RECENT = 3;

/** Soft severity tile behind the glyph (literal classes for Tailwind). */
const TILE_CLASS: Record<StatusLevel, string> = {
  ok: "bg-status-ok/10 text-status-ok",
  info: "bg-status-info/10 text-status-info",
  warning: "bg-status-warning/10 text-status-warning",
  error: "bg-status-error/10 text-status-error",
};

const GLYPH: Record<Severity, ComponentType<{ className?: string }>> = {
  alert: TriangleAlert,
  warning: CircleAlert,
  info: Info,
};

export const NotificationsCard: FC = () => {
  const { t } = useTranslation("home");
  const { page, loading } = useNotifications({ dismissed: false });
  const items = (page?.items ?? []).slice(0, MAX_RECENT);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{t("notificationsCard.title")}</CardTitle>
        <CardHeaderLink to="/notifications">
          {t("notificationsCard.viewAll")}
        </CardHeaderLink>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ListSkeleton />
        ) : items.length > 0 ? (
          <div className="space-y-1">
            {items.map((dispatch) => (
              <NotificationItem
                key={dispatch.notification.id}
                dispatch={dispatch}
              />
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-status-ok" />
            {t("notificationsCard.empty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const NotificationItem: FC<{ dispatch: NotificationDispatch }> = ({
  dispatch,
}) => {
  const { t: tc } = useTranslation();
  const { notification } = dispatch;
  const level = SEVERITY_LEVEL[notification.severity];
  const Glyph = GLYPH[notification.severity];
  const receivedAgo = formatTimeAgo(
    new Date(dispatch.dispatched_at).getTime(),
    tc,
  );

  return (
    <Link
      to="/notifications"
      className="-mx-2 flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/60"
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
          TILE_CLASS[level],
        )}
      >
        <Glyph className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">
          {notification.title}
        </span>
        <span className="block text-xs text-muted-foreground">
          {receivedAgo}
        </span>
      </span>
    </Link>
  );
};

const ListSkeleton: FC = () => (
  <div className="space-y-2">
    {[0, 1, 2].map((i) => (
      <Skeleton key={i} className="h-9 w-full rounded-lg" />
    ))}
  </div>
);
