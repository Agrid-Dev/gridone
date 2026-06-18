import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useDrivers } from "@/pages/drivers/useDrivers";
import { useTransports } from "@/pages/transports/useTransports";
import { useDeviceDiscovery } from "@/hooks/useDeviceDiscovery";
import type { Transport } from "@/api/transports";
import type { PhysicalDevice } from "@/api/devices";
import {
  buildDriverOptions,
  buildTransportOptions,
  filterTransportsForDriver,
} from "../form/driverTransportOptions";
import type { NetworkModalState } from "../form/useDeviceForm";

export type DriverNetworkValues = { driverId: string; transportId: string };

/** Drives the driver & network config section: the RHF form, protocol-filtered
 *  options, the NetworkModal create/edit flow, and the (self-persisting)
 *  discovery switch. Reuses the create form's option builders and primitives so
 *  there is one source of truth for this logic. */
export function useDriverNetworkForm(device: PhysicalDevice) {
  const { t } = useTranslation("devices");
  const { driversListQuery } = useDrivers();
  const { transportsListQuery } = useTransports();
  const drivers = driversListQuery.data ?? [];
  const transports = transportsListQuery.data ?? [];

  const form = useForm<DriverNetworkValues>({
    mode: "onChange",
    defaultValues: {
      driverId: device.driverId,
      transportId: device.transportId,
    },
  });
  const driverId = form.watch("driverId");
  const transportId = form.watch("transportId");

  const selectedDriver = useMemo(
    () => drivers.find((d) => d.id === driverId),
    [drivers, driverId],
  );
  const selectedTransport = useMemo(
    () => transports.find((tr) => tr.id === transportId),
    [transports, transportId],
  );

  const driverOptions = useMemo(
    () => buildDriverOptions(drivers, t),
    [drivers, t],
  );
  const availableTransports = useMemo(
    () => filterTransportsForDriver(transports, selectedDriver),
    [transports, selectedDriver],
  );
  const transportOptions = useMemo(
    () => buildTransportOptions(availableTransports, t),
    [availableTransports, t],
  );

  // When the selected driver's protocol no longer matches the selected
  // transport, clear the transport so the user re-picks a compatible network.
  useEffect(() => {
    if (
      selectedDriver &&
      selectedTransport &&
      selectedTransport.protocol !== selectedDriver.transport
    ) {
      form.setValue("transportId", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [selectedDriver, selectedTransport, form]);

  const discovery = useDeviceDiscovery({
    transportId: transportId || undefined,
    driverId: driverId || undefined,
    protocol: selectedTransport?.protocol,
    deferred: false,
  });

  const [networkModalState, setNetworkModalState] =
    useState<NetworkModalState>(null);

  const openCreateNetworkModal = () => {
    if (!selectedDriver) return;
    setNetworkModalState({
      mode: "create",
      protocol: selectedDriver.transport,
    });
  };
  const openEditNetworkModal = () => {
    if (!selectedTransport) return;
    setNetworkModalState({ mode: "edit", transport: selectedTransport });
  };
  const closeNetworkModal = () => setNetworkModalState(null);
  const onNetworkSubmitted = (transport: Transport) => {
    form.setValue("transportId", transport.id, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  return {
    form,
    driverOptions,
    transportOptions,
    selectedDriver,
    selectedTransport,
    driversLoading: driversListQuery.isLoading,
    transportsLoading: transportsListQuery.isLoading,
    transportsError: transportsListQuery.error,
    discovery,
    networkModalState,
    openCreateNetworkModal,
    openEditNetworkModal,
    closeNetworkModal,
    onNetworkSubmitted,
  };
}
