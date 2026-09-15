import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Device, DevicesFilter } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { DevicePresentation } from "@/components/device-ui/DevicePresentation";
import { ControlPanel } from "@/components/device-ui/widgets/ControlPanel";
import { formatValue } from "@/lib/formatValue";
import { localize } from "@/lib/localizedText";
import { GroupError } from "./GroupError";
import { GroupCommandDialog } from "./GroupCommandDialog";
import { GroupTargetDialog } from "./GroupTargetDialog";
import { GroupCommandDrafts } from "./GroupCommandDrafts";
import { GroupCommandResults } from "./GroupCommandResults";
import { useGroupDetails } from "./useGroupDetails";

export function TagGroupControls({
  driverId,
  filter,
  devices,
}: {
  driverId: string;
  filter: DevicesFilter;
  devices: Device[];
}) {
  const { t, i18n } = useTranslation("devices");
  const detail = useGroupDetails(driverId, filter, devices);
  const { attributes, controls, runtime, presentation, command, canWrite } =
    detail;
  const renderAttributes = (filter?: string) => (
    <dl className="divide-y rounded-lg border px-4">
      {Object.values(attributes)
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
                  ? formatValue(attribute.current_value!)
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
        <h3 className="font-semibold">
          {detail.driver.data?.model ?? driverId} · {devices.length}
        </h3>
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
      ) : presentation.document &&
        presentation.assets &&
        !presentation.assets.missing.length ? (
        <DevicePresentation
          document={presentation.document}
          subject={{ id: driverId, attributes }}
          runtime={runtime}
          assetUrl={presentation.assets.assetUrl}
          glyphSet={presentation.assets.glyphSet}
          fallback={fallback}
          renderAttributes={({ group: filter }) => renderAttributes(filter)}
        />
      ) : (
        fallback
      )}
      {canWrite && (
        <GroupCommandDrafts
          writes={detail.writes}
          attributes={attributes}
          disabled={command.busy || !!command.preview || !devices.length}
          onRemove={detail.removeDraft}
          onClear={detail.clearDrafts}
        />
      )}
      <GroupCommandResults
        command={command}
        devices={devices}
        attributes={attributes}
      />
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
      <GroupCommandDialog command={command} />
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
