import { Link } from "react-router";
import { Plus, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { NetworkModal } from "@/components/NetworkModal";
import { DeviceDiscoverySwitch } from "@/components/DeviceDiscoverySwitch";
import { useTransports } from "@/pages/transports/useTransports";
import type { Device, PhysicalDevice } from "@/api/devices";
import {
  Section,
  SectionRow,
  SectionEditButton,
  SectionActions,
} from "./Section";
import { useDriverNetworkForm } from "./useDriverNetworkForm";

interface DriverNetworkSectionProps {
  device: PhysicalDevice;
  isEditing: boolean;
  canEdit: boolean;
  isSubmitting: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (payload: Partial<Device>) => void;
}

export function DriverNetworkSection({
  device,
  isEditing,
  canEdit,
  isSubmitting,
  onEdit,
  onCancel,
  onSave,
}: DriverNetworkSectionProps) {
  const { t } = useTranslation("devices");
  return (
    <Section
      title={t("deviceDetails.config.driverTransport.title")}
      busy={isSubmitting}
      action={
        canEdit ? (
          <SectionEditButton
            label={t("deviceDetails.config.driverTransport.edit")}
            onClick={onEdit}
          />
        ) : undefined
      }
    >
      {isEditing ? (
        <DriverNetworkForm
          device={device}
          isSubmitting={isSubmitting}
          onSubmit={onSave}
          onCancel={onCancel}
        />
      ) : (
        <DriverNetworkReadout device={device} />
      )}
    </Section>
  );
}

function DriverNetworkReadout({ device }: { device: PhysicalDevice }) {
  const { t } = useTranslation("devices");
  const { transportsListQuery } = useTransports();
  const transport = transportsListQuery.data?.find(
    (tr) => tr.id === device.transportId,
  );
  return (
    <>
      <SectionRow label={t("devices.fields.driver")}>
        <Link
          to={`/drivers/${device.driverId}`}
          className="text-primary hover:underline"
        >
          {device.driverId}
        </Link>
      </SectionRow>
      {/* Network renders as text until the transports detail page (AGR-741)
          exists; then it becomes a link to /transports/:id. */}
      <SectionRow label={t("devices.fields.transport")}>
        {transport?.name ?? device.transportId}
      </SectionRow>
    </>
  );
}

function DriverNetworkForm({
  device,
  isSubmitting,
  onSubmit,
  onCancel,
}: {
  device: PhysicalDevice;
  isSubmitting: boolean;
  onSubmit: (payload: Partial<Device>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("devices");
  const driverLabel = t("devices.fields.driver");
  const networkLabel = t("devices.fields.transport");
  const {
    form,
    driverOptions,
    transportOptions,
    selectedDriver,
    selectedTransport,
    driversLoading,
    transportsLoading,
    transportsError,
    discovery,
    networkModalState,
    openCreateNetworkModal,
    openEditNetworkModal,
    closeNetworkModal,
    onNetworkSubmitted,
  } = useDriverNetworkForm(device);

  return (
    <form
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          driverId: values.driverId,
          transportId: values.transportId,
        }),
      )}
    >
      <SectionRow label={driverLabel}>
        <SelectController
          name="driverId"
          control={form.control}
          options={driverOptions}
          placeholder={t("devices.fields.driverPlaceholder")}
          required
          rules={{ required: true }}
          disabled={driversLoading}
          triggerProps={{ "aria-label": driverLabel }}
        />
      </SectionRow>

      <SectionRow label={networkLabel}>
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <SelectController
              name="transportId"
              control={form.control}
              options={transportOptions}
              placeholder={t("devices.fields.transportPlaceholder")}
              required
              rules={{ required: true }}
              disabled={!selectedDriver || transportsLoading}
              triggerProps={{ "aria-label": networkLabel }}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={openCreateNetworkModal}
            disabled={!selectedDriver}
            title={t("devices.fields.createNetworkAction")}
            aria-label={t("devices.fields.createNetworkAction")}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={openEditNetworkModal}
            disabled={!selectedTransport}
            title={t("devices.fields.editNetworkAction")}
            aria-label={t("devices.fields.editNetworkAction")}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </SectionRow>

      {transportsError && (
        <p className="py-1 text-sm text-destructive">
          {t("devices.fields.transportLoadError")}
        </p>
      )}
      {discovery.supported && (
        <div className="pt-3">
          <DeviceDiscoverySwitch
            checked={discovery.enabled}
            onCheckedChange={discovery.setEnabled}
            loading={discovery.loading}
          />
        </div>
      )}

      <SectionActions
        saveDisabled={!form.formState.isValid || !form.formState.isDirty}
        submitting={isSubmitting}
        onCancel={onCancel}
      />

      <NetworkModal
        open={networkModalState !== null}
        onClose={closeNetworkModal}
        mode={networkModalState?.mode ?? "create"}
        protocol={
          networkModalState?.mode === "create"
            ? networkModalState.protocol
            : undefined
        }
        transport={
          networkModalState?.mode === "edit"
            ? networkModalState.transport
            : undefined
        }
        onSubmitted={onNetworkSubmitted}
      />
    </form>
  );
}
