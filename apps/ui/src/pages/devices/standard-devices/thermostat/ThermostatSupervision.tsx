import type { StandardControlProps } from "../types";
import { ThermostatControl } from "./ThermostatControl";
import { ThermostatTemperatureCard } from "./ThermostatTemperatureCard";

/** Thermostat supervision layout: the control card beside the 24 h
 *  temperature chart, stacking on narrow viewports. */
export function ThermostatSupervision(props: StandardControlProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[26rem_minmax(0,1fr)]">
      <ThermostatControl {...props} />
      <ThermostatTemperatureCard deviceId={props.device.id} />
    </div>
  );
}
