import type { TFunction } from "i18next";
import type { Driver } from "@/api/drivers";
import type { Transport } from "@/api/transports";

export type DriverTransportOption = { value: string; label: string };

/** Format drivers as select options: `"<id> — <vendor model version> (<protocol>)"`
 *  (the protocol suffix only, when no vendor metadata is set). Shared by the
 *  device create form and the config page's driver & transport card. */
export function buildDriverOptions(
  drivers: Driver[],
  t: TFunction<"devices">,
): DriverTransportOption[] {
  return drivers.map((driver) => {
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
  });
}

/** Transports whose protocol matches the selected driver's. */
export function filterTransportsForDriver(
  transports: Transport[],
  driver: Driver | undefined,
): Transport[] {
  if (!driver) return [];
  return transports.filter(
    (transport) => transport.protocol === driver.transport,
  );
}

/** Format transports as select options: `"<name> (<protocol>)"`. */
export function buildTransportOptions(
  transports: Transport[],
  t: TFunction<"devices">,
): DriverTransportOption[] {
  return transports.map((transport) => {
    const protocolLabel = t(`transports:protocols.${transport.protocol}`, {
      defaultValue: transport.protocol,
    });
    return {
      value: transport.id,
      label: `${transport.name} (${protocolLabel})`,
    };
  });
}
