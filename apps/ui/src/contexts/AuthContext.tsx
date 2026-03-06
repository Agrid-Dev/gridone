import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getMe, login as apiLogin, logout as apiLogout } from "@/api/auth";
import type { CurrentUser } from "@/api/auth";

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: CurrentUser };

type AuthContextValue = {
  state: AuthState;
  login: (username: string, password: string) => Promise<void>;
  refreshMe: () => Promise<CurrentUser>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {});
    setState({ status: "unauthenticated" });
  }, []);

  const refreshMe = useCallback(async () => {
    const user = await getMe();
    setState({ status: "authenticated", user });
    return user;
  }, []);

  useEffect(() => {
    // Try to restore session from httpOnly cookie
    refreshMe().catch(() => {
      setState({ status: "unauthenticated" });
    });
  }, [refreshMe]);

  const login = useCallback(
    async (username: string, password: string) => {
      await apiLogin({ username, password });
      await refreshMe();
    },
    [refreshMe],
  );

  return (
    <AuthContext.Provider value={{ state, login, refreshMe, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
