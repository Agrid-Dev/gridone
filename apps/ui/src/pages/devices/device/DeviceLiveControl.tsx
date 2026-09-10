import { useDeviceDetails } from "@/hooks/useDeviceDetails";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { getStandardDeviceEntry } from "../standard-devices/registry";
import { DeviceAttributePanes } from "./DeviceAttributePanes";
import type { Device } from "@gridone/sdk";
import { useTranslation } from "react-i18next";
import { DevicePresentation } from "@/components/device-ui/DevicePresentation";
import { usePresentedDevice } from "@/components/device-ui/usePresentedDevice";
import type { PresentationDiagnostic } from "@/components/device-ui/document";

export default function DeviceLiveControl() {
  const device = useDeviceFromRoute();
  return <PresentedDevice key={device.id} device={device} />;
}

function PresentedDevice({ device }: { device: Device }) {
  const { t } = useTranslation("devices");
  const { presentation, runtime, pending } = usePresentedDevice(device);
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
      <DevicePresentation
        document={presentation.document}
        device={device}
        runtime={runtime}
        assetUrl={presentation.assets.assetUrl}
        glyphSet={presentation.assets.glyphSet}
        fallback={fallback([{ code: "render_error" }])}
        renderAttributes={({ group }) => (
          <DeviceAttributePanes device={device} group={group} />
        )}
      />
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
