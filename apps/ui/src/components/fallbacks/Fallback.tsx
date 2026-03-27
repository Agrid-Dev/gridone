import React, { FC } from "react";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

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
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="w-full max-w-sm text-center">
        {icon && (
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            {icon}
          </div>
        )}
        <h2 className="font-display text-xl font-semibold text-foreground">
          {title}
        </h2>
        {message && (
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        )}

        <div className="mt-8 flex justify-center gap-3">
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
    </div>
  );
};
