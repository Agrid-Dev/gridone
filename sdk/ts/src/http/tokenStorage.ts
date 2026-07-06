/** Allows TokenStorage implementations to be synchronous or asynchronous. */
export type MaybePromise<T> = T | Promise<T>;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Strategy for persisting auth tokens between requests. The SDK ships
 * `MemoryTokenStorage`; consumers provide their own for other lifetimes
 * (e.g. a `CookieTokenStorage` in the browser for page-refresh persistence).
 */
export interface TokenStorage {
  getTokens(): MaybePromise<Tokens | null>;
  setTokens(tokens: Tokens): MaybePromise<void>;
  clear(): MaybePromise<void>;
}

/** Default storage: tokens live for the lifetime of the client instance. */
export class MemoryTokenStorage implements TokenStorage {
  private tokens: Tokens | null = null;

  getTokens(): Tokens | null {
    return this.tokens;
  }

  setTokens(tokens: Tokens): void {
    this.tokens = tokens;
  }

  clear(): void {
    this.tokens = null;
  }
}
