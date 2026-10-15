import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DriverLabels, GridoneClient } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { useAttributeDescription } from "@/hooks/useAttributeDescription";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { DriverLabelsProvider } from "./DriverLabelsContext";
import { GridoneClientProvider } from "./GridoneClientContext";

vi.mock("react-i18next", () =>
  createI18nMock(
    { "attributes.temperature": "Température" },
    { language: "fr" },
  ),
);

const THERMOSTAT_LABELS: DriverLabels = {
  revision: "r1",
  attributes: {
    temperature_setpoint: {
      label: { default: "Setpoint", translations: { fr: "Consigne" } },
      description: { default: "Requested room temperature" },
    },
  },
};

function setup() {
  const getLabels = vi.fn(async () => THERMOSTAT_LABELS);
  const client = { drivers: { getLabels } } as unknown as GridoneClient;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <GridoneClientProvider client={client}>
        <DriverLabelsProvider>{children}</DriverLabelsProvider>
      </GridoneClientProvider>
    </QueryClientProvider>
  );
  return { getLabels, wrapper };
}

const THERMOSTAT = { driver_id: "thermostat", driver_revision: "r1" };

afterEach(() => vi.restoreAllMocks());

describe("driver labels", () => {
  it("names an attribute from its driver's document, fetched once per driver", async () => {
    const { getLabels, wrapper } = setup();
    const { result } = renderHook(
      () => {
        const labelFor = useAttributeLabel();
        return {
          setpoint: labelFor("temperature_setpoint", THERMOSTAT),
          twin: labelFor("temperature_setpoint", { ...THERMOSTAT }),
          temperature: labelFor("temperature", THERMOSTAT),
        };
      },
      { wrapper },
    );
    // The catalog answers while the document loads.
    expect(result.current.setpoint).toBe("Temperature Setpoint");
    await waitFor(() => expect(result.current.setpoint).toBe("Consigne"));
    expect(result.current.twin).toBe("Consigne");
    // An attribute the driver does not label keeps the catalog wording.
    expect(result.current.temperature).toBe("Température");
    expect(getLabels).toHaveBeenCalledExactlyOnceWith("thermostat");
  });

  it("describes an attribute from the same document", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => {
        const describe = useAttributeDescription();
        return {
          setpoint: describe("temperature_setpoint", THERMOSTAT),
          temperature: describe("temperature", THERMOSTAT),
        };
      },
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.setpoint).toBe("Requested room temperature"),
    );
    expect(result.current.temperature).toBeUndefined();
  });

  it("reads a label the server already resolved for a row of several devices", () => {
    const { getLabels, wrapper } = setup();
    const { result } = renderHook(() => useAttributeLabel(), { wrapper });
    expect(
      result.current("temperature", {
        label: {
          default: "Temp",
          translations: { fr: "Température ambiante" },
        },
      }),
    ).toBe("Température ambiante");
    expect(result.current("fan_speed", { label: null })).toBe("Fan Speed");
    expect(getLabels).not.toHaveBeenCalled();
  });

  it("refetches when a device moves to a new driver revision", async () => {
    const { getLabels, wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ revision }: { revision: string }) =>
        useAttributeLabel()("temperature_setpoint", {
          driver_id: "thermostat",
          driver_revision: revision,
        }),
      { wrapper, initialProps: { revision: "r1" } },
    );
    await waitFor(() => expect(result.current).toBe("Consigne"));
    getLabels.mockResolvedValueOnce({
      ...THERMOSTAT_LABELS,
      revision: "r2",
      attributes: {
        temperature_setpoint: { label: { default: "Target" } },
      },
    });
    act(() => rerender({ revision: "r2" }));
    await waitFor(() => expect(result.current).toBe("Target"));
    expect(getLabels).toHaveBeenCalledTimes(2);
  });
});
