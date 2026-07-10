import { beforeEach, describe, expect, it } from "vitest";
import { CookieTokenStorage } from "./cookieTokenStorage";

function clearAllCookies() {
  for (const part of document.cookie.split("; ")) {
    const name = part.split("=")[0];
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
}

describe("CookieTokenStorage", () => {
  let storage: CookieTokenStorage;

  beforeEach(() => {
    clearAllCookies();
    storage = new CookieTokenStorage();
  });

  it("returns null when no tokens are stored", () => {
    expect(storage.getTokens()).toBeNull();
  });

  it("round-trips a token pair", () => {
    storage.setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    expect(storage.getTokens()).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });
  });

  it("overwrites a previously stored pair", () => {
    storage.setTokens({ accessToken: "a1", refreshToken: "r1" });
    storage.setTokens({ accessToken: "a2", refreshToken: "r2" });
    expect(storage.getTokens()).toEqual({
      accessToken: "a2",
      refreshToken: "r2",
    });
  });

  it("stores values containing cookie-hostile characters", () => {
    const accessToken = "a;b=c, d";
    storage.setTokens({ accessToken, refreshToken: "r" });
    expect(storage.getTokens()).toEqual({ accessToken, refreshToken: "r" });
  });

  it("returns null after clear", () => {
    storage.setTokens({ accessToken: "a", refreshToken: "r" });
    storage.clear();
    expect(storage.getTokens()).toBeNull();
  });

  it("survives a new instance (persistence across reloads)", () => {
    storage.setTokens({ accessToken: "a", refreshToken: "r" });
    expect(new CookieTokenStorage().getTokens()).toEqual({
      accessToken: "a",
      refreshToken: "r",
    });
  });
});
