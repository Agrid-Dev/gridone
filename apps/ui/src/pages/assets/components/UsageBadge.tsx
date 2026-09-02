import { useTranslation } from "react-i18next";
import type { AssetUsage } from "@gridone/sdk";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** What a room or zone is used for, as a chip beside its type. Renders
 *  nothing for an unclassified asset: "no usage" is a state worth leaving
 *  visible, not a badge worth labelling. A `span` rather than the `Badge`
 *  div so it can sit inside a link. */
export function UsageBadge({
  usage,
  className,
}: {
  usage: AssetUsage | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation("assets");
  if (!usage) return null;

  return (
    <span
      className={cn(
        badgeVariants({ variant: "secondary" }),
        "font-medium",
        className,
      )}
    >
      {t(`usages.${usage}`)}
    </span>
  );
}
