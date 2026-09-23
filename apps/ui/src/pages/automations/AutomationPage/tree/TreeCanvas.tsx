import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Maximize, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5];
const MIN_READABLE = 0.6;

/** The closest step to `zoom` in `direction`, so +/− always move one notch. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const steps = direction > 0 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse();
  return (
    steps.find((step) =>
      direction > 0 ? step > zoom + 0.001 : step < zoom - 0.001,
    ) ?? zoom
  );
}

/** The zoom at which `content` fits `viewport`, never above 100 % nor below 40 %. */
export function fitZoom(
  content: { width: number; height: number },
  viewport: { width: number; height: number },
): number {
  if (!content.width || !content.height) return 1;
  const ratio = Math.min(
    viewport.width / content.width,
    viewport.height / content.height,
  );
  return Math.max(0.4, Math.min(1, Math.floor(ratio * 100) / 100));
}

/**
 * The scrollable, zoomable surface the tree is drawn on. Zoom is a CSS
 * transform, so the tree keeps its layout sizes (its forks measure lanes in
 * layout pixels); a sizer around it gives the scroll area the zoomed size.
 */
export function TreeCanvas({
  children,
  banner,
  onBackgroundClick,
  label,
}: {
  children: ReactNode;
  banner?: ReactNode;
  onBackgroundClick?: () => void;
  label: string;
}) {
  const { t } = useTranslation("automations");
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const fitted = useRef(false);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () =>
      setSize((current) =>
        current.width === content.offsetWidth &&
        current.height === content.offsetHeight
          ? current
          : { width: content.offsetWidth, height: content.offsetHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setZoom(
      fitZoom(size, {
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      }),
    );
  }, [size]);

  // Open fitted when the tree overflows, as long as it stays readable.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (fitted.current || !viewport || !size.width || !viewport.clientWidth)
      return;
    fitted.current = true;
    if (size.width > viewport.clientWidth)
      setZoom(
        Math.max(
          MIN_READABLE,
          fitZoom(size, { width: viewport.clientWidth, height: Infinity }),
        ),
      );
  }, [size]);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-muted/30">
      {banner}
      <div
        ref={viewportRef}
        role="region"
        aria-label={label}
        onClick={onBackgroundClick}
        className="bg-grid min-h-0 flex-1 overflow-auto"
      >
        <div
          className="relative mx-auto"
          style={{ width: size.width * zoom, height: size.height * zoom }}
        >
          <div
            ref={contentRef}
            className="absolute left-0 top-0 w-max origin-top-left p-10"
            style={{ transform: `scale(${zoom})` }}
          >
            {children}
          </div>
        </div>
      </div>
      <div className="absolute bottom-4 right-4 flex items-center gap-2">
        <div
          role="group"
          aria-label={t("tree.zoom.label")}
          className="flex items-center rounded-lg border bg-card shadow-sm"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t("tree.zoom.out")}
            disabled={zoom <= ZOOM_STEPS[0]}
            onClick={() => setZoom((value) => stepZoom(value, -1))}
          >
            <Minus aria-hidden />
          </Button>
          <span className="min-w-12 text-center text-xs font-semibold tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)} %
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t("tree.zoom.in")}
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            onClick={() => setZoom((value) => stepZoom(value, 1))}
          >
            <Plus aria-hidden />
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-card shadow-sm"
          onClick={fit}
        >
          <Maximize aria-hidden />
          {t("tree.zoom.fit")}
        </Button>
      </div>
    </div>
  );
}
