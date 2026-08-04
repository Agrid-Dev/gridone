import React, { FC } from "react";
import { TypographyH2 } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

type ResourceHeaderProps = {
  title: React.ReactNode;
  caption?: React.ReactNode;
  /** Optional status slot rendered next to the title (e.g. connection /
   *  fault badges). */
  status?: React.ReactNode;
  actions?: React.ReactNode;
  /** Drop the bottom divider + padding so the header can sit flush against an
   *  adjacent element that owns the divider (e.g. a tab bar). */
  flush?: boolean;
};

/** The single header shared by every resource detail/list/form page: the
 *  title with an optional status slot, an optional caption, and a
 *  right-aligned actions slot (which may host an overflow menu).
 *
 *  Actions share a centred row with the title rather than sitting beside the
 *  title+caption block: a control is taller than the title's line box, so
 *  aligning the two blocks instead leaves the button visibly low whenever
 *  there's no caption to make the left column the taller of the two. The
 *  caption then flows underneath, spanning the full width. */
export const ResourceHeader: FC<ResourceHeaderProps> = ({
  title,
  caption,
  status,
  actions = null,
  flush = false,
}) => (
  <div className={cn(!flush && "pb-6 border-b border-border")}>
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <TypographyH2>{title}</TypographyH2>
        {status}
      </div>
      <div className="flex shrink-0 justify-end gap-2">{actions}</div>
    </div>
    {caption && (
      <div className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {caption}
      </div>
    )}
  </div>
);
