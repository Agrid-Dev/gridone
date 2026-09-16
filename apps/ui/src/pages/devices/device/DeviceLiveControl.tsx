import { useMemo, useState } from "react";
import { useDeviceDetails } from "@/hooks/useDeviceDetails";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { getStandardDeviceEntry } from "../standard-devices/registry";
import { DeviceAttributePanes } from "./DeviceAttributePanes";
import { DeviceCommandTarget } from "./DeviceCommandTarget";
import type { Device } from "@gridone/sdk";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/contexts/AuthContext";
import { DevicePresentation } from "@/components/device-ui/DevicePresentation";
import { usePresentedDevice } from "@/components/device-ui/usePresentedDevice";
import type { PresentationDiagnostic } from "@/components/device-ui/document";
import { deviceGroupAttributes } from "@/components/group-command/groupAttributes";
import { GROUP_TAG_KEY } from "@/components/group-command/groupMembership";
import { GroupCommandDialog } from "@/components/group-command/GroupCommandDialog";
import { GroupCommandDrafts } from "@/components/group-command/GroupCommandDrafts";
import { GroupCommandResults } from "@/components/group-command/GroupCommandResults";
import { GroupError } from "@/components/group-command/GroupError";
import { GroupTargetDialog } from "@/components/group-command/GroupTargetDialog";
import { useGroupTarget } from "@/components/group-command/useGroupTarget";
import {
  useDeviceGroups,
  useGroupMembers,
  type DeviceGroup,
} from "@/hooks/useDeviceGroups";
import { useDeviceCountLabel } from "@/hooks/useDeviceCountLabel";
import type { DevicesFilter } from "@/lib/devices";

export default function DeviceLiveControl() {
  const device = useDeviceFromRoute();
  return <PresentedDevice key={device.id} device={device} />;
}

function PresentedDevice({ device }: { device: Device }) {
  const { groups } = useDeviceGroups(device);
  const [targetValue, setTargetValue] = useState<string | null>(null);
  const target = groups.find((group) => group.value === targetValue) ?? null;
  // Remounting on target change is the point: the previous runtime is
  // detached, so a setpoint still waiting for its debounce is cancelled
  // instead of landing on the group that was just selected.
  return (
    <DeviceControl
      key={target?.value ?? "self"}
      device={device}
      target={target}
      groups={groups}
      onTargetChange={setTargetValue}
    />
  );
}

function DeviceControl({
  device,
  target,
  groups,
  onTargetChange,
}: {
  device: Device;
  target: DeviceGroup | null;
  groups: DeviceGroup[];
  onTargetChange: (group: string | null) => void;
}) {
  const { t } = useTranslation("devices");
  const can = usePermissions();
  const members = useGroupMembers(target?.value ?? null);
  const countLabel = useDeviceCountLabel();
  const { presentation, controls, runtime, pending } =
    usePresentedDevice(device);
  // Controls keep showing this thermostat's own values: the target says where
  // a change is sent, not what is being looked at. What each member of the
  // group will actually receive is shown per device on the validation screen.
  const attributes = useMemo(() => deviceGroupAttributes(device), [device]);
  const filter = useMemo<DevicesFilter>(
    () =>
      target
        ? {
            tags: { [GROUP_TAG_KEY]: [target.value] },
            driver_id: device.driver_id,
          }
        : { ids: [device.id] },
    [target, device.driver_id, device.id],
  );
  // A tag target cannot be written in one shot (the API answers 409
  // `command_preview_required`), so selecting a group turns every gesture
  // into a staged setpoint reviewed before it is sent.
  const group = useGroupTarget(
    filter,
    attributes,
    controls,
    !!target && can("devices:write"),
  );
  const { command } = group;
  const fallback = (diagnostics: PresentationDiagnostic[]) => (
    <div className="space-y-4">
      <div role="status" className="rounded-md border p-4 text-sm">
        <p className="font-medium">{t("presentation.fallbackTitle")}</p>
        <p>{t("presentation.fallbackBody")}</p>
        <ul>
          {diagnostics.map((diagnostic, index) => (
            <li key={index}>
              <code>{diagnostic.code}</code>
              {diagnostic.path ? ` · ${diagnostic.path}` : ""}
            </li>
          ))}
        </ul>
      </div>
      <fieldset disabled={pending} aria-busy={pending} className="min-w-0">
        {pending && <p role="status">{t("presentation.sending")}</p>}
        <StandardDeviceContent device={device} />
      </fieldset>
    </div>
  );
  if (presentation.status === "none" && !pending) {
    return <StandardDeviceContent device={device} />;
  }
  if (presentation.status === "loading") {
    return <p role="status">{t("presentation.loading")}</p>;
  }
  if (presentation.status !== "available") {
    return fallback(
      presentation.status === "unavailable" ? presentation.diagnostics : [],
    );
  }
  return (
    <div className="space-y-8">
      {/* The bar and the controls are one block: 12px between them against the
          24px the page puts above, so the bar reads as the head of what it
          governs rather than as another line of page chrome. */}
      <div className="space-y-3">
        <DeviceCommandTarget
          groups={groups}
          value={target?.value ?? null}
          onChange={onTargetChange}
          memberLabel={members && countLabel(members)}
          action={
            target && group.writes.length ? (
              <Button
                type="button"
                size="sm"
                disabled={command.busy || !!command.preview}
                onClick={() => void command.prepareMany(group.writes)}
              >
                {t("groups.reviewDrafts", { count: group.writes.length })}
              </Button>
            ) : null
          }
        />
        {target && <GroupError error={!command.preview && command.error} />}
        <DevicePresentation
          document={presentation.document}
          subject={device}
          runtime={target ? group.runtime : runtime}
          assetUrl={presentation.assets.assetUrl}
          glyphSet={presentation.assets.glyphSet}
          fallback={fallback([{ code: "render_error" }])}
          renderAttributes={({ group: attributeGroup }) => (
            <DeviceAttributePanes device={device} group={attributeGroup} />
          )}
        />
      </div>
      {target && (
        <>
          <GroupCommandDrafts
            writes={group.writes}
            attributes={attributes}
            disabled={command.busy || !!command.preview}
            onRemove={group.removeDraft}
            onClear={group.clearDrafts}
          />
          {!command.preview && (
            <GroupCommandResults command={command} targetName={target.name} />
          )}
          <GroupCommandDialog command={command} targetName={target.name} />
          {group.chosen && attributes[group.chosen] && (
            <GroupTargetDialog
              key={group.chosen}
              attribute={attributes[group.chosen]}
              onCancel={() => group.setChosen(null)}
              initialValue={
                group.drafts[group.chosen] ??
                attributes[group.chosen].current_value
              }
              onStage={(value) => {
                const name = group.chosen!;
                group.setChosen(null);
                group.stage(name, value);
              }}
            />
          )}
        </>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          {t("presentation.allAttributes")}
        </summary>
        <div className="mt-4">
          <DeviceAttributePanes device={device} />
        </div>
      </details>
    </div>
  );
}

function StandardDeviceContent({ device }: { device: Device }) {
  const { draft, savingAttr, feedback, handleDraftChange, handleSave } =
    useDeviceDetails(device);

  const standardEntry = getStandardDeviceEntry(device.type);
  // A type with a full supervision layout renders it; others get their bare
  // control, centred as before.
  const StandardView = standardEntry?.Supervision ?? standardEntry?.Control;

  return (
    <div className="space-y-8">
      {/* ── Standard control (if registered) ── */}
      {StandardView && (
        <div className="py-2">
          <StandardView
            device={device}
            draft={draft}
            savingAttr={savingAttr}
            feedback={feedback}
            onDraftChange={handleDraftChange}
            onSave={handleSave}
          />
        </div>
      )}

      {/* ── Read-only attribute panes: Standard · Faults · Internal ── */}
      <DeviceAttributePanes device={device} />
    </div>
  );
}
