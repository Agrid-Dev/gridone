import { Fragment } from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { OrgAvatar } from "@/components/OrgAvatar";
import {
  isProfileConfigured,
  useBuildingProfile,
} from "@/hooks/useBuildingProfile";
import { useRegisteredCrumbs } from "@/components/BreadcrumbProvider";
import { buildTrail, type TrailCrumb } from "@/lib/breadcrumbTrail";

export function Breadcrumbs() {
  const { t } = useTranslation("common");
  const { pathname } = useLocation();
  const { data: profile } = useBuildingProfile();
  const configured = isProfileConfigured(profile);

  const registered = useRegisteredCrumbs();
  const trail = buildTrail(pathname, registered);

  const label = (crumb: TrailCrumb): string =>
    crumb.label ?? (crumb.labelKey ? t(crumb.labelKey as never) : "");

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link
              to={configured ? "/" : "/devices"}
              className="inline-flex min-w-0 items-center gap-2"
            >
              <OrgAvatar
                icon={profile?.icon}
                name={profile?.name}
                className="h-7 w-7"
              />
              {configured && (
                <span className="truncate font-sans text-base font-semibold tracking-tight text-foreground">
                  {profile?.name}
                </span>
              )}
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {trail.map((crumb) => (
          <Fragment key={crumb.to}>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              {crumb.isCurrent ? (
                <BreadcrumbPage className="truncate">
                  {label(crumb)}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={crumb.to} className="truncate">
                    {label(crumb)}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
