import { useMemo, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import type { Device } from "@gridone/sdk";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { deviceAttributes } from "@/lib/devices";
import type { Scalar } from "./conditions";
import type { PageNode, PresentationV1 } from "./document";
import { DeviceFace, type LoadedGlyphSet } from "./face";
import { cn } from "@/lib/utils";
import type { AttributeLike, DeviceUiRuntime } from "./runtime";
import { ControlPanel } from "./widgets/ControlPanel";
import { Measurements } from "./widgets/Measurements";
import { SetpointTable } from "./widgets/SetpointTable";
import { PresentationSection } from "./widgets/PresentationSection";

/**
 * Renders a validated v1 presentation document for a device: the page tree
 * of generic nodes, the shared command runtime behind every control and
 * face action, and a dedicated error boundary so a rendering failure falls
 * back to the standard content without losing the device frame.
 */

export type DevicePresentationProps = {
  document: PresentationV1;
  device: Device;
  runtime: DeviceUiRuntime;
  assetUrl: (assetId: string) => string | undefined;
  glyphSet: (glyphSetId: string) => LoadedGlyphSet | undefined;
  /** What to show when the presentation cannot render. */
  fallback: ReactNode;
  /**
   * The generic attribute panes an `attributes` node inserts; provided by
   * the page so this component stays independent of page-level views.
   */
  renderAttributes?: (options: { group?: string }) => ReactNode;
  onRenderError?: (error: Error) => void;
};

type PageContext = {
  document: PresentationV1;
  device: Device;
  runtime: DeviceUiRuntime;
  assetUrl: DevicePresentationProps["assetUrl"];
  glyphSet: DevicePresentationProps["glyphSet"];
  language: string;
  attributeLabel: ReturnType<typeof useAttributeLabel>;
  renderAttributes: DevicePresentationProps["renderAttributes"];
  /** Attribute behind a binding id, if the device has it. */
  attributeOf: (binding: string) => AttributeLike | null;
  /** Value reported by the device for a binding (measurements). */
  reported: (binding: string) => Scalar | null;
  /**
   * Value to display for a binding: the runtime's displayed value when a
   * control drives the attribute (so the face follows an intention while
   * it is sent), the reported value otherwise.
   */
  displayed: (binding: string) => Scalar | null;
};

export function DevicePresentation({
  document,
  device,
  runtime,
  assetUrl,
  glyphSet,
  fallback,
  renderAttributes,
  onRenderError,
}: DevicePresentationProps) {
  const { i18n } = useTranslation("devices");
  const attributeLabel = useAttributeLabel();
  const language = i18n.language;

  const context = useMemo<PageContext>(() => {
    const attributes = deviceAttributes(device) as Record<
      string,
      AttributeLike
    >;
    const attributeName = (binding: string) =>
      document.bindings[binding]?.attribute;
    const controlByAttribute = new Map<string, string>();
    for (const [id, control] of Object.entries(document.controls)) {
      const name = attributeName(control.binding);
      if (name && !controlByAttribute.has(name))
        controlByAttribute.set(name, id);
    }
    const reported = (binding: string): Scalar | null => {
      const name = attributeName(binding);
      return name ? runtime.reported(name) : null;
    };
    return {
      document,
      device,
      runtime,
      assetUrl,
      glyphSet,
      language,
      attributeLabel,
      renderAttributes,
      attributeOf: (binding) => {
        const name = attributeName(binding);
        return name ? (attributes[name] ?? null) : null;
      },
      reported,
      displayed: (binding) => {
        const name = attributeName(binding);
        const control = name ? controlByAttribute.get(name) : undefined;
        if (control) {
          return runtime.readControl(control)?.displayed ?? reported(binding);
        }
        return reported(binding);
      },
    };
  }, [
    document,
    device,
    runtime,
    assetUrl,
    glyphSet,
    language,
    attributeLabel,
    renderAttributes,
  ]);

  return (
    <ErrorBoundary
      fallbackRender={() => <>{fallback}</>}
      onError={(error) =>
        onRenderError?.(
          error instanceof Error ? error : new Error(String(error)),
        )
      }
      resetKeys={[document, device.id]}
    >
      <div key={device.id} data-testid="device-presentation">
        <PageNodeView node={document.page} context={context} />
      </div>
    </ErrorBoundary>
  );
}

function PageNodeView({
  node,
  context,
}: {
  node: PageNode;
  context: PageContext;
}) {
  switch (node.kind) {
    case "stack":
      return (
        <div className="space-y-6" data-node="stack">
          {node.children.map((child, index) => (
            <PageNodeView key={index} node={child} context={context} />
          ))}
        </div>
      );
    case "columns":
      return (
        <div
          className="grid gap-6 lg:[grid-template-columns:var(--columns)]"
          style={{
            ["--columns" as string]: node.items
              .map((item) => `minmax(0, ${item.weight}fr)`)
              .join(" "),
          }}
          data-node="columns"
        >
          {node.items.map((item, index) => (
            <div key={index} className="min-w-0">
              <div
                data-sticky={item.sticky || undefined}
                className={cn(
                  item.sticky &&
                    "lg:sticky lg:top-[5.5rem] lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto",
                )}
              >
                <PageNodeView node={item.content} context={context} />
              </div>
            </div>
          ))}
        </div>
      );
    case "section":
      return (
        <PresentationSection node={node} language={context.language}>
          <div className="space-y-6">
            {node.children.map((child, index) => (
              <PageNodeView key={index} node={child} context={context} />
            ))}
          </div>
        </PresentationSection>
      );
    case "attributes":
      return (
        <div data-node="attributes">
          {context.renderAttributes?.({ group: node.group }) ?? null}
        </div>
      );
    case "control-panel":
      return (
        <ControlPanel
          controls={node.controls}
          runtime={context.runtime}
          language={context.language}
        />
      );
    case "measurements":
      return (
        <Measurements
          items={node.items}
          layout={node.layout}
          reported={context.reported}
          attributeOf={context.attributeOf}
          attributeLabel={context.attributeLabel}
          language={context.language}
        />
      );
    case "setpoint-table":
      return (
        <SetpointTable
          rows={node.rows}
          runtime={context.runtime}
          reported={context.reported}
          attributeOf={context.attributeOf}
          language={context.language}
        />
      );
    case "device-face":
      return (
        <DeviceFace
          document={node}
          resolve={context.displayed}
          assetUrl={context.assetUrl}
          glyphSet={context.glyphSet}
          onAction={context.runtime.activate}
          canActivate={(action) => {
            const state = context.runtime.readControl(action.control);
            if (!state?.writable) return false;
            switch (action.op) {
              case "increment":
                return state.canIncrement;
              case "decrement":
                return state.canDecrement;
              case "toggle":
                return state.canToggle;
              case "cycle":
                return state.canCycle;
            }
          }}
          language={context.language}
        />
      );
  }
}
