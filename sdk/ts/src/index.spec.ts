import { describe, expect, it } from "vitest";

import { hello } from "./index";

describe("hello", () => {
  it("greets the given name", () => {
    expect(hello("Gridone")).toBe("Hello, Gridone! This is @gridone/sdk.");
  });

  it("defaults to world", () => {
    expect(hello()).toBe("Hello, world! This is @gridone/sdk.");
  });
});
