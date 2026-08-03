import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ServerErrorAlertProps {
  message?: string;
  title?: string;
  className?: string;
}

/** Shared form-level surface for `root.server` errors. */
export const ServerErrorAlert = ({
  message,
  title,
  className,
}: ServerErrorAlertProps) => {
  const { t } = useTranslation("common");
  if (!message) return null;

  return (
    <Alert variant="destructive" className={className}>
      <AlertTitle>{title ?? t("schemaForm.serverErrorTitle")}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
};
