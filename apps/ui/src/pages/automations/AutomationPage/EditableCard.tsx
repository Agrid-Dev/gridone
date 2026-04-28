import { FC, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TypographyEyebrow } from "@/components/ui/typography";
import { Button } from "@/components/ui";
import { Pencil } from "lucide-react";

interface EditableCardProps {
  title: ReactNode;
  children: ReactNode;
  onClickEdit?: () => void;
}

const EditableCard: FC<EditableCardProps> = ({
  children,
  title,
  onClickEdit,
}) => {
  return (
    <Card>
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
    </Card>
  );
};

export default EditableCard;
