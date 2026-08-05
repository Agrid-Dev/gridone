import { Layers3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Asset } from "@gridone/sdk";

/** Chip labelling the asset (floor, room, zone…) a resource sits in. */
export function AssetChip({ asset }: { asset: Asset | undefined }) {
  if (!asset) return null;

  return (
    <Badge variant="secondary" className="gap-1">
      <Layers3 className="h-3 w-3" />
      {asset.name}
    </Badge>
  );
}
