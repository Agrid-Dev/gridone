// Disposable production benchmark, never staged.
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Device, GridoneClient } from "@gridone/sdk";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { DevicePresentation } from "@/components/device-ui/DevicePresentation";
import type { PresentationV1 } from "@/components/device-ui/document";
import { useDeviceControlRuntime } from "@/components/device-ui/runtime";
const document: PresentationV1 = {
  schema_version: 1,
  requires: ["layout/1", "measurements/1"],
  controls: {},
  assets: {},
  bindings: Object.fromEntries(
    Array.from({ length: 300 }, (_, i) => [
      `b${i}`,
      { attribute: `sensor_${i}` },
    ]),
  ),
  page: {
    kind: "columns",
    items: Array.from({ length: 5 }, (_, column) => ({
      weight: 1,
      content: {
        kind: "measurements" as const,
        items: Array.from({ length: 30 }, (_, i) => ({
          binding: `b${column * 30 + i}`,
          formatter: { decimals: 0 },
        })),
      },
    })),
  },
};
const queryClient = new QueryClient();
const client = { devices: {} } as GridoneClient;
let socket: WebSocket;
const samples: number[] = [];
function Probe() {
  const [tick, setTick] = useState({ value: 0, received: 0 });
  const [report, setReport] = useState("Connecting");
  const device = useMemo(
    () =>
      ({
        id: "performance-fixture",
        attributes: Object.fromEntries(
          Array.from({ length: 300 }, (_, i) => [
            `sensor_${i}`,
            {
              name: `sensor_${i}`,
              kind: "standard",
              data_type: "int",
              current_value: tick.value,
              read_write_modes: ["read"],
            },
          ]),
        ),
      }) as unknown as Device,
    [tick.value],
  );
  const runtime = useDeviceControlRuntime(device, {});
  useEffect(() => {
    socket = new WebSocket(`ws://${location.host}/bench-events`);
    socket.onmessage = (event) =>
      setTick({
        value: JSON.parse(event.data).value,
        received: performance.now(),
      });
    return () => socket.close();
  }, []);
  useLayoutEffect(() => {
    if (!tick.received) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const values = [...window.document.querySelectorAll("dd")];
        if (
          values.length !== 150 ||
          values.some((el) => el.textContent !== String(tick.value))
        ) {
          setReport("ERROR: stale displayed values");
          return;
        }
        if (tick.value > 10) samples.push(performance.now() - tick.received);
        if (samples.length === 100) {
          const sorted = [...samples].sort((a, b) => a - b);
          setReport(
            JSON.stringify({
              samples: samples.length,
              attributes: 300,
              visibleMeasurements: values.filter((el) => {
                const b = el.getBoundingClientRect();
                return b.top >= 0 && b.bottom <= innerHeight;
              }).length,
              p50: sorted[49],
              p95: sorted[94],
              max: sorted[99],
              userAgent: navigator.userAgent,
              viewport: [innerWidth, innerHeight],
              visibility: window.document.visibilityState,
            }),
          );
        } else socket.send("next");
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [tick]);
  return (
    <main>
      <h1>Presentation performance: 300 attributes / 150 measurements</h1>
      <output data-testid="performance-result">{report}</output>
      <DevicePresentation
        document={document}
        subject={device}
        runtime={runtime}
        assetUrl={() => undefined}
        glyphSet={() => undefined}
        fallback={<p>ERROR fallback</p>}
      />
    </main>
  );
}
export function PerformanceProbe() {
  return (
    <QueryClientProvider client={queryClient}>
      <GridoneClientProvider client={client}>
        <Probe />
      </GridoneClientProvider>
    </QueryClientProvider>
  );
}
