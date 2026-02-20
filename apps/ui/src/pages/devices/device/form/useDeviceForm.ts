import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  createDevice,
  updateDevice,
  type Device,
  type DeviceCreatePayload,
} from "@/api/devices";
import { useDrivers } from "@/pages/drivers/useDrivers";
import { useTransports } from "@/pages/transports/useTransports";
import { toLabel } from "@/lib/textFormat";
import { useTranslation } from "react-i18next";
import snakecaseKeys from "snakecase-keys";

type BaseFormData = {
  name: string;
  driverId: string;
  transportId: string;
};

type ConfigFormData = Record<string, string>;

export const useDeviceForm = (device?: Device) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isCreate = device === undefined;
  const { t } = useTranslation();
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

  // Watch for driver selection changes
  const driverId = baseFormMethods.watch("driverId");

  // Find selected driver
  const selectedDriver = useMemo(
    () => drivers.find((driver) => driver.id === driverId),
    [driverId, drivers],
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
        const protocolLabel = t(`transports.protocols.${driver.transport}`, {
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
        const protocolLabel = t(`transports.protocols.${transport.protocol}`, {
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

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: DeviceCreatePayload) => createDevice(payload),
    onSuccess: (device: Device) => {
      queryClient.refetchQueries({ queryKey: ["devices"] });
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
  };
};
