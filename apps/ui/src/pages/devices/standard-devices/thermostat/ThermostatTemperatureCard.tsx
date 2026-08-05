import { useTranslation } from "react-i18next";
import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useThermostatTemperatureHistory } from "./useThermostatTemperatureHistory";

/** "Température — dernières 24 h": measured temperature as a solid line and
 *  the setpoint as a dashed step line, on a shared axis. */
export function ThermostatTemperatureCard({ deviceId }: { deviceId: string }) {
  const { t } = useTranslation("devices");
  const { timestamps, values, isLoading, hasData } =
    useThermostatTemperatureHistory(deviceId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("controls.thermostat.temperatureLast24h")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-60 w-full" />
        ) : !hasData ? (
          <p className="flex h-60 items-center justify-center text-sm text-muted-foreground">
            {t("controls.thermostat.noTemperatureHistory")}
          </p>
        ) : (
          <TimeSeriesChart
            timestamps={timestamps}
            lineSeries={[
              {
                key: "temperature",
                label: t("controls.thermostat.measured"),
              },
            ]}
            lineValues={{ temperature: values.temperature }}
            intSeries={[
              {
                key: "temperature_setpoint",
                label: t("controls.thermostat.setpoint"),
                dash: true,
              },
            ]}
            intValues={{ temperature_setpoint: values.temperature_setpoint }}
          />
        )}
      </CardContent>
    </Card>
  );
}
