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
}

export const ResourceEmpty: FC<ResourceEmptyProps> = ({ resourceName }) => {
  const { t } = useTranslation();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileSearchCorner />
        </EmptyMedia>
        <EmptyTitle>{t("empty.title", { resourceName })}</EmptyTitle>
        <EmptyDescription>
          {t("empty.details", { resourceName })}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        <Button variant="default" asChild>
          <Link to="new">
            <Plus />
            {t("empty.new", { resourceName })}
          </Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
};
