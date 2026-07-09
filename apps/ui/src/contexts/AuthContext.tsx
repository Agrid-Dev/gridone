import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { MeResponse } from "@gridone/sdk";
import { useGridoneClient } from "./GridoneClientContext";

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: MeResponse };

export type HealthState = {
  version: string | null;
  flags: string[];
};

const HEALTH_FALLBACK: HealthState = { version: null, flags: [] };

type AuthContextValue = {
  state: AuthState;
  health: HealthState;
  login: (username: string, password: string) => Promise<void>;
  refreshMe: () => Promise<MeResponse>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useGridoneClient();
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [health, setHealth] = useState<HealthState>(HEALTH_FALLBACK);

  const logout = useCallback(async () => {
    await client.logout().catch(() => {});
    setState({ status: "unauthenticated" });
  }, [client]);

  const refreshMe = useCallback(async () => {
    const user = await client.me();
    setState({ status: "authenticated", user });
    return user;
  }, [client]);

  useEffect(() => {
    // Try to restore the session from the persisted token pair
    refreshMe().catch(() => {
      setState({ status: "unauthenticated" });
    });
  }, [refreshMe]);

  useEffect(() => {
    // Public /health gives us the app version + the runtime feature-flag set
    // emitted by the backend from GRIDONE_FEATURE_* env vars. Fail-safe: on
    // error we keep the empty defaults so the app still renders without
    // optional features.
    let cancelled = false;
    client
      .health()
      .then((h) => {
        if (cancelled) return;
        setHealth({ version: h.version ?? null, flags: h.flags ?? [] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client]);

  const login = useCallback(
    async (username: string, password: string) => {
      await client.login(username, password);
      await refreshMe();
    },
    [client, refreshMe],
  );

  return (
    <AuthContext.Provider value={{ state, health, login, refreshMe, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/**
 * Returns a helper to check if the current user has a given permission.
 * Usage: const can = usePermissions(); if (can("devices:write")) { ... }
 */
export function usePermissions(): (perm: string) => boolean {
  const { state } = useAuth();
  if (state.status !== "authenticated") return () => false;
  const perms = new Set(state.user.permissions);
  return (perm: string) => perms.has(perm);
}
