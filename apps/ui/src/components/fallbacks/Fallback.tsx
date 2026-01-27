import { FC } from "react";
import { Button } from "@/components/ui/button";
import { TypographyH2 } from "../ui/typography";
import { Home, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next"; // Optional: for i18n

export interface FallbackProps {
  title: string;
  icon?: React.ReactNode;
  message?: string;
  showHomeLink?: boolean;
  showBackLink?: boolean;
}

export const Fallback: FC<FallbackProps> = ({
  title,
  message,
  icon,
  showHomeLink = true,
  showBackLink = true,
}) => {
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-md mx-auto my-8">
      <div className="text-center my-4">
        <TypographyH2>{title}</TypographyH2>
      </div>
      <div className="text-center text-muted-foreground flex flex-col justify-center items-center gap-8">
        {icon && <div>{icon}</div>}
        {message && <p>{message}</p>}
      </div>

      <div className="flex justify-center gap-4 mt-8">
        {showBackLink && (
          <Button
            variant="outline"
            onClick={() => window.history.back()}
            disabled={!window.history.length}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("common.back") || "Back"}
          </Button>
        )}
        {showHomeLink && (
          <Button variant="outline" asChild>
            <a href="/">
              <Home className="mr-2 h-4 w-4" />
              {t("common.home") || "Home"}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
};
