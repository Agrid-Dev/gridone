import { useMemo, type FC, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import {
  isNotFound,
  type ActiveCondition,
  type ControlPanelAttribute,
  type ControlPanelSection,
  type ControlPanelWidgetConfig,
  type Device,
} from "@gridone/sdk";
import { AttributeValue } from "@/components/AttributeValue";
import { SeverityChip } from "@/components/SeverityChip";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDeviceControlRuntime } from "@/components/device-ui/runtime";
import {
  ControlFeedback,
  WriteStateIndicator,
} from "@/components/device-ui/widgets/ControlPanel";
import { usePermissions } from "@/contexts/AuthContext";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { useDevice } from "@/hooks/useDevice";
import { deviceAttributes } from "@/lib/devices";
import { isFaultAttribute, type AttributeFields } from "@/lib/faults";
import { cn } from "@/lib/utils";
import { sectionActivity } from "./controlPanelSection";

const Message: FC<{ children: string }> = ({ children }) => (
  <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

/** Why a section's controls are disabled, in words for the operator. */
type SectionLock = { reason: string };

/**
 * Boolean attributes picked across devices, grouped into sections. A fault
 * reads as a fault, a writable attribute as a switch, anything else as a
 * state — decided from each attribute's own contract, never from the config.
 *
 * Live-only, like the device control widget: values come from the
 * `["device", id]` cache the WebSocket feeds, so the dashboard period is
 * never consulted. Writes take the same preview / confirmation path as the
 * device page and need the same permission.
 */
export const ControlPanelWidgetView: FC<{ config: unknown }> = ({ config }) => {
  const { t } = useTranslation("dashboards");
  const { sections } = config as Partial<ControlPanelWidgetConfig>;
  if (!sections?.length)
    return <Message>{t("widgets.controlPanel.empty")}</Message>;
  return (
    <div className="h-full divide-y divide-border overflow-y-auto">
      {sections.map((section, index) => (
        <Section key={index} section={section} />
      ))}
    </div>
  );
};

/** The lock a section's condition puts on its controls; null while active. */
function useSectionLock(
  condition: ActiveCondition | null | undefined,
): SectionLock | null {
  const { t } = useTranslation("dashboards");
  const { data: device } = useDevice(condition?.device_id || undefined);
  const reading =
    device && condition
      ? deviceAttributes(device)[condition.attribute]?.current_value
      : undefined;
  const activity = sectionActivity(condition, reading);
  if (activity === "active") return null;
  if (activity === "unknown")
    return { reason: t("widgets.controlPanel.conditionUnavailable") };
  return {
    reason:
      condition?.inactive_reason ?? t("widgets.controlPanel.inactiveReason"),
  };
}

const Section: FC<{ section: ControlPanelSection }> = ({ section }) => {
  const { t } = useTranslation("dashboards");
  const lock = useSectionLock(section.active_when);
  return (
    <section
      aria-label={section.title ?? undefined}
      data-active={lock === null}
      className="py-1.5"
    >
      {(section.title || lock) && (
        <header className="flex items-center justify-between gap-2 px-3 py-1">
          <h3
            className={cn(
              "min-w-0 truncate text-xs font-semibold uppercase tracking-wide",
              lock ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {section.title}
          </h3>
          {lock && (
            <LockHint lock={lock}>
              <span
                tabIndex={0}
                role="img"
                aria-label={t("widgets.controlPanel.inactive")}
                className="shrink-0 rounded-sm text-muted-foreground"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden />
              </span>
            </LockHint>
          )}
        </header>
      )}
      <ul>
        {(section.attributes ?? []).map((item, index) => (
          <Row key={index} item={item} lock={lock} />
        ))}
      </ul>
    </section>
  );
};

/** Says why on hover or focus of whatever the lock disabled. */
const LockHint: FC<{ lock: SectionLock; children: ReactNode }> = ({
  lock,
  children,
}) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side="left">{lock.reason}</TooltipContent>
  </Tooltip>
);

/** One row's frame: label (and whatever is said under it) left, value right. */
const RowShell: FC<{
  label: string;
  dimmed?: boolean;
  status?: ReactNode;
  children: ReactNode;
}> = ({ label, dimmed = false, status, children }) => (
  <li
    className={cn(
      "flex min-h-9 items-center justify-between gap-3 px-3 py-1 text-sm",
      dimmed && "opacity-60",
    )}
  >
    <div className="min-w-0">
      <p className="truncate text-foreground">{label}</p>
      {status}
    </div>
    <div className="flex shrink-0 items-center gap-2">{children}</div>
  </li>
);

const Row: FC<{ item: ControlPanelAttribute; lock: SectionLock | null }> = ({
  item,
  lock,
}) => {
  const { t } = useTranslation("dashboards");
  const can = usePermissions();
  const labelFor = useAttributeLabel();
  const {
    data: device,
    isLoading,
    error,
  } = useDevice(item.device_id || undefined);
  const attribute = device
    ? (deviceAttributes(device)[item.attribute] as AttributeFields | undefined)
    : undefined;
  const label = item.label ?? labelFor(item.attribute, attribute);

  if (isLoading)
    return (
      <RowShell label={label}>
        <Skeleton className="h-5 w-16" />
      </RowShell>
    );
  if (!device || !attribute) {
    const reason = isNotFound(error)
      ? "deviceMissing"
      : error
        ? "error"
        : "attributeMissing";
    return (
      <RowShell label={label}>
        <span className="text-xs text-muted-foreground">
          {t(`widgets.controlPanel.${reason}`)}
        </span>
      </RowShell>
    );
  }

  const fault = isFaultAttribute(attribute) ? attribute : null;
  if (
    !fault &&
    attribute.read_write_modes.includes("write") &&
    can("devices:command")
  )
    return (
      <ToggleRow
        device={device}
        attribute={attribute}
        label={label}
        lock={lock}
      />
    );

  // A fault on an inactive section is still a fault: it keeps its full colour.
  return (
    <RowShell label={label} dimmed={lock !== null && !fault?.is_faulty}>
      {fault?.is_faulty && <SeverityChip severity={fault.severity} />}
      <AttributeValue
        value={attribute.current_value}
        attributeName={attribute.name}
        dataType={attribute.data_type}
        fault={
          fault
            ? { severity: fault.severity, isFaulty: fault.is_faulty }
            : undefined
        }
        valueLabels={attribute.value_labels}
        resolutionError={attribute.resolution_error}
        support={attribute.write_state?.support}
        className="font-medium"
      />
    </RowShell>
  );
};

/** A writable row: its state in words and the switch that commands it. */
const ToggleRow: FC<{
  device: Device;
  attribute: AttributeFields;
  label: string;
  lock: SectionLock | null;
}> = ({ device, attribute, label, lock }) => {
  const { i18n } = useTranslation();
  const name = attribute.name;
  const controls = useMemo(
    () => ({
      [name]: {
        kind: "toggle" as const,
        attribute: name,
        label: { default: label },
      },
    }),
    [name, label],
  );
  const runtime = useDeviceControlRuntime(device, controls, {
    canWrite: lock === null,
  });
  const state = runtime.readControl(name);
  if (!state) return null;

  const toggle = (
    <Switch
      aria-label={label}
      checked={state.displayed === true}
      disabled={!state.canToggle}
      onCheckedChange={(checked) => runtime.setValue(name, checked)}
    />
  );
  return (
    <RowShell
      label={label}
      status={
        <>
          <WriteStateIndicator state={state.write} />
          <ControlFeedback
            state={state}
            runtime={runtime}
            language={i18n.language}
          />
        </>
      }
    >
      {/* The intention while a write is pending, else the reported value —
          worded and drawn as on the device page. */}
      {typeof state.displayed === "boolean" && (
        <AttributeValue
          value={state.displayed}
          attributeName={name}
          dataType={attribute.data_type}
          valueLabels={attribute.value_labels}
          className={cn("font-medium", lock && "opacity-60")}
        />
      )}
      {lock ? (
        // A disabled button fires no pointer events, so the hint hangs on a
        // focusable wrapper instead.
        <LockHint lock={lock}>
          <span tabIndex={0} className="inline-flex rounded-full">
            {toggle}
          </span>
        </LockHint>
      ) : (
        toggle
      )}
    </RowShell>
  );
};
