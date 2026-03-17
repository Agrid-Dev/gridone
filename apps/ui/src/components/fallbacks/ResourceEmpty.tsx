import { FC } from "react";
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
}

export const ResourceEmpty: FC<ResourceEmptyProps> = ({
  resourceName,
  filtered,
  onClearFilters,
}) => {
  const { t } = useTranslation();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileSearchCorner />
        </EmptyMedia>
        <EmptyTitle>
          {filtered
            ? t("empty.noMatch", { resourceName })
            : t("empty.title", { resourceName })}
        </EmptyTitle>
        <EmptyDescription>
          {filtered
            ? t("empty.clearFiltersHint")
            : t("empty.details", { resourceName })}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        {filtered ? (
          <Button variant="outline" onClick={onClearFilters}>
            {t("empty.clearFilters")}
          </Button>
        ) : (
          <Button variant="default" asChild>
            <Link to="new">
              <Plus />
              {t("empty.new", { resourceName })}
            </Link>
          </Button>
        )}
      </EmptyContent>
    </Empty>
  );
};
