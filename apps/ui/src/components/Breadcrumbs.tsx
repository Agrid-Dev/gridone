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
import { useRegisteredCrumbs } from "@/components/BreadcrumbProvider";
import { buildTrail, type TrailCrumb } from "@/lib/breadcrumbTrail";

/** Route trail for the current page, rendered at the top of the content
 *  column. The building identity is NOT repeated here — it lives in the
 *  sidebar — so the trail starts at the section ("Devices › CTA Restaurant")
 *  and collapses to nothing on the home route. */
export function Breadcrumbs() {
  const { t } = useTranslation("common");
  const { pathname } = useLocation();

  const registered = useRegisteredCrumbs();
  const trail = buildTrail(pathname, registered);

  if (trail.length === 0) return null;

  const label = (crumb: TrailCrumb): string =>
    crumb.label ?? (crumb.labelKey ? t(crumb.labelKey as never) : "");

  return (
    <Breadcrumb className="mb-6 min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {trail.map((crumb, index) => (
          <Fragment key={crumb.to}>
            {index > 0 && <BreadcrumbSeparator />}
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
