import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  createDevice,
  isPhysicalDevice,
  updateDevice,
  type Device,
  type DeviceCreatePayload,
  type PhysicalDevice,
} from "@/api/devices";
import type { Transport, TransportProtocol } from "@/api/transports";
import { useDrivers } from "@/pages/drivers/useDrivers";
import { useTransports } from "@/pages/transports/useTransports";
import { toLabel } from "@/lib/textFormat";
import { useTranslation } from "react-i18next";
import { useDeviceDiscovery } from "@/hooks/useDeviceDiscovery";
import snakecaseKeys from "snakecase-keys";

type BaseFormData = {
  name: string;
  driverId: string;
  transportId: string;
};

type ConfigFormData = Record<string, string>;

export type NetworkModalState =
  | { mode: "create"; protocol: TransportProtocol }
  | { mode: "edit"; transport: Transport }
  | null;

export const useDeviceForm = (device?: PhysicalDevice) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isCreate = device === undefined;
  const { t } = useTranslation("devices");
  const { driversListQuery: driversQuery } = useDrivers();
  const { transportsListQuery: transportsQuery } = useTransports();

  // Form instances
  const baseFormMethods = useForm<BaseFormData>({
    defaultValues: {
      name: device?.name || "",
      driverId: device?.driverId || "",
      transportId: device?.transportId || "",
    },
    mode: "onChange",
  });

  const configFormMethods = useForm<ConfigFormData>({
    mode: "onChange",
    defaultValues: device?.config
      ? (snakecaseKeys(device.config) as ConfigFormData)
      : undefined,
  });

  // Data from queries
  const drivers = driversQuery.data ?? [];
  const transports = transportsQuery.data ?? [];

  // Watch for driver / transport selection changes
  const driverId = baseFormMethods.watch("driverId");
  const transportId = baseFormMethods.watch("transportId");

  // Find selected driver / transport
  const selectedDriver = useMemo(
    () => drivers.find((driver) => driver.id === driverId),
    [driverId, drivers],
  );
  const selectedTransport = useMemo(
    () => transports.find((transport) => transport.id === transportId),
    [transportId, transports],
  );

  // Reset config form and transport when driver changes
  useEffect(() => {
    configFormMethods.reset();
    baseFormMethods.setValue("transportId", device?.transportId || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [driverId, baseFormMethods, configFormMethods]);

  // Prepare driver options for select
  const driverOptions = useMemo(
    () =>
      drivers.map((driver) => {
        const protocolLabel = t(`transports:protocols.${driver.transport}`, {
          defaultValue: driver.transport,
        });
        const meta = [driver.vendor, driver.model, driver.version]
          .filter(Boolean)
          .join(" ");
        const label = meta
          ? `${driver.id} — ${meta} (${protocolLabel})`
          : `${driver.id} (${protocolLabel})`;
        return { value: driver.id, label };
      }),
    [drivers, t],
  );

  // Filter transports based on selected driver's protocol
  const availableTransports = useMemo(() => {
    if (!selectedDriver) return [];
    return transports.filter(
      (transport) => transport.protocol === selectedDriver.transport,
    );
  }, [selectedDriver, transports]);

  // Prepare transport options for select
  const transportOptions = useMemo(
    () =>
      availableTransports.map((transport) => {
        const protocolLabel = t(`transports:protocols.${transport.protocol}`, {
          defaultValue: transport.protocol,
        });
        return {
          value: transport.id,
          label: `${transport.name} (${protocolLabel})`,
        };
      }),
    [availableTransports, t],
  );

  // Get required config fields
  const requiredConfigFields = useMemo(
    () =>
      new Set(
        selectedDriver?.deviceConfig
          .filter((field) => field.required)
          .map((field) => field.name) ?? [],
      ),
    [selectedDriver],
  );

  // Get config fields with labels
  const configFields = useMemo(
    () =>
      selectedDriver?.deviceConfig.map((field) => ({
        name: field.name,
        label: toLabel(field.name),
        required: requiredConfigFields.has(field.name),
      })) ?? [],
    [selectedDriver, requiredConfigFields],
  );

  // Discovery switch state — deferred in create mode, immediate in edit mode.
  const discovery = useDeviceDiscovery({
    transportId: transportId || undefined,
    driverId: driverId || undefined,
    protocol: selectedTransport?.protocol,
    deferred: isCreate,
  });

  // Network modal state
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
    baseFormMethods.setValue("transportId", transport.id, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: DeviceCreatePayload) => createDevice(payload),
    onSuccess: async (device: Device) => {
      queryClient.refetchQueries({ queryKey: ["devices"] });
      try {
        if (isPhysicalDevice(device)) {
          await discovery.flush({
            transportId: device.transportId,
            driverId: device.driverId,
          });
        }
      } catch {
        // Toast is surfaced inside useDeviceDiscovery's mutation onError.
        // Device creation already succeeded — navigate so the user isn't
        // stranded; they can retry the discovery toggle from the edit page.
      }
      navigate(`../${device.id}`, { relative: "path" });
    },
  });
  const updateMutation = useMutation({
    mutationFn: (updatePayload: Partial<Device> & { deviceId: string }) =>
      updateDevice(updatePayload.deviceId, updatePayload),
    onSuccess: (device: Device) => {
      queryClient.refetchQueries({ queryKey: ["devices", device.id] });
      navigate(`..`, { relative: "path" });
    },
  });

  // Form submission handler
  const handleSubmit = async () => {
    const [baseValid, configValid] = await Promise.all([
      baseFormMethods.trigger(),
      configFormMethods.trigger(),
    ]);

    if (!baseValid || !configValid) return;

    if (!isCreate && device) {
      // update
      await updateMutation.mutateAsync({
        ...baseFormMethods.getValues(),
        config: configFormMethods.getValues(),
        deviceId: device.id,
      });
    } else {
      await createMutation.mutateAsync({
        ...baseFormMethods.getValues(),
        config: configFormMethods.getValues(),
      });
    }
  };

  // Cancel handler
  const handleCancel = () => {
    navigate("..", { relative: "path" });
  };

  // Calculate submit disabled state
  const isSubmitDisabled = (): boolean => {
    if (isCreate) {
      return (
        !(
          baseFormMethods.formState.isValid &&
          configFormMethods.formState.isValid
        ) || createMutation.isPending
      );
    }
    return !(
      baseFormMethods.formState.isDirty || configFormMethods.formState.isDirty
    );
  };

  return {
    // Form methods
    baseFormMethods,
    configFormMethods,

    // Data and options
    driverOptions,
    transportOptions,
    configFields,
    selectedDriver,
    selectedTransport,

    // Query states
    driversLoading: driversQuery.isLoading,
    transportsLoading: transportsQuery.isLoading,
    transportsError: transportsQuery.error,

    // Mutation state
    isPending: createMutation.isPending,

    // Handlers
    handleSubmit,
    handleCancel,

    // Computed states
    submitDisabled: isSubmitDisabled(),

    // Network modal
    networkModalState,
    openCreateNetworkModal,
    openEditNetworkModal,
    closeNetworkModal,
    onNetworkSubmitted,

    // Discovery switch
    discovery,
  };
};
