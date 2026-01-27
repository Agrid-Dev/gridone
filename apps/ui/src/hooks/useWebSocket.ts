import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type WebSocketStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

type UseWebSocketOptions<TMessage> = {
  url: string;
  enabled?: boolean;
  onMessage?: (message: TMessage) => void;
};

const MAX_BACKOFF_MS = 30000;

function parseMessage(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function useWebSocket<TMessage = unknown>({
  url,
  enabled = true,
  onMessage,
}: UseWebSocketOptions<TMessage>) {
  const [status, setStatus] = useState<WebSocketStatus>("idle");
  const [lastMessage, setLastMessage] = useState<TMessage | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const onMessageRef = useRef(onMessage);
  const effectRunCountRef = useRef(0);

  onMessageRef.current = onMessage;

  const disconnectRef = useRef<(() => void) | null>(null);
  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      window.clearTimeout(reconnectTimer.current);
    }
    reconnectTimer.current = null;

    if (socketRef.current) {
      socketRef.current.close();
    }
    socketRef.current = null;
    setStatus("closed");
  }, []);

  const prevDisconnectRef = disconnectRef.current;
  disconnectRef.current = disconnect;
  if (prevDisconnectRef && prevDisconnectRef !== disconnect) {
    // disconnect callback reference changed
  }

  const prevUrlRef = useRef<string | null>(null);
  const prevEnabledRef = useRef<boolean | undefined>(undefined);
  const prevDisconnectInEffectRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    effectRunCountRef.current += 1;

    const urlChanged =
      prevUrlRef.current !== null && prevUrlRef.current !== url;
    const enabledChanged =
      prevEnabledRef.current !== undefined &&
      prevEnabledRef.current !== enabled;
    const disconnectChanged =
      prevDisconnectInEffectRef.current !== null &&
      prevDisconnectInEffectRef.current !== disconnect;

    if (urlChanged || enabledChanged || disconnectChanged) {
      // Dependencies changed
    }

    prevUrlRef.current = url;
    prevEnabledRef.current = enabled;
    prevDisconnectInEffectRef.current = disconnect;

    if (!enabled) {
      disconnect();
      return () => {
        // Cleanup for disabled state
      };
    }

    let shouldReconnect = true;

    const connect = () => {
      setStatus("connecting");
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttempts.current = 0;
        setStatus("open");
      };

      socket.onmessage = (event) => {
        const parsed = parseMessage(event.data) as TMessage;
        setLastMessage(parsed);
        onMessageRef.current?.(parsed);
      };

      socket.onerror = () => {
        setStatus("error");
        socket.close();
      };

      socket.onclose = () => {
        setStatus("closed");
        socketRef.current = null;
        if (!shouldReconnect) {
          return;
        }
        const nextAttempt = reconnectAttempts.current;
        reconnectAttempts.current += 1;
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** nextAttempt);
        reconnectTimer.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      shouldReconnect = false;
      disconnect();
    };
  }, [url, enabled, disconnect]);

  const sendMessage = useCallback((payload: TMessage | string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    const message =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    socketRef.current.send(message);
  }, []);

  const isConnected = useMemo(() => status === "open", [status]);

  return {
    status,
    lastMessage,
    sendMessage,
    isConnected,
  };
}
