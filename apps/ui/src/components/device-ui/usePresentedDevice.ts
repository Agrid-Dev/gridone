import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Device } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { usePermissions } from "@/contexts/AuthContext";
import { sdkPresentationApi } from "./sdkPresentationApi";
import { useDevicePresentation } from "./useDevicePresentation";
import { controlSpecsOf } from "./presentationControls";
import { useDeviceControlRuntime } from "./runtime";

/** Keep the command runtime above every loading, compatibility and render fallback. */
export function usePresentedDevice(device: Device) {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const can = usePermissions();
  const api = useMemo(
    () =>
      sdkPresentationApi(client, (id) =>
        queryClient.fetchQuery({
          queryKey: ["device", id],
          queryFn: () => client.devices.get(id),
          staleTime: 0,
        }),
      ),
    [client, queryClient],
  );
  const presentation = useDevicePresentation(device, api);
  const document =
    presentation.status === "available" ? presentation.document : null;
  const controls = useMemo(
    () => (document ? controlSpecsOf(document) : {}),
    [document],
  );
  const runtime = useDeviceControlRuntime(device, controls, {
    canWrite: can("devices:write"),
  });
  return { presentation, runtime, pending: runtime.busy };
}
