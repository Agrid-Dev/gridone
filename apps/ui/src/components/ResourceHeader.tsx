import React, { FC } from "react";
import { TypographyH2, TypographyEyebrow } from "@/components/ui/typography";
import { Link } from "react-router";

type ResourceHeaderProps = {
  title: React.ReactNode;
  resourceName: React.ReactNode;
  resourceNameLinksBack?: boolean;
  actions?: React.ReactNode;
};

export const ResourceHeader: FC<ResourceHeaderProps> = ({
  title,
  resourceName,
  resourceNameLinksBack = false,
  actions = null,
}) => (
  <div className="flex justify-between items-end mb-4 pb-4 border-b border-muted">
    <div>
      {resourceNameLinksBack ? (
        <Link to="..">
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
