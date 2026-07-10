import type { Tokens, TokenStorage } from "@gridone/sdk";

const ACCESS_COOKIE = "gridone_access_token";
const REFRESH_COOKIE = "gridone_refresh_token";

/** Cookies only need to outlive the refresh token — expired JWTs are
 *  rejected server-side, so a generous lifetime is safe. */
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
}

function writeCookie(name: string, value: string, maxAge: number): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

/**
 * Persists the SDK token pair in browser cookies so the session survives
 * page reloads. Cookie names are distinct from the server-set httpOnly
 * `access_token` / `refresh_token` cookies to avoid clobbering them when the
 * UI and API are served same-origin.
 */
export class CookieTokenStorage implements TokenStorage {
  getTokens(): Tokens | null {
    const accessToken = readCookie(ACCESS_COOKIE);
    const refreshToken = readCookie(REFRESH_COOKIE);
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken };
  }

  setTokens(tokens: Tokens): void {
    writeCookie(ACCESS_COOKIE, tokens.accessToken, MAX_AGE_SECONDS);
    writeCookie(REFRESH_COOKIE, tokens.refreshToken, MAX_AGE_SECONDS);
  }

  clear(): void {
    writeCookie(ACCESS_COOKIE, "", 0);
    writeCookie(REFRESH_COOKIE, "", 0);
  }
}
