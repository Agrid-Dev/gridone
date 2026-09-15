import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Device, DevicesFilter } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { DevicePresentation } from "@/components/device-ui/DevicePresentation";
import { ControlPanel } from "@/components/device-ui/widgets/ControlPanel";
import {
  hasDeviceFace,
  unwrapDeviceFaceSection,
  writableOnlyPresentation,
} from "@/components/device-ui/writableOnly";
import { attributeValueText } from "@/lib/attributeValueLabel";
import { localize } from "@/lib/localizedText";
import { useDeviceCountLabel } from "@/hooks/useDeviceCountLabel";
import { GroupError } from "@/components/group-command/GroupError";
import { GroupCommandDialog } from "@/components/group-command/GroupCommandDialog";
import { GroupTargetDialog } from "@/components/group-command/GroupTargetDialog";
import { GroupCommandDrafts } from "@/components/group-command/GroupCommandDrafts";
import { GroupCommandResults } from "@/components/group-command/GroupCommandResults";
import { useGroupDetails } from "./useGroupDetails";
import { useMemo } from "react";

export function TagGroupControls({
  driverId,
  filter,
  devices,
  targetName,
}: {
  driverId: string;
  filter: DevicesFilter;
  devices: Device[];
  /** Name of the view or group these devices belong to, shown to the user in
   *  place of the tag that resolves them. */
  targetName?: string;
}) {
  const { t, i18n } = useTranslation("devices");
  const { t: tCommon } = useTranslation("common");
  const detail = useGroupDetails(driverId, filter, devices);
  const { attributes, controls, runtime, presentation, command, canWrite } =
    detail;
  // Business vocabulary, never the driver id — the same phrasing the device
  // page uses for the group it targets.
  const heading = useDeviceCountLabel()(devices);
  // Only commandable settings: an aggregated reading is either identical on
  // every member or "several values", and this screen exists to send one
  // setpoint to all of them.
  const document = useMemo(
    () =>
      presentation.document
        ? unwrapDeviceFaceSection(
            writableOnlyPresentation(presentation.document),
          )
        : null,
    [presentation.document],
  );
  // The face slot carries the setpoints awaiting validation. A driver with no
  // face keeps them below the presentation, where they were. Only the face
  // slot announces itself while empty: a reserved column would otherwise
  // collapse, whereas a panel appended below has no hole to fill.
  const draftsRecap = (emptyHint?: string) =>
    canWrite ? (
      <GroupCommandDrafts
        writes={detail.writes}
        attributes={attributes}
        disabled={command.busy || !!command.preview || !devices.length}
        onRemove={detail.removeDraft}
        onClear={detail.clearDrafts}
        emptyHint={emptyHint}
      />
    ) : null;
  const renderAttributes = (filter?: string) => (
    <dl className="divide-y rounded-lg border px-4">
      {Object.values(attributes)
        .filter((a) => a.read_write_modes.includes("write"))
        .filter((a) => !filter || a.group === filter)
        .map((attribute) => (
          <div
            key={attribute.name}
            className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
          >
            <dt className="text-muted-foreground">
              {attribute.label
                ? localize(attribute.label, i18n.language)
                : attribute.name}
              {attribute.unit ? ` (${attribute.unit})` : ""}
            </dt>
            <dd className="flex items-center gap-3">
              <span>
                {attribute.state === "common"
                  ? attributeValueText(
                      attribute.name,
                      attribute.current_value,
                      tCommon,
                    )
                  : runtime.valueLabel?.(attribute.name)}
              </span>
              {canWrite &&
                !!devices.length &&
                attribute.read_write_modes.includes("write") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={command.busy || !!command.preview}
                    onClick={() => detail.choose(attribute.name)}
                  >
                    {t("groups.chooseTarget")}
                  </Button>
                )}
            </dd>
          </div>
        ))}
    </dl>
  );
  const fallback = (
    <div className="space-y-5">
      <ControlPanel
        controls={Object.keys(controls)}
        runtime={runtime}
        language={i18n.language}
      />
      {renderAttributes()}
    </div>
  );
  return (
    <section className="space-y-6">
      <div className="sticky top-0 z-10 flex min-h-12 flex-wrap items-center justify-between gap-3 bg-card py-1">
        <h3 className="font-semibold">{heading}</h3>
        {canWrite && !!detail.writes.length && (
          <Button
            type="button"
            disabled={command.busy || !!command.preview || !devices.length}
            onClick={() => void command.prepareMany(detail.writes)}
          >
            {t("groups.reviewDrafts", { count: detail.writes.length })}
          </Button>
        )}
      </div>
      <GroupError
        error={detail.driver.error || (!command.preview && command.error)}
      />
      {!devices.length ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {t("groups.empty")}
        </p>
      ) : presentation.loading ? (
        <p role="status">{t("presentation.loading")}</p>
      ) : document &&
        detail.presentationState &&
        presentation.assets &&
        !presentation.assets.missing.length ? (
        <>
          <DevicePresentation
            document={document}
            subject={{
              id: driverId,
              attributes,
              presentation_state: detail.presentationState,
            }}
            runtime={runtime}
            assetUrl={presentation.assets.assetUrl}
            glyphSet={presentation.assets.glyphSet}
            fallback={fallback}
            renderAttributes={({ group: filter }) => renderAttributes(filter)}
            renderDeviceFace={() => draftsRecap(t("groups.draftDescription"))}
          />
          {!hasDeviceFace(document) && draftsRecap()}
        </>
      ) : (
        <>
          {fallback}
          {draftsRecap()}
        </>
      )}
      {!command.preview && (
        <GroupCommandResults
          command={command}
          devices={devices}
          attributes={attributes}
          targetName={targetName}
        />
      )}
      <details open className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          {t("groups.members")}
        </summary>
        <ul className="mt-3 divide-y">
          {detail.members.devices.map((member) => (
            <li key={member.id} className="py-2 text-sm">
              <Link className="hover:underline" to={`/devices/${member.id}`}>
                {member.name}
              </Link>
            </li>
          ))}
        </ul>
      </details>
      <GroupCommandDialog command={command} targetName={targetName} />
      {detail.chosen && attributes[detail.chosen] && (
        <GroupTargetDialog
          key={detail.chosen}
          attribute={attributes[detail.chosen]}
          onCancel={() => detail.setChosen(null)}
          initialValue={
            detail.drafts[detail.chosen] ??
            attributes[detail.chosen].current_value
          }
          onStage={(value) => {
            const name = detail.chosen!;
            detail.setChosen(null);
            detail.stage(name, value);
          }}
        />
      )}
    </section>
  );
}
