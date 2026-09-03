import { useEffect, useRef, useState } from "react";
import { Building2, CornerDownRight, Layers3, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { AssetUsage } from "@gridone/sdk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ASSET_USAGES,
  canCarryUsage,
  usageCapableIdsUnder,
  type AssetTreeNode,
  type SelectionState,
} from "@/lib/assets";
import type { AssetSelection } from "@/hooks/useAssetSelection";
import { UsageBadge } from "./UsageBadge";

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
  const link = (
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

  if (!compact) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Native checkbox with the third state a select-all shortcut needs.
 *  `indeterminate` is a DOM property, not an attribute, hence the ref. */
function TreeCheckbox({
  state,
  label,
  disabled = false,
  onToggle,
}: {
  state: SelectionState;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={state === "all"}
      disabled={disabled}
      onChange={onToggle}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

/** The checkbox standing for `node`'s subtree, or nothing outside bulk mode.
 *  A node with no room or zone beneath it gets a disabled box: there is
 *  nothing it could select. */
function SelectionBox({
  node,
  selection,
}: {
  node: AssetTreeNode;
  selection?: AssetSelection;
}) {
  const { t } = useTranslation("assets");
  if (!selection) return null;
  const selectable = usageCapableIdsUnder(node).length;
  // A floor or building only ever stands for what lies beneath it; a leaf
  // room or zone stands for itself.
  const standsForItself =
    canCarryUsage(node.type) && node.children.length === 0;
  const labelKey = standsForItself ? "selection.select" : "selection.selectAll";

  return (
    <TreeCheckbox
      state={selection.stateOf(node)}
      disabled={selectable === 0}
      label={t(labelKey, { name: node.name })}
      onToggle={() => selection.toggle(node)}
    />
  );
}

/** Value of the toolbar item that clears the usage: Radix reserves `""`. */
const CLEAR_USAGE = "__clear__";

function UsageToolbar({
  count,
  isPending,
  onApply,
  onClear,
}: {
  count: number;
  isPending: boolean;
  onApply: (usage: AssetUsage | null) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation("assets");
  const [choice, setChoice] = useState("");
  const chosenUsage = ASSET_USAGES.find((usage) => usage === choice) ?? null;

  return (
    <div
      role="region"
      aria-label={t("selection.count", { count })}
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3"
    >
      <span
        className="text-sm font-semibold text-foreground"
        aria-live="polite"
      >
        {t("selection.count", { count })}
      </span>
      <Select value={choice} onValueChange={setChoice} disabled={isPending}>
        <SelectTrigger className="h-9 w-56" aria-label={t("fields.usage")}>
          <SelectValue placeholder={t("selection.usagePlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CLEAR_USAGE}>
            <span className="opacity-70">{t("fields.usageNone")}</span>
          </SelectItem>
          {ASSET_USAGES.map((usage) => (
            <SelectItem key={usage} value={usage}>
              {t(`usages.${usage}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        disabled={choice === "" || isPending}
        onClick={() => onApply(chosenUsage)}
      >
        {t("selection.apply")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={onClear}
      >
        {t("selection.clear")}
      </Button>
    </div>
  );
}

/** The sub-zones of a zone, listed with their own device counts. Shown on
 *  hover or focus of the pill: a floor holds a dozen zones, so nesting them
 *  all inline turns the row into a wall — the count stays on the pill and the
 *  detail comes on demand. */
function SubzoneList({ node }: { node: AssetTreeNode }) {
  const { t } = useTranslation("assets");

  return (
    <div className="min-w-48 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("overview.subzoneCount", { count: node.children.length })}
      </p>
      <ul className="space-y-1">
        {node.children.map((child) => (
          <li key={child.id} className="flex items-center gap-4 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 font-medium">
              <CornerDownRight
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="truncate">{child.name}</span>
            </span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {t("overview.deviceCount", { count: countDevices(child) })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ZonePill({
  node,
  canEdit,
  selection,
}: {
  node: AssetTreeNode;
  canEdit: boolean;
  selection?: AssetSelection;
}) {
  const { t } = useTranslation("assets");
  const subzones = node.children.length;
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
      <UsageBadge usage={node.usage} className="px-2 py-0 text-[11px]" />
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
      {subzones > 0 && (
        <>
          <span
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-1.5 py-0.5 text-xs font-semibold"
            aria-hidden="true"
          >
            <CornerDownRight className="h-3 w-3" />
            {subzones}
          </span>
          <span className="sr-only">
            {t("overview.subzoneCount", { count: subzones })}
          </span>
        </>
      )}
    </Link>
  );

  // The padding (cancelled by the negative margin) pulls the add button inside
  // the group's own box: a button that sat outside it would lose `group-hover`
  // the moment the pointer moved onto it, and vanish mid-click.
  return (
    <span className="inline-flex items-center gap-2">
      <SelectionBox node={node} selection={selection} />
      <span className="group relative -m-1.5 inline-flex p-1.5">
        {subzones > 0 ? (
          // Shorter than the app-wide delay: this card is the way sub-zones are
          // read, not an afterthought hint about a control.
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>{pill}</TooltipTrigger>
            <TooltipContent align="start" className="px-3 py-2.5">
              <SubzoneList node={node} />
            </TooltipContent>
          </Tooltip>
        ) : (
          pill
        )}
        {canEdit && (
          <Link
            to={createHref(node.id, "zone")}
            aria-label={t("overview.addSubzoneTo", { name: node.name })}
            className="pointer-events-none absolute right-0 top-0 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
          >
            <Plus className="h-3 w-3" />
          </Link>
        )}
      </span>
    </span>
  );
}

function FloorRow({
  floor,
  canEdit,
  selection,
}: {
  floor: AssetTreeNode;
  canEdit: boolean;
  selection?: AssetSelection;
}) {
  const { t } = useTranslation("assets");
  const zoneCount = countZones(floor);
  const deviceCount = countDevices(floor);

  return (
    <article className="grid gap-4 rounded-xl px-3 py-4 transition-colors hover:bg-accent/65 focus-within:bg-accent/65 sm:grid-cols-[9rem_minmax(0,1fr)] lg:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="flex min-w-0 items-start gap-2.5">
        <SelectionBox node={floor} selection={selection} />
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
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {floor.children.map((child) => (
          <ZonePill
            key={child.id}
            node={child}
            canEdit={canEdit}
            selection={selection}
          />
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
  selection,
}: {
  building: AssetTreeNode;
  canEdit: boolean;
  selection?: AssetSelection;
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
          <SelectionBox node={building} selection={selection} />
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
          <FloorRow
            key={floor.id}
            floor={floor}
            canEdit={canEdit}
            selection={selection}
          />
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
                <ZonePill
                  key={zone.id}
                  node={zone}
                  canEdit={canEdit}
                  selection={selection}
                />
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
  /** Bulk classification. With a selection and a committer, every row gets a
   *  checkbox — floor and building ones select everything beneath them — and
   *  a toolbar sends the ticked room and zone ids through `onSetUsage`. */
  selection?: AssetSelection;
  onSetUsage?: (assetIds: string[], usage: AssetUsage | null) => void;
  isSettingUsage?: boolean;
};

export function AssetTree({
  tree,
  canEdit = false,
  selection,
  onSetUsage,
  isSettingUsage = false,
}: AssetTreeProps) {
  const { t } = useTranslation("assets");
  const buildings = findNodesByType(tree, "building");
  const cards = buildings.length > 0 ? buildings : tree;
  const organization = findNodesByType(tree, "org")[0];
  const bulk =
    canEdit && selection && onSetUsage ? { selection, onSetUsage } : undefined;

  return (
    <div className="space-y-6">
      <ZonesLegend />

      {bulk && bulk.selection.count > 0 && (
        <UsageToolbar
          count={bulk.selection.count}
          isPending={isSettingUsage}
          onApply={(usage) =>
            bulk.onSetUsage([...bulk.selection.selectedIds], usage)
          }
          onClear={bulk.selection.clear}
        />
      )}

      <div className="space-y-5">
        {cards.map((building) => (
          <BuildingCard
            key={building.id}
            building={building}
            canEdit={canEdit}
            selection={bulk?.selection}
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
