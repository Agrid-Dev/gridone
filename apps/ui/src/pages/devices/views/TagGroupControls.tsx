import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Device, DevicesFilter } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { DevicePresentation } from "@/components/device-ui/DevicePresentation";
import { ControlPanel } from "@/components/device-ui/widgets/ControlPanel";
import { commandFailureLabel } from "@/lib/commandFailure";
import { formatValue } from "@/lib/formatValue";
import { localize } from "@/lib/localizedText";
import { GroupError } from "./GroupError";
import { GroupCommandDialog } from "./GroupCommandDialog";
import { GroupTargetDialog } from "./GroupTargetDialog";
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
      <h3 className="font-semibold">
        {detail.driver.data?.model ?? driverId} · {devices.length}
      </h3>
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
      {!!command.batch && (
        <div role="status" className="space-y-3 rounded-lg border p-4">
          <p className="font-medium">
            {t("groups.batchSummary", {
              success: command.commands.filter((c) => c.status === "success")
                .length,
              failed: command.commands.filter((c) => c.status === "error")
                .length,
              pending: command.commands.filter((c) => c.status === "pending")
                .length,
            })}
          </p>
          <GroupError error={command.resultsError} />
          <ul className="max-h-64 overflow-auto text-sm">
            {command.commands.map((item) => (
              <li key={item.id} className="flex justify-between gap-4 py-1">
                <span>
                  {detail.members.devices.find((d) => d.id === item.device_id)
                    ?.name ?? item.device_id}
                </span>
                <span>
                  {t(`commands.statusLabels.${item.status}`, {
                    defaultValue: item.status,
                  })}
                  {item.status === "error" &&
                    ` · ${commandFailureLabel(t, item.status_details)}`}
                </span>
              </li>
            ))}
          </ul>
          <Link
            className="text-sm underline"
            to={`/devices/commands?batch_id=${encodeURIComponent(command.batch.batch_id)}`}
          >
            {t("groups.history")}
          </Link>
        </div>
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
      <GroupCommandDialog command={command} />
      {detail.chosen && attributes[detail.chosen] && (
        <GroupTargetDialog
          key={detail.chosen}
          attribute={attributes[detail.chosen]}
          onCancel={() => detail.setChosen(null)}
          onPrepare={(value) => {
            const name = detail.chosen!;
            detail.setChosen(null);
            void command.prepare(name, value);
          }}
        />
      )}
    </section>
  );
}
