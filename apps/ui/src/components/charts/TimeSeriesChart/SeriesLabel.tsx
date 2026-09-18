import { ResourceLink } from "@/components/ResourceLink";
import type { Series } from "./types";

export function SeriesLabel({ series }: { series: Series }) {
  return series.href ? (
    <ResourceLink
      to={series.href}
      className="text-primary hover:underline focus-visible:underline"
    >
      {series.label}
    </ResourceLink>
  ) : (
    <>{series.label}</>
  );
}
