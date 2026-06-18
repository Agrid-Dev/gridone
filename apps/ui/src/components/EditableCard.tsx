import { FC, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TypographyEyebrow } from "@/components/ui/typography";
import { Button } from "@/components/ui";
import { Pencil, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type EditableCardVariant = "default" | "ghost";

interface EditableCardProps {
  title: ReactNode;
  children: ReactNode;
  onClickEdit?: () => void;
  editLabel?: string;
  isSubmitting?: boolean;
  variant?: EditableCardVariant;
}

const EditableCard: FC<EditableCardProps> = ({
  children,
  title,
  onClickEdit,
  editLabel,
  isSubmitting,
  variant = "default",
}) => {
  const { t } = useTranslation("common");
  const ariaLabel = editLabel ?? t("common.edit");
  return (
    <Card
      className={cn(
        "relative",
        variant === "ghost" && "border-transparent bg-transparent shadow-none",
      )}
      aria-busy={isSubmitting}
    >
      <CardContent className="space-y-4 py-5">
        <div className="flex min-h-9 items-center justify-between">
          <TypographyEyebrow>{title}</TypographyEyebrow>
          {onClickEdit && (
            <Button
              variant="ghost"
              onClick={onClickEdit}
              size="sm"
              aria-label={ariaLabel}
            >
              <Pencil />
            </Button>
          )}
        </div>
        {children}
      </CardContent>
      {isSubmitting && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-sm">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
    </Card>
  );
};

export default EditableCard;
