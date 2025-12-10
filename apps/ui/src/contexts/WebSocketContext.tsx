import {
  ReactNode,
  createContext,
  useContext,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL, Device } from "@/api/devices";
import { useWebSocket, WebSocketStatus } from "@/hooks/useWebSocket";

type DeviceUpdateMessage = {
  type: "device_update";
  device_id: string;
  attribute: string;
  value: string | number | boolean | null;
  timestamp?: string | null;
};

type DeviceFullUpdateMessage = {
  type: "device_full_update";
  device: Device;
};

type DeviceListUpdateMessage = {
  type: "device_list_update";
  devices: Device[];
};

type ErrorMessage = { type: "error"; message: string };
type PingMessage = { type: "ping" | "pong"; timestamp?: string };

type WebSocketMessage =
  | DeviceUpdateMessage
  | DeviceFullUpdateMessage
  | DeviceListUpdateMessage
  | ErrorMessage
  | PingMessage
  | Record<string, unknown>;

type WebSocketContextValue = {
  status: WebSocketStatus;
  isConnected: boolean;
};

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

function buildWebSocketUrl() {
  const base =
    import.meta.env.VITE_WS_BASE_URL ??
    import.meta.env.VITE_API_BASE_URL ??
    API_BASE_URL;

  try {
    const url = new URL(base);
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const pathname = url.pathname.replace(/\/+$/, "");
    return `${protocol}//${url.host}${pathname}/ws/devices`;
  } catch {
    const sanitized = base.replace(/\/+$/, "").replace(/^http/, "ws");
    return `${sanitized}/ws/devices`;
  }
}

function applyDeviceUpdate(
  device: Device,
  attribute: string,
  value: string | number | boolean | null,
  timestamp?: string | null
) {
  const existingAttribute = device.attributes[attribute];
  if (!existingAttribute) {
    return device;
  }

  const updatedAttributes = {
    ...device.attributes,
    [attribute]: {
      ...existingAttribute,
      current_value: value,
      last_updated: timestamp ?? new Date().toISOString(),
    },
  };

  return { ...device, attributes: updatedAttributes };
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const renderCountRef = useRef(0);
  const providerIdRef = useRef(Math.random().toString(36).substring(7));
  const prevQueryClientRef = useRef(queryClient);

  renderCountRef.current += 1;

  const queryClientChanged = prevQueryClientRef.current !== queryClient;
  if (queryClientChanged) {
    // queryClient reference changed
  }
  prevQueryClientRef.current = queryClient;

  const handleMessageRef = useRef<((message: WebSocketMessage) => void) | null>(
    null
  );
  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      if (typeof message !== "object" || !message || !("type" in message)) {
        return;
      }

      if (message.type === "device_update") {
        queryClient.setQueryData<Device | undefined>(
          ["device", message.device_id],
          (current) =>
            current
              ? applyDeviceUpdate(
                  current,
                  message.attribute,
                  message.value,
                  message.timestamp
                )
              : current
        );

        queryClient.setQueryData<Device[] | undefined>(["devices"], (current) =>
          current?.map((device) =>
            device.id === message.device_id
              ? applyDeviceUpdate(
                  device,
                  message.attribute,
                  message.value,
                  message.timestamp
                )
              : device
          )
        );
        return;
      }

      if (message.type === "device_full_update") {
        queryClient.setQueryData(["device", message.device.id], message.device);
        queryClient.setQueryData<Device[] | undefined>(
          ["devices"],
          (current) => {
            if (!current) {
              return [message.device];
            }
            const exists = current.some((d) => d.id === message.device.id);
            return exists
              ? current.map((d) =>
                  d.id === message.device.id ? message.device : d
                )
              : [...current, message.device];
          }
        );
        return;
      }

      if (message.type === "device_list_update") {
        queryClient.setQueryData(["devices"], message.devices);
        return;
      }

      if (message.type === "error") {
        // Error message received
      }
    },
    [queryClient]
  );

  const prevHandleMessageRef = handleMessageRef.current;
  handleMessageRef.current = handleMessage;
  if (prevHandleMessageRef && prevHandleMessageRef !== handleMessage) {
    // handleMessage callback reference changed
  }

  const websocketUrl = useMemo(() => {
    const url = buildWebSocketUrl();
    return url;
  }, []);

  const prevStatusRef = useRef<WebSocketStatus | null>(null);
  const prevIsConnectedRef = useRef<boolean | null>(null);

  const { status, isConnected } = useWebSocket<WebSocketMessage>({
    url: websocketUrl,
    onMessage: handleMessage,
  });

  const statusChanged =
    prevStatusRef.current !== null && prevStatusRef.current !== status;
  const isConnectedChanged =
    prevIsConnectedRef.current !== null &&
    prevIsConnectedRef.current !== isConnected;

  prevStatusRef.current = status;
  prevIsConnectedRef.current = isConnected;

  const value = useMemo(() => {
    const valueChanged =
      prevStatusRef.current !== status ||
      prevIsConnectedRef.current !== isConnected;
    return {
      status,
      isConnected,
    };
  }, [status, isConnected]);

  const prevValueRef = useRef<WebSocketContextValue | null>(null);
  if (prevValueRef.current && prevValueRef.current !== value) {
    const valueChanged =
      prevValueRef.current.status !== value.status ||
      prevValueRef.current.isConnected !== value.isConnected;
    // Context value changed
  }
  prevValueRef.current = value;

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error(
      "useWebSocketContext must be used within a WebSocketProvider"
    );
  }
  return ctx;
}
