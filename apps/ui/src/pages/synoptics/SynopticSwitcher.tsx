import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import type { SynopticSummary } from "@gridone/sdk";
import { ResourceSwitcher } from "@/components/ResourceSwitcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SwitcherProps = {
  /** The plate on screen. */
  current: { id: string; name: string };
  /** Every stored plate, in list order. */
  synoptics: SynopticSummary[];
  /** The plate `/synoptics` opens on, if one is pinned. */
  pinned: string | null;
  onNavigate: (id: string) => void;
};

/** The plate's title opens a search over stored plates, with its default starred. */
export const SynopticSwitcher: FC<SwitcherProps> = ({
  current,
  synoptics,
  pinned,
  onNavigate,
}) => {
  const { t } = useTranslation("synoptics");

  return (
    <ResourceSwitcher
      current={current}
      resources={synoptics}
      onNavigate={onNavigate}
      labels={{
        label: t("switcher.label"),
        search: t("switcher.search"),
        empty: t("switcher.empty"),
        current: t("switcher.current"),
      }}
      renderOptionSuffix={(id) =>
        id === pinned && (
          <>
            <Star aria-hidden className="fill-amber-400 text-amber-500" />
            <span className="sr-only">{t("switcher.pinned")}</span>
          </>
        )
      }
    />
  );
};

type StepperProps = SwitcherProps & {
  onPin: (id: string | null) => void;
};

/**
 * Beside the title: the previous and next plates in list order (wrapping,
 * so the last leads back to the first), where the current one stands, and
 * the star that makes it the plate `/synoptics` opens on.
 */
export const SynopticStepper: FC<StepperProps> = ({
  current,
  synoptics,
  pinned,
  onNavigate,
  onPin,
}) => {
  const { t } = useTranslation("synoptics");
  const index = synoptics.findIndex((s) => s.id === current.id);
  const total = synoptics.length;
  const step = (by: number) =>
    onNavigate(synoptics[(index + by + total) % total].id);
  const isPinned = pinned === current.id;

  return (
    <div className="flex items-center gap-1">
      {index >= 0 && total > 1 && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("switcher.previous")}
            onClick={() => step(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span
            data-synoptic-position
            className="text-sm tabular-nums text-muted-foreground"
          >
            {t("switcher.position", { position: index + 1, total })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("switcher.next")}
            onClick={() => step(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("switcher.pin")}
        aria-pressed={isPinned}
        title={t("switcher.pin")}
        onClick={() => onPin(isPinned ? null : current.id)}
      >
        <Star
          className={cn(
            "h-4 w-4",
            isPinned
              ? "fill-amber-400 text-amber-500"
              : "text-muted-foreground",
          )}
        />
      </Button>
    </div>
  );
};
