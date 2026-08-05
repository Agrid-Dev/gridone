import { Building2, Layers3, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AssetTreeNode } from "@/lib/assets";

const ZONE_TYPES = new Set(["room", "zone"]);

const zonePillStyles: Record<string, string> = {
  room: "border-hvac-heat/30 bg-hvac-heat/10 text-[hsl(var(--hvac-heat))] hover:bg-hvac-heat/20",
  zone: "border-primary/25 bg-primary/10 text-primary hover:bg-primary/20",
};

function countZones(node: AssetTreeNode): number {
  return node.children.reduce(
    (total, child) =>
      total + (ZONE_TYPES.has(child.type) ? 1 : 0) + countZones(child),
    0,
  );
}

function countDevices(node: AssetTreeNode): number {
  return (
    (node.devices?.length ?? 0) +
    node.children.reduce((total, child) => total + countDevices(child), 0)
  );
}

function findNodesByType(
  nodes: AssetTreeNode[],
  type: string,
): AssetTreeNode[] {
  const matches: AssetTreeNode[] = [];

  for (const node of nodes) {
    if (node.type === type) {
      matches.push(node);
      continue;
    }
    matches.push(...findNodesByType(node.children, type));
  }

  return matches;
}

function createHref(
  parentId: string,
  type: "building" | "floor" | "room" | "zone",
) {
  const params = new URLSearchParams({ parentId, type });
  return `/assets/new?${params.toString()}`;
}

function AddLink({
  parentId,
  type,
  label,
  compact = false,
}: {
  parentId: string;
  type: "building" | "floor" | "room" | "zone";
  label: string;
  compact?: boolean;
}) {
  return (
    <Link
      to={createHref(parentId, type)}
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        compact
          ? "h-10 w-10 shrink-0 rounded-xl"
          : "min-h-11 w-full gap-2 rounded-xl px-4 text-sm font-medium",
      )}
    >
      <Plus className="h-4 w-4" />
      {!compact && label}
    </Link>
  );
}

function ZonePill({
  node,
  canEdit,
}: {
  node: AssetTreeNode;
  canEdit: boolean;
}) {
  const { t } = useTranslation("assets");
  const hasChildren = node.children.length > 0;
  const linkedDevices = node.devices?.length ?? 0;

  const pill = (
    <Link
      to={`/assets/${node.id}`}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all hover:-translate-y-px hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        zonePillStyles[node.type] ??
          "border-border bg-muted/60 text-foreground hover:bg-muted",
      )}
    >
      <span>{node.name}</span>
      {linkedDevices > 0 && (
        <>
          <span
            className="h-1.5 w-1.5 rounded-full bg-current opacity-70"
            aria-hidden="true"
          />
          <span className="sr-only">
            {t("overview.linkedDevices", { count: linkedDevices })}
          </span>
        </>
      )}
    </Link>
  );

  if (!hasChildren) return pill;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-1.5">
      {pill}
      {node.children.map((child) => (
        <ZonePill key={child.id} node={child} canEdit={canEdit} />
      ))}
      {canEdit && (
        <AddLink
          parentId={node.id}
          type="zone"
          label={t("overview.addSubzoneTo", { name: node.name })}
          compact
        />
      )}
    </div>
  );
}

function FloorRow({
  floor,
  canEdit,
}: {
  floor: AssetTreeNode;
  canEdit: boolean;
}) {
  const { t } = useTranslation("assets");
  const zoneCount = countZones(floor);
  const deviceCount = countDevices(floor);

  return (
    <article className="grid gap-4 rounded-xl px-3 py-4 transition-colors hover:bg-accent/65 focus-within:bg-accent/65 sm:grid-cols-[9rem_minmax(0,1fr)] lg:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="min-w-0">
        <Link
          to={`/assets/${floor.id}`}
          className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {floor.name}
        </Link>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          {t("overview.zoneCount", { count: zoneCount })}
          <span className="px-1.5" aria-hidden="true">
            ·
          </span>
          {t("overview.deviceCount", { count: deviceCount })}
        </p>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {floor.children.map((child) => (
          <ZonePill key={child.id} node={child} canEdit={canEdit} />
        ))}
        {canEdit && (
          <AddLink
            parentId={floor.id}
            type="room"
            label={t("overview.addZoneTo", { name: floor.name })}
            compact
          />
        )}
      </div>
    </article>
  );
}

function BuildingCard({
  building,
  canEdit,
}: {
  building: AssetTreeNode;
  canEdit: boolean;
}) {
  const { t } = useTranslation("assets");
  const floors = findNodesByType(building.children, "floor");
  const looseZones = building.children.filter(
    (child) => child.type !== "floor",
  );
  const looseZoneCount = looseZones.reduce(
    (total, node) =>
      total + (ZONE_TYPES.has(node.type) ? 1 : 0) + countZones(node),
    0,
  );
  const looseDeviceCount = looseZones.reduce(
    (total, node) => total + countDevices(node),
    0,
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <Link
            to={`/assets/${building.id}`}
            className="truncate text-base font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-lg"
          >
            {building.name}
          </Link>
          <Badge
            variant="info"
            className="hidden rounded-full px-3 py-1 sm:inline-flex"
          >
            {t(`types.${building.type}`, { defaultValue: building.type })}
          </Badge>
        </div>
        <span className="text-xs font-semibold text-muted-foreground sm:text-sm">
          {t("overview.floorCount", { count: floors.length })}
        </span>
      </header>

      <div className="space-y-1 px-2 py-3 sm:px-4">
        {floors.map((floor) => (
          <FloorRow key={floor.id} floor={floor} canEdit={canEdit} />
        ))}

        {looseZones.length > 0 && (
          <article className="grid gap-4 rounded-xl px-3 py-4 transition-colors hover:bg-accent/65 sm:grid-cols-[9rem_minmax(0,1fr)] lg:grid-cols-[10rem_minmax(0,1fr)]">
            <div>
              <span className="font-semibold text-foreground">
                {t("overview.otherZones")}
              </span>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                {t("overview.zoneCount", { count: looseZoneCount })}
                <span className="px-1.5" aria-hidden="true">
                  ·
                </span>
                {t("overview.deviceCount", { count: looseDeviceCount })}
              </p>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {looseZones.map((zone) => (
                <ZonePill key={zone.id} node={zone} canEdit={canEdit} />
              ))}
            </div>
          </article>
        )}

        {floors.length === 0 && looseZones.length === 0 && (
          <div className="flex min-h-24 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
            <Layers3 className="h-5 w-5 text-muted-foreground/70" />
            <p className="text-sm text-muted-foreground">
              {t("overview.noFloors")}
            </p>
          </div>
        )}
      </div>

      {canEdit && (
        <footer className="px-4 pb-4 sm:px-6 sm:pb-5">
          <AddLink
            parentId={building.id}
            type="floor"
            label={t("overview.addFloor")}
          />
        </footer>
      )}
    </section>
  );
}

export function ZonesLegend() {
  const { t } = useTranslation("assets");

  return (
    <div
      className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground sm:text-sm"
      aria-label={t("overview.legend")}
    >
      <span className="inline-flex items-center gap-2">
        <span className="h-3.5 w-3.5 rounded border border-hvac-heat/30 bg-hvac-heat/10" />
        {t("types.room")}
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-3.5 w-3.5 rounded border border-primary/25 bg-primary/10" />
        {t("types.zone")}
      </span>
    </div>
  );
}

type AssetTreeProps = {
  tree: AssetTreeNode[];
  canEdit?: boolean;
};

export function AssetTree({ tree, canEdit = false }: AssetTreeProps) {
  const { t } = useTranslation("assets");
  const buildings = findNodesByType(tree, "building");
  const cards = buildings.length > 0 ? buildings : tree;
  const organization = findNodesByType(tree, "org")[0];

  return (
    <div className="space-y-6">
      <ZonesLegend />

      <div className="space-y-5">
        {cards.map((building) => (
          <BuildingCard
            key={building.id}
            building={building}
            canEdit={canEdit}
          />
        ))}
      </div>

      {canEdit && organization && (
        <AddLink
          parentId={organization.id}
          type="building"
          label={t("overview.addBuilding")}
        />
      )}
    </div>
  );
}
