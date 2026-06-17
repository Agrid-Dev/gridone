import React, { FC } from "react";
import { TypographyH2 } from "@/components/ui/typography";

type ResourceHeaderProps = {
  title: React.ReactNode;
  caption?: React.ReactNode;
  /** Optional status slot rendered next to the title (e.g. connection /
   *  fault badges). */
  status?: React.ReactNode;
  actions?: React.ReactNode;
};

/** The single header shared by every resource detail/list/form page: the
 *  title with an optional status slot, an optional caption, and a
 *  right-aligned actions slot (which may host an overflow menu). Resource
 *  context lives in the breadcrumb, so this header shows only the title — no
 *  eyebrow and no back link. */
export const ResourceHeader: FC<ResourceHeaderProps> = ({
  title,
  caption,
  status,
  actions = null,
}) => (
  <div className="flex justify-between items-start gap-4 pb-6 border-b border-border">
    <div className="min-w-0">
      <div className="flex items-center gap-3">
        <TypographyH2>{title}</TypographyH2>
        {status}
      </div>
      {caption && (
        <div className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {caption}
        </div>
      )}
    </div>
    <div className="flex justify-end gap-2">{actions}</div>
  </div>
);
