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
import { useAuth } from "@/contexts/AuthContext";
import { cookieTokenStorage } from "@/lib/cookieTokenStorage";
import { isGridoneError } from "@gridone/sdk";

/**
 * The server negotiates `gridone` and reads the token from the second offer:
 * a subprotocol is the only header a browser `WebSocket` can set.
 */
const AUTH_SUBPROTOCOL_PREFIX = "gridone.auth.bearer.";

type DeviceContextValue = {
  status: WebSocketStatus;
  isConnected: boolean;
};

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { state, refreshMe, logout } = useAuth();

  const handleMessage = useCallback(createDeviceMessageHandler(queryClient), [
    queryClient,
  ]);

  const websocketUrl = useMemo(() => buildWebSocketUrl(), []);

  const getProtocols = useCallback(() => {
    const accessToken = cookieTokenStorage.getTokens()?.accessToken;
    return accessToken
      ? ["gridone", `${AUTH_SUBPROTOCOL_PREFIX}${accessToken}`]
      : undefined;
  }, []);

  // The server closes the socket when the access token expires. `/auth/me`
  // answers 401 on an expired token, which drives the SDK's refresh and writes
  // a fresh one to cookie storage for the next `getProtocols()`.
  const beforeReconnect = useCallback(async () => {
    try {
      await refreshMe();
    } catch (error) {
      // A 401 survives the SDK's refresh, so the refresh token is dead too and
      // the session is over: end it here rather than reconnect forever against
      // a session the API has forgotten while the UI still believes it is
      // logged in. Anything else is a transport blip — keep the session and let
      // the backoff retry.
      if (isGridoneError(error) && error.status === 401) {
        logout();
      }
    }
  }, [refreshMe, logout]);

  const { status, isConnected } = useWebSocket<WebSocketMessage>({
    url: websocketUrl,
    enabled: state.status === "authenticated",
    onMessage: handleMessage,
    getProtocols,
    beforeReconnect,
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
