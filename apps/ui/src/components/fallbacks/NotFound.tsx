import { Fallback, FallbackProps } from "./Fallback";
import { FC, useEffect } from "react";
import { Link, useInRouterContext, useLocation } from "react-router";
import {
  canonicalList,
  currentEntry,
  markResourceDeleted,
  resourcePath,
} from "@/lib/navigation";
import { BackLink } from "@/components/BackLink";
import { FileSearchCorner } from "lucide-react";
import { useTranslation } from "react-i18next";
type NotFoundFallbackProps = Partial<Omit<FallbackProps, "icon">>;

export const NotFoundFallback: FC<NotFoundFallbackProps> = (props) => {
  const inRouter = useInRouterContext();
  return inRouter ? (
    <ResourceNotFound {...props} />
  ) : (
    <NotFoundContent {...props} />
  );
};

const NotFoundContent: FC<NotFoundFallbackProps> = (props) => {
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

function ResourceNotFound(props: NotFoundFallbackProps) {
  const location = useLocation();
  const { t } = useTranslation();
  const resource = resourcePath(location.pathname);
  const canonical = canonicalList(location.pathname);
  const returning = currentEntry(location).values.returning === true;
  useEffect(() => {
    if (resource) markResourceDeleted(resource);
  }, [resource]);
  const name = canonical.split("/").at(-1);
  const label =
    name &&
    [
      "devices",
      "assets",
      "transports",
      "drivers",
      "automations",
      "views",
    ].includes(name)
      ? t(`navigation.back.${name}` as "navigation.back.devices")
      : t("common.home");
  return (
    <NotFoundContent
      {...props}
      action={
        returning ? (
          <Link
            to={canonical}
            replace
            className="text-primary hover:underline focus-visible:underline"
          >
            {label}
          </Link>
        ) : (
          <BackLink to={canonical}>{label}</BackLink>
        )
      }
    />
  );
}
