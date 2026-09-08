import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import type { ViewerDepth } from "./useViewerState";

/** `depth: null` marks the room — the current position, never a way back. */
type Crumb = { depth: ViewerDepth | null; label: string };

/**
 * Where the viewer stands, and the way back out of it.
 *
 * Renders only once a level is isolated or a room is picked — at the whole
 * building there is nothing to leave. Every crumb but the last pops straight
 * back to its depth, and the crumbs are exactly the layers Escape peels, so
 * pointer and keyboard teach the same model.
 *
 * It sits inside the levels panel, above its search box, so it carries no card
 * chrome of its own and wraps rather than truncating: the panel is narrow, and
 * a room name cut to three letters would name nothing.
 */
export const ViewerBreadcrumb: FC<{
  levelName: string | null;
  roomName: string | null;
  planActive: boolean;
  onGoTo: (depth: ViewerDepth) => void;
}> = ({ levelName, roomName, planActive, onGoTo }) => {
  const { t } = useTranslation("home");

  const crumbs: Crumb[] = [
    { depth: "building", label: t("zonesByLevel.viewer.breadcrumb.allLevels") },
  ];
  if (levelName) {
    crumbs.push({ depth: "level", label: levelName });
  }
  if (planActive) {
    crumbs.push({
      depth: "plan",
      label: t("zonesByLevel.viewer.breadcrumb.plan"),
    });
  }
  if (roomName) {
    crumbs.push({ depth: null, label: roomName });
  }
  if (crumbs.length === 1) {
    return null;
  }

  return (
    <nav
      className="flex flex-wrap items-center gap-x-0.5 gap-y-0.5 px-1.5 py-1.5 text-[11px]"
      aria-label={t("zonesByLevel.viewer.breadcrumb.label")}
    >
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        // A const, so the narrowing below survives into the click handler.
        const target = crumb.depth;
        return (
          <span
            key={crumb.label}
            className="flex min-w-0 max-w-full items-center gap-0.5"
          >
            {index > 0 && (
              <ChevronRight
                className="h-3 w-3 shrink-0 text-muted-foreground"
                aria-hidden
              />
            )}
            {last || target === null ? (
              <span
                className="truncate font-medium text-foreground"
                aria-current="location"
              >
                {crumb.label}
              </span>
            ) : (
              <button
                type="button"
                className="truncate rounded-full px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => onGoTo(target)}
              >
                {crumb.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
};
