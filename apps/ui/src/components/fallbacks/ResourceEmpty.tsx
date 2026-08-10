import { FC, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FileSearchCorner, Plus } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";

interface ResourceEmptyProps {
  resourceName: string;
  filtered?: boolean;
  onClearFilters?: () => void;
  showCreate?: boolean;
  title?: string;
  description?: string;
  /** Call to action for resources that are not created from this page (an app
   *  registers itself, for instance) — rendered instead of the create button. */
  action?: ReactNode;
  className?: string;
}

export const ResourceEmpty: FC<ResourceEmptyProps> = ({
  resourceName,
  filtered,
  onClearFilters,
  showCreate = true,
  title,
  description,
  action,
  className,
}) => {
  const { t } = useTranslation();
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileSearchCorner />
        </EmptyMedia>
        <EmptyTitle>
          {title ??
            (filtered
              ? t("empty.noMatch", { resourceName })
              : t("empty.title", { resourceName }))}
        </EmptyTitle>
        <EmptyDescription>
          {description ??
            (filtered
              ? t("empty.clearFiltersHint")
              : t("empty.details", { resourceName }))}
        </EmptyDescription>
      </EmptyHeader>
      {(filtered || showCreate || action) && (
        <EmptyContent className="flex-row justify-center gap-2">
          {filtered && (
            <Button variant="outline" onClick={onClearFilters}>
              {t("empty.clearFilters")}
            </Button>
          )}
          {!filtered && showCreate && (
            <Button variant="default" asChild>
              <Link to="new">
                <Plus />
                {t("empty.new", { resourceName })}
              </Link>
            </Button>
          )}
          {!filtered && action}
        </EmptyContent>
      )}
    </Empty>
  );
};
