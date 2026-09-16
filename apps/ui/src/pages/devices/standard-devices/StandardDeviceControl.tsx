import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { isNotFound, type Device } from "@gridone/sdk";
import type { UseQueryResult } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeviceDetails } from "@/hooks/useDeviceDetails";
import { getStandardDeviceEntry } from "./registry";

/** Centred one-liner for the states the control itself has no rendering for. */
export const ControlMessage: FC<{ children: string }> = ({ children }) => (
  <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

/** The device's registered standard control, wired to the same draft/command
 *  path as the device page, for the surfaces that show one device's control
 *  outside that page (dashboard widget, synoptic panel). A type with no
 *  standard control is named rather than rendered empty. */
export const StandardDeviceControl: FC<{ device: Device }> = ({ device }) => {
  const { t } = useTranslation();
  const { draft, savingAttr, feedback, handleDraftChange, handleSave } =
    useDeviceDetails(device);

  const entry = getStandardDeviceEntry(device.type);
  if (!entry) {
    return <ControlMessage>{t("common.noStandardControl")}</ControlMessage>;
  }

  return (
    <entry.Control
      device={device}
      draft={draft}
      savingAttr={savingAttr}
      feedback={feedback}
      onDraftChange={handleDraftChange}
      onSave={handleSave}
    />
  );
};

/** The control of a device fetched by id, through its loading, deleted and
 *  failed states, so every surface reports a missing device the same way. */
export const StandardDeviceControlBody: FC<{
  result: UseQueryResult<Device>;
}> = ({ result }) => {
  const { t } = useTranslation();
  if (result.isLoading) return <Skeleton className="h-full min-h-48 w-full" />;
  if (result.error || !result.data) {
    return (
      <ControlMessage>
        {isNotFound(result.error)
          ? t("common.deviceNotFound")
          : t("common.deviceLoadError")}
      </ControlMessage>
    );
  }
  return <StandardDeviceControl key={result.data.id} device={result.data} />;
};
