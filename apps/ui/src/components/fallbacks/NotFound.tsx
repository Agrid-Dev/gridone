import { Fallback, FallbackProps } from "./Fallback";
import { FC } from "react";
import { FileSearchCorner } from "lucide-react";
import { useTranslation } from "react-i18next";
type NotFoundFallbackProps = Partial<Omit<FallbackProps, "icon">>;

export const NotFoundFallback: FC<NotFoundFallbackProps> = (props) => {
  const { t } = useTranslation();
  const title = props.title || t("errors.notFound");
  return (
    <Fallback
      {...props}
      title={title}
      icon={<FileSearchCorner size="3rem" />}
    />
  );
};
