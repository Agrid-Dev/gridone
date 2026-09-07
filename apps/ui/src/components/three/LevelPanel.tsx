import {
  useMemo,
  useRef,
  useState,
  type FC,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Map as MapIcon,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Device } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deviceTypeIcon } from "@/lib/deviceTypes";
import { cn } from "@/lib/utils";
import type { RoomState } from "./roomStates";
import { hslToCss } from "./temperature";
import { zoneTriplet, type ColorMode, type ViewerTheme } from "./themeColors";
import type { ViewerDepth } from "./useViewerState";
import { ViewerBreadcrumb } from "./ViewerBreadcrumb";
import { isEmptyResult, searchViewer } from "./viewerSearch";
import type { LevelSummary, ZoneSummary } from "./levelSummaries";

export type LevelPanelProps = {
  levels: LevelSummary[];
  /** The whole fleet: search reaches devices the model cannot place too. */
  devices: Device[];
  /** Live room states, which carry the space -> room asset join search needs. */
  roomStates: Map<string, RoomState>;
  theme: ViewerTheme;
  colorMode: ColorMode;
  expanded: boolean;
  /** Level currently isolated in the scene, or null when all are lit. */
  focusedLevelId: string | null;
  selectedZoneId: string | null;
  /** The isolated level is currently shown as a 2D floor plan. */
  planActive: boolean;
  onToggleExpanded: () => void;
  /** Pops the viewer back to a breadcrumb depth. */
  onGoToDepth: (depth: ViewerDepth) => void;
  onFocusLevel: (globalId: string | null) => void;
  onSelectZone: (globalId: string) => void;
  /** Fly to the device's room and point the room panel at that device. */
  onSelectDevice: (globalId: string, deviceId: string) => void;
  onTogglePlan: () => void;
};

/** The zone's colour under the active mode, the same one the scene paints. */
const ZoneDot: FC<{
  zone: ZoneSummary;
  theme: ViewerTheme;
  mode: ColorMode;
}> = ({ zone, theme, mode }) => (
  <span
    className="h-1.5 w-1.5 shrink-0 rounded-full"
    style={{ background: hslToCss(zoneTriplet(zone, theme, mode)) }}
    aria-hidden
  />
);

/**
 * One row of the panel: a zone under its unfolded level, or a search hit.
 *
 * `hit` marks it for the roving-focus walk over the results — arrow keys move
 * real DOM focus between rows, so Enter and Space activate natively and
 * assistive technology follows the cursor.
 */
const PanelRow: FC<{
  icon: ReactNode;
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  active?: boolean;
  hit?: boolean;
  /** Renders an anchor instead of a button — for a device with no room here. */
  to?: string;
  onActivate?: () => void;
}> = ({ icon, title, subtitle, aside, active, hit, to, onActivate }) => {
  const className = cn(
    "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary",
    active
      ? "bg-primary/15 ring-1 ring-inset ring-primary/40"
      : "hover:bg-accent/60",
  );
  const body = (
    <>
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate text-[11px]",
            active ? "font-semibold text-primary" : "text-foreground",
          )}
        >
          {title}
        </span>
        {subtitle && (
          <span className="truncate text-[10px] text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
      {aside}
    </>
  );
  return to ? (
    <Link data-hit={hit || undefined} to={to} className={className}>
      {body}
    </Link>
  ) : (
    <button
      data-hit={hit || undefined}
      type="button"
      className={className}
      onClick={onActivate}
      aria-current={active ? "true" : undefined}
    >
      {body}
    </button>
  );
};

/** Heading and rows of one search group. */
const SearchGroup: FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => (
  <li>
    <p className="px-1.5 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    <ul className="space-y-0.5">{children}</ul>
  </li>
);

/** Which floor a hit is on — the same tag for a zone and for a device's room. */
const LevelTag: FC<{ name: string }> = ({ name }) => (
  <span className="shrink-0 text-[10px] text-muted-foreground">{name}</span>
);

/**
 * Retractable navigator over the building's levels and zones. Collapses to a
 * rail of storey chips so it never eats the canvas on a narrow layout.
 *
 * Focusing a level is a *view* state (it isolates that storey in the scene);
 * picking a zone selects it, which opens the room panel and flies the camera.
 * A search box flattens every level into a flat hit list that flies on click
 * (or Enter, to the first hit).
 */
export const LevelPanel: FC<LevelPanelProps> = ({
  levels,
  devices,
  roomStates,
  theme,
  colorMode,
  expanded,
  focusedLevelId,
  selectedZoneId,
  planActive,
  onToggleExpanded,
  onGoToDepth,
  onFocusLevel,
  onSelectZone,
  onSelectDevice,
  onTogglePlan,
}) => {
  const { t } = useTranslation("home");
  // One level unfolded at a time keeps the panel short on tall buildings.
  const [openLevelId, setOpenLevelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // The breadcrumb names the level and the room the panel is already given.
  const focusedLevelName =
    levels.find((level) => level.globalId === focusedLevelId)?.name ?? null;
  const selectedZoneName = selectedZoneId
    ? (roomStates.get(selectedZoneId)?.name ?? null)
    : null;

  const results = useMemo(
    () => searchViewer({ levels, roomStates, devices, query: search }),
    [levels, roomStates, devices, search],
  );

  const hitRows = () =>
    Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-hit]") ?? [],
    );

  const focusRow = (index: number) => {
    const rows = hitRows();
    rows[Math.max(0, Math.min(index, rows.length - 1))]?.focus();
  };

  const clearSearch = () => {
    setSearch("");
    inputRef.current?.focus();
  };

  const handleInputKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRow(0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      hitRows()[0]?.click();
    } else if (event.key === "Escape" && search) {
      // Stops the viewer's window-level peel from closing the room panel
      // instead of clearing the box the operator is typing in.
      event.preventDefault();
      event.stopPropagation();
      setSearch("");
    }
  };

  const handleListKeys = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "Escape") {
      // Same guard as the input: `isEditableTarget` does not cover a button,
      // so without this the viewer's peel listener also fires.
      event.preventDefault();
      event.stopPropagation();
      clearSearch();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const index = hitRows().indexOf(event.target as HTMLElement);
    if (index === -1) {
      return;
    }
    if (event.key === "ArrowUp" && index === 0) {
      inputRef.current?.focus();
      return;
    }
    focusRow(index + (event.key === "ArrowDown" ? 1 : -1));
  };

  if (levels.length === 0) {
    return null;
  }

  const levelLabel = (level: LevelSummary): string =>
    [
      level.name,
      t("zonesByLevel.viewer.levelZones", { count: level.zoneCount }),
      level.alertCount > 0
        ? t("zonesByLevel.viewer.levelAlerts", { count: level.alertCount })
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <aside
      className={cn(
        "absolute left-3 top-3 z-10 flex max-h-[calc(100%-5rem)] flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur transition-[width] duration-200",
        expanded ? "w-56" : "w-11",
      )}
      aria-label={t("zonesByLevel.viewer.levels")}
    >
      <div className="flex items-center justify-between gap-1 border-b border-border/60 px-1.5 py-1.5">
        {expanded && (
          <span className="pl-1 text-xs font-semibold text-foreground">
            {t("zonesByLevel.viewer.levels")}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={t(
            expanded
              ? "zonesByLevel.viewer.collapsePanel"
              : "zonesByLevel.viewer.expandPanel",
          )}
        >
          {expanded ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Guarded on the same condition the breadcrumb uses, so an empty
          bordered strip never appears above the search box. */}
      {expanded && (focusedLevelName || selectedZoneName) && (
        <div className="border-b border-border/60">
          <ViewerBreadcrumb
            levelName={focusedLevelName}
            roomName={selectedZoneName}
            planActive={planActive}
            onGoTo={onGoToDepth}
          />
        </div>
      )}

      {expanded && (
        <div className="relative border-b border-border/60 p-1.5">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={inputRef}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={handleInputKeys}
            placeholder={t("zonesByLevel.viewer.searchPlaceholder")}
            aria-label={t("zonesByLevel.viewer.searchPlaceholder")}
            className="h-8 pl-8 pr-8 text-xs"
          />
          {search && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={clearSearch}
              aria-label={t("zonesByLevel.viewer.searchClear")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {expanded && results !== null ? (
        <ul
          ref={listRef}
          onKeyDown={handleListKeys}
          className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5"
        >
          {results.zones.length > 0 && (
            <SearchGroup label={t("zonesByLevel.viewer.searchGroups.zones")}>
              {results.zones.map(({ zone, levelName }) => (
                <li key={zone.globalId}>
                  <PanelRow
                    hit
                    icon={
                      <ZoneDot zone={zone} theme={theme} mode={colorMode} />
                    }
                    title={zone.name}
                    aside={<LevelTag name={levelName} />}
                    active={zone.globalId === selectedZoneId}
                    onActivate={() => onSelectZone(zone.globalId)}
                  />
                </li>
              ))}
            </SearchGroup>
          )}

          {results.devices.length > 0 && (
            <SearchGroup label={t("zonesByLevel.viewer.searchGroups.devices")}>
              {results.devices.map(
                ({ device, globalId, roomName, levelName }) => {
                  const Icon = deviceTypeIcon(device.type) ?? Cpu;
                  return (
                    <li key={device.id}>
                      <PanelRow
                        hit
                        icon={
                          <Icon
                            className="h-3 w-3 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        }
                        title={device.name || device.id}
                        subtitle={roomName}
                        aside={<LevelTag name={levelName} />}
                        onActivate={() => onSelectDevice(globalId, device.id)}
                      />
                    </li>
                  );
                },
              )}
            </SearchGroup>
          )}

          {/* Devices the model cannot place: linked to a floor, the building
              or nothing at all. They have no room to fly to, so they link out
              rather than dead-clicking. */}
          {results.offModel.length > 0 && (
            <SearchGroup label={t("zonesByLevel.viewer.searchGroups.offModel")}>
              {results.offModel.map((device) => {
                const Icon = deviceTypeIcon(device.type) ?? Cpu;
                return (
                  <li key={device.id}>
                    <PanelRow
                      hit
                      icon={
                        <Icon
                          className="h-3 w-3 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      }
                      title={device.name || device.id}
                      aside={
                        <ArrowUpRight
                          className="h-3 w-3 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      }
                      to={`/devices/${device.id}`}
                    />
                  </li>
                );
              })}
            </SearchGroup>
          )}

          {results.overflow > 0 && (
            <li className="px-1.5 py-1 text-[10px] text-muted-foreground">
              {t("zonesByLevel.viewer.searchMore", { count: results.overflow })}
            </li>
          )}
          {isEmptyResult(results) && (
            <li className="px-1.5 py-2 text-[11px] text-muted-foreground">
              {t("zonesByLevel.viewer.searchNoResults")}
            </li>
          )}
        </ul>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
          {levels.map((level) => {
            const focused = level.globalId === focusedLevelId;
            const open = expanded && level.globalId === openLevelId;
            return (
              <li key={level.globalId}>
                {expanded ? (
                  <div
                    className={cn(
                      "flex items-center gap-0.5 rounded-md transition-colors",
                      focused ? "bg-primary/10" : "hover:bg-accent/60",
                    )}
                  >
                    <button
                      type="button"
                      className="flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setOpenLevelId(open ? null : level.globalId)
                      }
                      aria-expanded={open}
                      aria-label={t("zonesByLevel.viewer.toggleZones", {
                        level: level.name,
                      })}
                    >
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 transition-transform duration-200",
                          open && "rotate-90",
                        )}
                      />
                    </button>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md py-1.5 pr-2 text-left"
                      onClick={() =>
                        onFocusLevel(focused ? null : level.globalId)
                      }
                      aria-pressed={focused}
                      aria-label={levelLabel(level)}
                    >
                      <span
                        className={cn(
                          "truncate text-xs font-medium",
                          focused ? "text-primary" : "text-foreground",
                        )}
                      >
                        {level.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {level.alertCount > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] font-semibold tabular-nums text-status-error">
                            <TriangleAlert className="h-3 w-3" aria-hidden />
                            {level.alertCount}
                          </span>
                        )}
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {level.zoneCount}
                        </span>
                      </span>
                    </button>
                    {focused && (
                      <button
                        type="button"
                        className={cn(
                          "flex h-7 w-6 shrink-0 items-center justify-center rounded-md",
                          planActive
                            ? "text-primary"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        onClick={onTogglePlan}
                        aria-pressed={planActive}
                        aria-label={t("zonesByLevel.viewer.planOpen", {
                          level: level.name,
                        })}
                      >
                        <MapIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    className={cn(
                      "relative flex h-7 w-8 items-center justify-center rounded-md text-[11px] font-medium tabular-nums transition-colors",
                      focused
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                    onClick={() =>
                      onFocusLevel(focused ? null : level.globalId)
                    }
                    aria-pressed={focused}
                    aria-label={levelLabel(level)}
                  >
                    {level.short}
                    {level.alertCount > 0 && (
                      <span
                        className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-status-error"
                        aria-hidden
                      />
                    )}
                  </button>
                )}

                {open && (
                  <ul className="mt-0.5 space-y-0.5 pl-6 duration-200 animate-in fade-in slide-in-from-top-1">
                    {level.zones.map((zone) => (
                      <li key={zone.globalId}>
                        <PanelRow
                          icon={
                            <ZoneDot
                              zone={zone}
                              theme={theme}
                              mode={colorMode}
                            />
                          }
                          title={zone.name}
                          aside={
                            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                              {zone.temperature != null
                                ? `${zone.temperature.toFixed(1)}°`
                                : "—"}
                            </span>
                          }
                          active={zone.globalId === selectedZoneId}
                          onActivate={() => onSelectZone(zone.globalId)}
                        />
                      </li>
                    ))}
                    {level.zones.length === 0 && (
                      <li className="px-1.5 py-1 text-[11px] text-muted-foreground">
                        {t("zonesByLevel.viewer.noZones")}
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
};
