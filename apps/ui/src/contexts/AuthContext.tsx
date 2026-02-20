import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  clearToken,
  getMe,
  getStoredToken,
  login as apiLogin,
  storeToken,
} from "@/api/auth";
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

  const logout = useCallback(() => {
    clearToken();
    setState({ status: "unauthenticated" });
  }, []);

  const refreshMe = useCallback(async () => {
    const user = await getMe();
    setState({ status: "authenticated", user });
    return user;
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setState({ status: "unauthenticated" });
      return;
    }
    refreshMe()
      .catch(() => {
        clearToken();
        setState({ status: "unauthenticated" });
      });
  }, [refreshMe]);

  const login = useCallback(
    async (username: string, password: string) => {
      const response = await apiLogin({ username, password });
      storeToken(response.access_token);
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
