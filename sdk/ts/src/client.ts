import type { FetchLike, HttpMethod, RequestOptions } from "./http/httpClient";
import { HttpClient } from "./http/httpClient";
import type { TokenStorage } from "./http/tokenStorage";
import { MemoryTokenStorage } from "./http/tokenStorage";

export interface GridoneClientConfig {
  /** Root URL of the Gridone API, e.g. `http://localhost:8000`. */
  baseUrl: string;
  /** Defaults to `MemoryTokenStorage` (tokens live as long as the client). */
  tokenStorage?: TokenStorage;
  /**
   * Defaults to the global `fetch`. Inject a custom implementation for
   * testing or Node-side tuning (e.g. an undici Agent-backed fetch).
   */
  fetch?: FetchLike;
}

export class GridoneClient {
  private readonly http: HttpClient;

  constructor(config: GridoneClientConfig) {
    this.http = new HttpClient({
      baseUrl: config.baseUrl,
      tokenStorage: config.tokenStorage ?? new MemoryTokenStorage(),
      fetch: config.fetch,
    });
  }

  /** Authenticates and stores the token pair; subsequent requests are authenticated. */
  login(username: string, password: string): Promise<void> {
    return this.http.login(username, password);
  }

  /** Forgets stored tokens (server notification is best-effort). */
  logout(): Promise<void> {
    return this.http.logout();
  }

  /**
   * Raw API call. Resource namespaces (`client.devices`, ...) build on this
   * and land in AGR-375; until then this is the public way to reach any
   * endpoint. Payload keys are wire-format snake_case.
   */
  request<T>(
    method: HttpMethod,
    path: string,
    options?: RequestOptions,
  ): Promise<T> {
    return this.http.request<T>(method, path, options);
  }
}
