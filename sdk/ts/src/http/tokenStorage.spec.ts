import { describe, expect, it } from "vitest";

import { MemoryTokenStorage } from "./tokenStorage";

describe("MemoryTokenStorage", () => {
  it("stores, returns and clears a token pair", () => {
    const storage = new MemoryTokenStorage();
    expect(storage.getTokens()).toBeNull();

    storage.setTokens({ accessToken: "a", refreshToken: "r" });
    expect(storage.getTokens()).toEqual({
      accessToken: "a",
      refreshToken: "r",
    });

    storage.clear();
    expect(storage.getTokens()).toBeNull();
  });
});
