import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { localize } from "../face";
import type { AttributeLike } from "../runtime";

/** One attribute description to show: `caption` names what it explains. */
export type DescriptionEntry = { caption: string; text: string };

/**
 * The descriptions declared by the attributes behind a widget row, resolved
 * in `language`, in the given order; attributes without a description (or
 * unresolved bindings) are skipped, so an empty result means "no hint".
 */
export function describedAttributes(
  entries: readonly { caption: string; attribute: AttributeLike | null }[],
  language: string,
): DescriptionEntry[] {
  return entries.flatMap(({ caption, attribute }) =>
    attribute?.description
      ? [{ caption, text: localize(attribute.description, language) }]
      : [],
  );
}

/**
 * A small "i" next to a widget label that reveals, on hover or focus, the
 * descriptions the driver declared for the attributes behind that row.
 * Renders nothing when there is nothing to explain, so widgets without
 * descriptions look exactly as before. A single entry shows its text alone;
 * several are listed under their caption (e.g. the table's column names).
 */
export function DescriptionHint({
  name,
  entries,
}: {
  /** What the hint is about, for the button's accessible name. */
  name: string;
  entries: DescriptionEntry[];
}) {
  const { t } = useTranslation("devices");
  if (entries.length === 0) return null;
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("presentation.describe", { name })}
          className="inline-flex shrink-0 items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-72 space-y-1">
        {entries.length === 1 ? (
          <p className="text-xs text-muted-foreground">{entries[0].text}</p>
        ) : (
          entries.map((entry) => (
            <p key={entry.caption} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {entry.caption}
              </span>{" "}
              {entry.text}
            </p>
          ))
        )}
        <TooltipArrow className="fill-popover" />
      </TooltipContent>
    </Tooltip>
  );
}
