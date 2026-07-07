import { GridoneError, NetworkError } from "../errors";
import type { TokenStorage } from "./tokenStorage";

export type FetchLike = typeof globalThis.fetch;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type SearchParamValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean)[];

export interface RequestOptions {
  /** JSON-serialized verbatim — payload keys are wire-format snake_case. */
  body?: unknown;
  /** `null`/`undefined` values are skipped; arrays become repeated params. */
  searchParams?: Record<string, SearchParamValue>;
  headers?: Record<string, string>;
  /** How to parse the response body. Defaults to `"json"`. */
  responseType?: "json" | "text" | "blob";
}

/**
 * Internal request function handed to resource namespaces — same contract as
 * `GridoneClient.request`.
 */
export type RequestFn = <T>(
  method: HttpMethod,
  path: string,
  options?: RequestOptions,
) => Promise<T>;

export interface HttpClientConfig {
  baseUrl: string;
  tokenStorage: TokenStorage;
  fetch?: FetchLike;
}

/** Wire shape of `POST /auth/token` (OAuth2 token endpoint). */
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Internal transport: wraps native `fetch` with base-URL resolution, JSON
 * (de)serialization, bearer-token injection and reactive token refresh —
 * on a 401, one refresh (shared by concurrent requests) and one retry.
 * Errors surface as `GridoneError` / `NetworkError`.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly tokenStorage: TokenStorage;
  private readonly fetch: FetchLike;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.tokenStorage = config.tokenStorage;
    // Wrap the global so browser `fetch` keeps its required `window` binding.
    this.fetch =
      config.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    options?: RequestOptions,
  ): Promise<T> {
    const url = this.buildUrl(path, options?.searchParams);
    const tokens = await this.tokenStorage.getTokens();
    let response = await this.send(url, method, options, tokens?.accessToken);

    if (response.status === 401 && (await this.refreshTokens())) {
      const fresh = await this.tokenStorage.getTokens();
      response = await this.send(url, method, options, fresh?.accessToken);
    }

    if (!response.ok) {
      throw await this.toGridoneError(response);
    }
    return this.parseBody<T>(response, options?.responseType);
  }

  /** OAuth2 password grant; stores the returned token pair. */
  async login(username: string, password: string): Promise<void> {
    const response = await this.postForm({
      grant_type: "password",
      username,
      password,
    });
    if (!response.ok) {
      throw await this.toGridoneError(response);
    }
    await this.storeTokens((await response.json()) as TokenResponse);
  }

  /**
   * Clears stored tokens. The server call is best-effort — JWTs are stateless
   * so forgetting the tokens is the effective logout.
   */
  async logout(): Promise<void> {
    try {
      const tokens = await this.tokenStorage.getTokens();
      await this.send(
        this.buildUrl("/auth/logout"),
        "POST",
        undefined,
        tokens?.accessToken,
      );
    } catch {
      // Unreachable server must not prevent logging out locally.
    } finally {
      await this.tokenStorage.clear();
    }
  }

  private buildUrl(
    path: string,
    searchParams?: RequestOptions["searchParams"],
  ): string {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          query.append(key, String(item));
        }
      } else {
        query.set(key, String(value));
      }
    }
    const queryString = query.toString();
    return queryString ? `${url}?${queryString}` : url;
  }

  private async send(
    url: string,
    method: HttpMethod,
    options?: RequestOptions,
    accessToken?: string,
  ): Promise<Response> {
    const headers: Record<string, string> = { ...options?.headers };
    let body: string | undefined;
    if (options?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    try {
      return await this.fetch(url, { method, headers, body });
    } catch (cause) {
      const detail =
        cause instanceof Error ? cause.message : "Network request failed";
      throw new NetworkError(detail, { cause });
    }
  }

  private postForm(fields: Record<string, string>): Promise<Response> {
    return this.fetch(this.buildUrl("/auth/token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
  }

  /**
   * Exchanges the stored refresh token for a new token pair. Single-flight:
   * concurrent 401s share one refresh call. Returns whether the caller should
   * retry. A rejected refresh clears storage (the session is over); a network
   * failure does not.
   */
  private refreshTokens(): Promise<boolean> {
    this.refreshPromise ??= this.doRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<boolean> {
    const tokens = await this.tokenStorage.getTokens();
    if (!tokens?.refreshToken) {
      return false;
    }
    let response: Response;
    try {
      response = await this.postForm({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
      });
    } catch {
      return false;
    }
    if (!response.ok) {
      await this.tokenStorage.clear();
      return false;
    }
    await this.storeTokens((await response.json()) as TokenResponse);
    return true;
  }

  private async storeTokens(response: TokenResponse): Promise<void> {
    await this.tokenStorage.setTokens({
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
    });
  }

  private async toGridoneError(response: Response): Promise<GridoneError> {
    const data: unknown = await response.json().catch(() => null);
    const detail =
      data !== null && typeof data === "object" && "detail" in data
        ? typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail)
        : response.statusText;
    return new GridoneError(response.status, detail);
  }

  private async parseBody<T>(
    response: Response,
    responseType: RequestOptions["responseType"] = "json",
  ): Promise<T> {
    if (response.status === 204) {
      return undefined as T;
    }
    if (responseType === "text") {
      return (await response.text()) as T;
    }
    if (responseType === "blob") {
      return (await response.blob()) as T;
    }
    return (await response.json()) as T;
  }
}
