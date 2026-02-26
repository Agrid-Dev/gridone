import {
  ReactNode,
  createContext,
  useContext,
  useMemo,
  useCallback,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getStoredToken } from "@/api/auth";
import { useWebSocket, WebSocketStatus } from "@/hooks/useWebSocket";
import {
  buildWebSocketUrl,
  createDeviceMessageHandler,
  WebSocketMessage,
} from "@/api/socket";
import { useAuth } from "./AuthContext";

type DeviceContextValue = {
  status: WebSocketStatus;
  isConnected: boolean;
};

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { state: authState } = useAuth();
  const token = authState.status === "authenticated" ? getStoredToken() : null;

  const handleMessage = useCallback(createDeviceMessageHandler(queryClient), [
    queryClient,
  ]);

  const websocketUrl = useMemo(
    () => (token ? buildWebSocketUrl(token) : ""),
    [token],
  );

  const { status, isConnected } = useWebSocket<WebSocketMessage>({
    url: websocketUrl,
    enabled: !!token,
    onMessage: handleMessage,
  });

  const value = useMemo(
    () => ({
      status,
      isConnected,
    }),
    [status, isConnected],
  );

  return (
    <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
  );
}

export function useDeviceContext(): DeviceContextValue {
  const ctx = useContext(DeviceContext);
  if (!ctx) {
    throw new Error("useDeviceContext must be used within a DeviceProvider");
  }
  return ctx;
}
