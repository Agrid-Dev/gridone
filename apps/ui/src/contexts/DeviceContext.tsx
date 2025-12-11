import {
  ReactNode,
  createContext,
  useContext,
  useMemo,
  useCallback,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket, WebSocketStatus } from "@/hooks/useWebSocket";
import {
  buildWebSocketUrl,
  createDeviceMessageHandler,
  WebSocketMessage,
} from "@/api/socket";

type DeviceContextValue = {
  status: WebSocketStatus;
  isConnected: boolean;
};

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const handleMessage = useCallback(
    createDeviceMessageHandler(queryClient),
    [queryClient]
  );

  const websocketUrl = useMemo(() => buildWebSocketUrl(), []);

  const { status, isConnected } = useWebSocket<WebSocketMessage>({
    url: websocketUrl,
    onMessage: handleMessage,
  });

  const value = useMemo(
    () => ({
      status,
      isConnected,
    }),
    [status, isConnected]
  );

  return (
    <DeviceContext.Provider value={value}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDeviceContext(): DeviceContextValue {
  const ctx = useContext(DeviceContext);
  if (!ctx) {
    throw new Error(
      "useDeviceContext must be used within a DeviceProvider"
    );
  }
  return ctx;
}
