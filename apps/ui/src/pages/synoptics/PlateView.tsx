import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Scan,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Fluid, Projection, Synoptic, SymbolElement } from "@gridone/sdk";
import {
  DEFAULT_PROJECTION,
  humanize,
  SynopticRenderer,
  type PlateHandle,
  type SymbolState,
} from "@/components/synoptic";
import type { View } from "@/components/synoptic/hooks/useViewport";
import { ZOOM_STEP } from "@/components/synoptic/hooks/useViewport";
import {
  symbolSlotKey,
  truthOf,
  type SynopticValues,
} from "@/components/synoptic/values";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { DevicePopover } from "./DevicePopover";
import { PlateLegend } from "./PlateLegend";
import { SymbolNav, type NavEntry } from "./SymbolNav";

type PlateViewProps = {
  doc: Synoptic;
  values: SynopticValues;
  knownSynoptics: ReadonlySet<string>;
  /** A link on the plate was activated. */
  onNavigate: (synopticId: string) => void;
};

/** Where a popover's anchor sits over the plate, in the plate's own box. */
type AnchorRect = { left: number; top: number; width: number; height: number };

/** How far a symbol is zoomed in when the panel locates it. */
const FOCUS_SCALE = 2;

/** The run state a symbol shows: none once the reading is old. */
const stateOf = (
  values: SynopticValues,
  symbol: SymbolElement,
): SymbolState | undefined => {
  const reading = values.slots[symbolSlotKey(symbol.id, "state")];
  if (!reading || reading.stale) return undefined;
  const on = truthOf(reading.raw);
  return on === undefined ? undefined : on ? "on" : "off";
};

/**
 * A plate with its chrome: the toolbar (plan or isometric view, zoom, fit,
 * full screen), the navigation panel that locates an equipment, the
 * legend, and the popover a device symbol opens on the plate. The view
 * is the operator's alone: switching projection changes nothing in the
 * stored document.
 */
export const PlateView: FC<PlateViewProps> = ({
  doc,
  values,
  knownSynoptics,
  onNavigate,
}) => {
  const { t } = useTranslation("synoptics");
  const plate = useRef<PlateHandle | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [projection, setProjection] = useState<Projection>(
    doc.projection ?? DEFAULT_PROJECTION,
  );
  // The page header already names the plate: its drawn title would say it
  // twice.
  const viewDoc = useMemo(
    () => ({
      ...doc,
      projection,
      labels: doc.labels?.filter((label) => label.role !== "title"),
    }),
    [doc, projection],
  );
  const [zoom, setZoom] = useState(1);
  const [viewTick, setViewTick] = useState(0);
  const [selected, setSelected] = useState<SymbolElement | null>(null);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const fluids = useMemo(
    () => new Set<Fluid>((doc.pipes ?? []).map((pipe) => pipe.fluid)),
    [doc],
  );
  const entries = useMemo<NavEntry[]>(
    () =>
      (doc.symbols ?? [])
        .filter((symbol) => symbol.label)
        .map((symbol) => ({
          symbol,
          name: symbol.label!,
          type: humanize(symbol.type),
          state: stateOf(values, symbol),
          faulty:
            !!symbol.device_id && !!values.faultyDevices[symbol.device_id],
          device: !!symbol.device_id,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [doc, values],
  );

  const onViewChange = useCallback((view: View) => {
    setZoom(view.scale);
    setViewTick((tick) => tick + 1);
  }, []);

  // The popover's anchor follows its symbol through every pan and zoom.
  useEffect(() => {
    if (!selected) {
      setAnchor(null);
      return;
    }
    const rect = plate.current?.symbolClientRect(selected.id);
    const frame = canvas.current?.getBoundingClientRect();
    if (!rect || !frame) return;
    setAnchor({
      left: rect.left - frame.left,
      top: rect.top - frame.top,
      width: rect.width,
      height: rect.height,
    });
  }, [selected, viewTick, projection]);

  // The renderer only reports a device symbol or a link whose target exists.
  const onSymbolClick = useCallback(
    (symbol: SymbolElement) => {
      if (symbol.type === "link") {
        onNavigate(String(symbol.props?.synoptic_id));
      } else if (symbol.device_id) {
        setSelected(symbol);
      }
    },
    [onNavigate],
  );
  const onSymbolHover = useCallback(
    (symbol: SymbolElement | null) => setHighlight(symbol?.id ?? null),
    [],
  );
  const locate = useCallback((entry: NavEntry) => {
    plate.current?.focusSymbol(entry.symbol.id, FOCUS_SCALE);
    setHighlight(entry.symbol.id);
    if (entry.device) setSelected(entry.symbol);
  }, []);

  useEffect(() => {
    const onChange = () =>
      setFullscreen(
        !!document.fullscreenElement &&
          document.fullscreenElement === container.current,
      );
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    const el = container.current;
    if (!el) return;
    // Only the card's own full screen is left; another element's is not
    // this button's to end.
    if (document.fullscreenElement === el) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const projectionButton = (value: Projection, label: string) => (
    <Button
      type="button"
      size="sm"
      variant={projection === value ? "secondary" : "ghost"}
      aria-pressed={projection === value}
      onClick={() => setProjection(value)}
    >
      {label}
    </Button>
  );

  return (
    <div
      ref={container}
      data-plate-view
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border bg-card",
        fullscreen ? "h-screen w-screen rounded-none" : "h-[40rem]",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-pressed={navOpen}
          aria-label={navOpen ? t("nav.hide") : t("nav.toggle")}
          onClick={() => setNavOpen((open) => !open)}
        >
          {navOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </Button>
        <div className="flex items-center gap-1">
          <div
            role="group"
            aria-label={t("view.projection")}
            className="mr-2 flex items-center gap-0.5 rounded-md border border-border p-0.5"
          >
            {projectionButton("flat", t("view.plan"))}
            {projectionButton("isometric", t("view.isometric"))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label={t("view.zoomOut")}
            onClick={() => plate.current?.zoomBy(1 / ZOOM_STEP)}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span
            className="w-12 text-center text-xs tabular-nums text-muted-foreground"
            aria-live="polite"
            aria-label={t("view.zoom", { percent: Math.round(zoom * 100) })}
          >
            {Math.round(zoom * 100)} %
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label={t("view.zoomIn")}
            onClick={() => plate.current?.zoomBy(ZOOM_STEP)}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => plate.current?.fit()}
          >
            <Scan className="mr-1 h-4 w-4" />
            {t("view.fit")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label={
              fullscreen ? t("view.exitFullscreen") : t("view.fullscreen")
            }
            aria-pressed={fullscreen}
            onClick={toggleFullscreen}
          >
            {fullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {navOpen && (
          <SymbolNav
            entries={entries}
            highlightId={highlight}
            onHover={setHighlight}
            onSelect={locate}
          />
        )}
        <div ref={canvas} className="relative min-w-0 flex-1 overflow-hidden">
          <SynopticRenderer
            doc={viewDoc}
            values={values}
            knownSynoptics={knownSynoptics}
            onSymbolClick={onSymbolClick}
            onSymbolHover={onSymbolHover}
            highlightId={highlight}
            plateRef={plate}
            onViewChange={onViewChange}
            touchAction={fullscreen ? "none" : "pan-y"}
          />
          <Popover
            open={selected !== null}
            onOpenChange={(open) => {
              if (!open) setSelected(null);
            }}
          >
            <PopoverAnchor asChild>
              <div
                aria-hidden
                className="pointer-events-none absolute"
                style={anchor ?? { left: 0, top: 0, width: 0, height: 0 }}
              />
            </PopoverAnchor>
            <PopoverContent
              side="right"
              align="start"
              collisionPadding={8}
              className="w-auto p-3"
            >
              {selected && (
                <DevicePopover
                  key={selected.id}
                  symbol={selected}
                  values={values}
                  onClose={() => setSelected(null)}
                />
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="border-t border-border px-3 py-1.5">
        <PlateLegend fluids={fluids} />
      </div>
    </div>
  );
};
