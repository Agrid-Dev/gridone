import { FC, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TypographyEyebrow } from "@/components/ui/typography";
import { Button } from "@/components/ui";
import { Pencil, Loader2 } from "lucide-react";

interface EditableCardProps {
  title: ReactNode;
  children: ReactNode;
  onClickEdit?: () => void;
  isSubmitting?: boolean;
}

const EditableCard: FC<EditableCardProps> = ({
  children,
  title,
  onClickEdit,
  isSubmitting,
}) => {
  return (
    <Card className="relative" aria-busy={isSubmitting}>
      <CardContent className="space-y-4 py-5">
        <div className="flex min-h-9 items-center justify-between">
          <TypographyEyebrow>{title}</TypographyEyebrow>
          {onClickEdit && (
            <Button variant="ghost" onClick={onClickEdit} size="sm">
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
