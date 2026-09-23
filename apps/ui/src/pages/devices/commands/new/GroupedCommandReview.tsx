import { GroupCommandDialog } from "@/components/group-command/GroupCommandDialog";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, Loader2, TriangleAlert, X } from "lucide-react";
import type { CommandStatus, Device } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useValueText } from "@/hooks/useValueText";
import { deviceAttributes } from "@/lib/devices";
import type { CellValue } from "@/lib/formatValue";
import { serverErrorMessage } from "@/lib/serverErrorMessage";
import { constraintWarnings, type CommandDisplay } from "./groupedCommand";
import type { CommandPayload } from "./groupedCommand";
import type { GroupedCommandActions } from "./useGroupedCommandActions";

type Props = {
  /** The command being prepared. Once dispatched the rail shows the snapshot
   *  instead, so a late edit cannot rewrite what was sent. */
  payload: CommandPayload;
  devices: Device[];
  display: CommandDisplay;
  canSubmit: boolean;
  selectedCount: number;
  excluded: Device[];
  actions: GroupedCommandActions;
};

export function GroupedCommandReview({
  payload,
  devices,
  display,
  canSubmit,
  selectedCount,
  excluded,
  actions,
}: Props) {
  const { t } = useTranslation(["devices", "common"]);
  const valueText = useValueText();
  const snapshot = actions.snapshot;
  const tracking = !!snapshot;
  const shown = snapshot ?? { payload, devices };
  const write = shown.payload.write;
  const awaitingAttribute = !tracking && !write.attribute;
  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader>
        <CardTitle>
          {t(
            tracking
              ? "commands.grouped.dispatchResults"
              : "commands.grouped.review",
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Badge variant="secondary">
          {t(
            tracking || awaitingAttribute
              ? "commands.new.selectionCount"
              : "commands.grouped.affectedCount",
            {
              count: awaitingAttribute ? selectedCount : shown.devices.length,
              total: tracking ? shown.devices.length : selectedCount,
            },
          )}
        </Badge>
        <p className="text-sm">
          {!write.attribute
            ? t("commands.grouped.pickAttribute")
            : t("commands.grouped.setting", {
                attribute: display.label || "—",
                value:
                  write.value === ""
                    ? "—"
                    : valueText(write.attribute, write.value, {
                        valueLabels: display.valueLabels,
                        dataType: display.dataType,
                      }),
                unit: display.unit ?? "",
              })}
        </p>
        {snapshot?.error && (
          <p role="alert" className="text-sm text-destructive">
            {snapshot.empty
              ? t("commands.grouped.emptyBatch")
              : (serverErrorMessage(snapshot.error) ??
                t("common:errors.default"))}
          </p>
        )}
        {actions.trackingError && (
          <p role="alert" className="text-sm text-destructive">
            {t("commands.grouped.trackingError")}
          </p>
        )}
        {!awaitingAttribute && (
          <div
            data-scroll-restoration="command-results"
            className="max-h-[min(28rem,45vh)] overflow-y-auto rounded-lg border"
            aria-live={tracking ? "polite" : "off"}
          >
            <ul className="divide-y">
              {shown.devices.map((device) => {
                const command = actions.commandsByDevice.get(device.id);
                const missing =
                  tracking &&
                  !actions.isDispatching &&
                  !command &&
                  (snapshot?.empty || !!snapshot?.result);
                return (
                  <li key={device.id} className="p-4 space-y-2">
                    <p className="text-sm font-medium">
                      <Link
                        to={`/devices/${device.id}`}
                        className="text-primary hover:underline focus-visible:underline"
                      >
                        {device.name || device.id}
                      </Link>
                    </p>
                    {tracking ? (
                      <>
                        {missing ? (
                          <p className="text-sm text-destructive">
                            {t("commands.grouped.vanished")}
                          </p>
                        ) : command ? (
                          <CommandStatusLabel status={command.status} />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {t(
                              actions.isDispatching
                                ? "commands.new.dispatching"
                                : "commands.grouped.notDispatched",
                            )}
                          </p>
                        )}
                        {command?.status === "error" &&
                          command.status_details && (
                            <p className="text-xs text-destructive">
                              {command.status_details}
                            </p>
                          )}
                      </>
                    ) : (
                      <PreviewLine
                        device={device}
                        write={write}
                        valueLabels={display.valueLabels}
                        dataType={display.dataType}
                      />
                    )}
                  </li>
                );
              })}
              {actions.addedCommands.map((command) => (
                <li key={command.id} className="p-4 space-y-2">
                  <p className="text-sm font-medium">
                    <Link
                      to={`/devices/${command.device_id}`}
                      className="text-primary hover:underline focus-visible:underline"
                    >
                      {command.device_id}
                    </Link>
                  </p>
                  <CommandStatusLabel status={command.status} />
                </li>
              ))}
            </ul>
            {shown.devices.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground">
                {t("commands.new.noDevicesResolved")}
              </p>
            )}
          </div>
        )}
        {!tracking && excluded.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">
              {t("commands.grouped.excluded", { count: excluded.length })}
            </p>
            <ul className="mt-2 space-y-2">
              {excluded.map((device) => (
                <li key={device.id} className="flex justify-between gap-3">
                  <span>
                    <Link
                      to={`/devices/${device.id}`}
                      className="text-primary hover:underline focus-visible:underline"
                    >
                      {device.name || device.id}
                    </Link>
                  </span>
                  <span>
                    {t(
                      deviceAttributes(device)[payload.write.attribute]
                        ? "commands.grouped.readOnly"
                        : "commands.grouped.absent",
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {tracking ? (
          <div className="space-y-3">
            {snapshot.result && (
              <Button variant="outline" className="w-full" asChild>
                <Link
                  to={`/devices/commands?batch_id=${encodeURIComponent(snapshot.result.batch_id)}`}
                >
                  {t("commands.grouped.fullHistory")}
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full"
              onClick={actions.clear}
              disabled={actions.isDispatching}
            >
              {t("commands.grouped.newCommand")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              className="w-full"
              onClick={actions.requestDispatch}
              disabled={!canSubmit || actions.isSaving}
            >
              {t("commands.new.dispatch")}
            </Button>
            <Popover open={actions.saveOpen} onOpenChange={actions.setSaveOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!canSubmit}
                >
                  {t("commands.new.save.action")}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <form onSubmit={actions.saveTemplate} className="space-y-4">
                  <Field
                    data-invalid={!!actions.nameForm.formState.errors.name}
                  >
                    <FieldLabel htmlFor="command-template-name">
                      {t("commands.new.save.nameLabel")}
                    </FieldLabel>
                    <Input
                      id="command-template-name"
                      {...actions.nameForm.register("name")}
                      aria-invalid={!!actions.nameForm.formState.errors.name}
                    />
                    {actions.nameForm.formState.errors.name && (
                      <FieldError>
                        {t("commands.grouped.nameRequired")}
                      </FieldError>
                    )}
                  </Field>
                  {actions.saveError && (
                    <p role="alert" className="text-sm text-destructive">
                      {serverErrorMessage(actions.saveError) ??
                        t("common:errors.default")}
                    </p>
                  )}
                  <Button type="submit" disabled={actions.isSaving}>
                    {t(
                      actions.isSaving
                        ? "commands.new.save.saving"
                        : "commands.new.save.action",
                    )}
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
          </div>
        )}
        <GroupCommandDialog command={actions.groupCommand} />
      </CardContent>
    </Card>
  );
}

function PreviewLine({
  device,
  write,
  valueLabels,
  dataType,
}: {
  device: Device;
  write: CommandPayload["write"];
  valueLabels: CommandDisplay["valueLabels"];
  dataType: CommandDisplay["dataType"];
}) {
  const { t } = useTranslation("devices");
  const valueText = useValueText();
  const attr = deviceAttributes(device)[write.attribute];
  const { warnings, dynamic } = constraintWarnings(
    device,
    write.attribute,
    write.value,
  );
  const unit = typeof attr?.unit === "string" ? attr.unit : "";
  return (
    <>
      <p className="flex items-center gap-2 text-sm tabular-nums">
        <span className="text-muted-foreground">
          {valueText(write.attribute, attr?.current_value as CellValue, {
            valueLabels,
            dataType,
          })}{" "}
          {unit}
        </span>
        <ArrowRight className="h-3.5 w-3.5" />
        <span className="font-semibold text-primary">
          {write.value === ""
            ? "—"
            : valueText(write.attribute, write.value, {
                valueLabels,
                dataType,
              })}{" "}
          {unit}
        </span>
      </p>
      {warnings.map(({ kind, bound }) => (
        <p key={kind} className="flex items-start gap-1 text-xs text-amber-700">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {t(`commands.grouped.bounds.${kind}`, { bound })}
        </p>
      ))}
      {dynamic && (
        <p className="text-xs text-muted-foreground">
          {t("commands.grouped.dynamicBounds")}
        </p>
      )}
    </>
  );
}

function CommandStatusLabel({ status }: { status: CommandStatus }) {
  const { t } = useTranslation("devices");
  const Icon = status === "success" ? Check : status === "error" ? X : Loader2;
  return (
    <p
      className={`flex items-center gap-1 text-sm ${status === "error" ? "text-destructive" : status === "success" ? "text-green-700" : "text-muted-foreground"}`}
    >
      <Icon
        className={`h-4 w-4 ${status === "pending" ? "animate-spin" : ""}`}
      />
      {t(`commands.statusLabels.${status}`)}
    </p>
  );
}
