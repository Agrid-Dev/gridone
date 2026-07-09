import { createContext, useContext, useState, type ReactNode } from "react";
import { GridoneClient } from "@gridone/sdk";
import { API_BASE_URL } from "@/lib/apiConfig";
import { CookieTokenStorage } from "@/lib/cookieTokenStorage";

const GridoneClientContext = createContext<GridoneClient | null>(null);

export function GridoneClientProvider({
  client,
  children,
}: {
  /** Override for tests; defaults to a client wired to the API base URL. */
  client?: GridoneClient;
  children: ReactNode;
}) {
  const [value] = useState(
    () =>
      client ??
      new GridoneClient({
        baseUrl: API_BASE_URL,
        tokenStorage: new CookieTokenStorage(),
      }),
  );
  return (
    <GridoneClientContext.Provider value={value}>
      {children}
    </GridoneClientContext.Provider>
  );
}

export function useGridoneClient(): GridoneClient {
  const client = useContext(GridoneClientContext);
  if (!client) {
    throw new Error(
      "useGridoneClient must be used inside GridoneClientProvider",
    );
  }
  return client;
}
