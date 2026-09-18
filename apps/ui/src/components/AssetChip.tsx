import { Layers3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Asset } from "@gridone/sdk";
import { ResourceLink } from "./ResourceLink";

/** Chip labelling the asset (floor, room, zone…) a resource sits in. */
export function AssetChip({ asset }: { asset: Asset | undefined }) {
  if (!asset) return null;

  return (
    <ResourceLink
      to={`/assets/${asset.id}`}
      className="rounded focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Badge variant="secondary" className="gap-1 text-primary hover:underline">
        <Layers3 className="h-3 w-3" />
        {asset.name || asset.id}
      </Badge>
    </ResourceLink>
  );
}
