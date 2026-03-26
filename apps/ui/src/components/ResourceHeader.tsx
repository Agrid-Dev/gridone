import React, { FC } from "react";
import { TypographyH2, TypographyEyebrow } from "@/components/ui/typography";
import { Link } from "react-router";

type ResourceHeaderProps = {
  title: React.ReactNode;
  resourceName: React.ReactNode;
  resourceNameLinksBack?: boolean;
  /** Explicit path for the back link. When set, overrides the default ".." relative navigation. */
  backTo?: string;
  actions?: React.ReactNode;
};

export const ResourceHeader: FC<ResourceHeaderProps> = ({
  title,
  resourceName,
  resourceNameLinksBack = false,
  backTo,
  actions = null,
}) => (
  <div className="flex justify-between items-end pb-6 border-b border-border">
    <div>
      {resourceNameLinksBack ? (
        <Link
          to={backTo ?? ".."}
          className="group inline-flex items-center gap-1"
        >
          <span className="text-muted-foreground transition-transform group-hover:-translate-x-0.5">
            &larr;
          </span>
          <TypographyEyebrow>{resourceName}</TypographyEyebrow>
        </Link>
      ) : (
        <TypographyEyebrow>{resourceName}</TypographyEyebrow>
      )}
      <div className="mt-1">
        <TypographyH2>{title}</TypographyH2>
      </div>
    </div>
    <div className="flex justify-end gap-2">{actions}</div>
  </div>
);
