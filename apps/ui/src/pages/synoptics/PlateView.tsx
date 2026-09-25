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
  BookOpen,
  FileDown,
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
  SynopticRenderer,
  type PlateHandle,
} from "@/components/synoptic";
import type { View } from "@/components/synoptic/hooks/useViewport";
import { ZOOM_STEP } from "@/components/synoptic/hooks/useViewport";
import type { SynopticValues } from "@/components/synoptic/values";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  readLegendOpen,
  readNavOpen,
  writeLegendOpen,
  writeNavOpen,
} from "@/lib/synopticPreference";
import { cn } from "@/lib/utils";
import { DevicePopover } from "./DevicePopover";
import { PlateLegend } from "./PlateLegend";
import { PlatePrintSheet } from "./PlatePrintSheet";
import { SymbolNav, type NavEntry } from "./SymbolNav";
import { usePlateEntries } from "./usePlateEntries";
import { usePlateVocabulary } from "./usePlateVocabulary";
import { usePrintSheet } from "./usePrintSheet";

type PlateViewProps = {
  doc: Synoptic;
  values: SynopticValues;
  knownSynoptics: ReadonlySet<string>;
  /** A link on the plate was activated. */
  onNavigate: (synopticId: string) => void;
  /** Sizes the card: the page gives it the rest of the first screen. */
  className?: string;
};

/** The least the plate's text shows on screen, in px: zoomed out below
 *  it, the text is held at this size and what no longer fits gives way
 *  (Decision 25 of the visual language). */
export const MIN_TEXT_PX = 12;

/** Where a popover's anchor sits over the plate, in the plate's own box. */
type AnchorRect = { left: number; top: number; width: number; height: number };

/**
 * A plate with its chrome: the toolbar (the equipment list, plan or
 * isometric view, zoom, fit, the legend, the PDF, full screen), the list
 * beside the drawing that locates an equipment (open unless folded, and
 * remembered), the legend folded over the foot of the drawing, and the
 * popover a device symbol opens on the plate. The view is the operator's
 * alone: switching projection changes nothing in the stored document.
 * Printing (the PDF button or the browser's own) lays the plate out on a
 * sheet of its own.
 */
export const PlateView: FC<PlateViewProps> = ({
  doc,
  values,
  knownSynoptics,
  onNavigate,
  className,
}) => {
  const { t } = useTranslation("synoptics");
  const vocabulary = usePlateVocabulary();
  const plate = useRef<PlateHandle | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const printing = usePrintSheet();
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
  // The popover has no trigger to hand focus back to: it returns to what
  // held it when the points opened (a symbol, a row of the list).
  const returnFocus = useRef<Element | null>(null);
  const open = useCallback((symbol: SymbolElement) => {
    returnFocus.current = document.activeElement;
    setSelected(symbol);
  }, []);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [legendOpen, setLegendOpen] = useState(readLegendOpen);
  const [navOpen, setNavOpen] = useState(readNavOpen);
  const entries = usePlateEntries(doc, values, vocabulary);
  const [highlight, setHighlight] = useState<string | null>(null);
  // The symbol last located from the list: it stays ringed once the
  // pointer or the focus has left its row, until another is located.
  const [located, setLocated] = useState<string | null>(null);
  const ringed = highlight ?? located;
  const [fullscreen, setFullscreen] = useState(false);

  const fluids = useMemo(
    () => new Set<Fluid>((doc.pipes ?? []).map((pipe) => pipe.fluid)),
    [doc],
  );
  // The fluid only ever moves on a plate that says what sets it going.
  const flows = useMemo(
    () => (doc.pipes ?? []).some((pipe) => pipe.flow),
    [doc],
  );
  // The types the legend's symbol key explains: those the plate draws.
  const types = useMemo(
    () => new Set<string>((doc.symbols ?? []).map((symbol) => symbol.type)),
    [doc],
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
    // No rectangle (the symbol left the document, or no layout yet): the
    // last anchor would leave the popover floating where the symbol was.
    if (!rect || !frame) {
      setAnchor(null);
      return;
    }
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
        open(symbol);
      }
    },
    [onNavigate, open],
  );
  const onSymbolHover = useCallback(
    (symbol: SymbolElement | null) => setHighlight(symbol?.id ?? null),
    [],
  );
  const locate = useCallback(
    (entry: NavEntry) => {
      plate.current?.focusSymbol(entry.symbol.id);
      setLocated(entry.symbol.id);
      if (entry.device) open(entry.symbol);
    },
    [open],
  );

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
  const toggleNav = () => {
    writeNavOpen(!navOpen);
    setNavOpen(!navOpen);
  };
  const toggleLegend = () => {
    writeLegendOpen(!legendOpen);
    setLegendOpen(!legendOpen);
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
        fullscreen ? "h-screen w-screen rounded-none" : className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-pressed={navOpen}
            aria-label={navOpen ? t("nav.hide") : t("nav.toggle")}
            onClick={toggleNav}
          >
            {navOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>
          <div
            role="group"
            aria-label={t("view.projection")}
            className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
          >
            {projectionButton("flat", t("view.plan"))}
            {projectionButton("isometric", t("view.isometric"))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
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
            variant={legendOpen ? "secondary" : "outline"}
            size="sm"
            className="h-8"
            aria-pressed={legendOpen}
            onClick={toggleLegend}
          >
            <BookOpen className="mr-1 h-4 w-4" />
            {t("view.legend")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            aria-label={t("view.exportPdf")}
            title={t("view.exportPdf")}
            onClick={() => window.print()}
          >
            <FileDown className="mr-1 h-4 w-4" />
            {t("view.pdf")}
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
            highlightId={ringed}
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
            highlightId={ringed}
            vocabulary={vocabulary}
            plateRef={plate}
            onViewChange={onViewChange}
            minTextPx={MIN_TEXT_PX}
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
              onCloseAutoFocus={(event) => {
                const back = returnFocus.current;
                if (back instanceof HTMLElement || back instanceof SVGElement) {
                  if (back.isConnected) {
                    event.preventDefault();
                    back.focus();
                  }
                }
              }}
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
                  vocabulary={vocabulary}
                  onClose={() => setSelected(null)}
                />
              )}
            </PopoverContent>
          </Popover>
          {legendOpen && (
            <div
              data-plate-legend
              className="absolute inset-x-0 bottom-0 max-h-[50%] overflow-y-auto border-t border-border bg-card/95 px-3 py-2 backdrop-blur-sm"
            >
              <PlateLegend
                fluids={fluids}
                types={types}
                vocabulary={vocabulary}
                circulating={flows && projection === "isometric"}
              />
            </div>
          )}
        </div>
      </div>
      {printing && (
        <PlatePrintSheet
          doc={viewDoc}
          name={doc.name}
          description={doc.description}
          projection={projection}
          values={values}
          knownSynoptics={knownSynoptics}
          vocabulary={vocabulary}
          fluids={fluids}
          types={types}
        />
      )}
    </div>
  );
};
