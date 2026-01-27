import { describe, it, expect } from "vitest";
import { toLabel } from "./textFormat";

describe("text to Label format", () => {
  it("Empty string untouched", () => {
    expect(toLabel("")).toBe("");
  });

  it("Single word title cased", () => {
    expect(toLabel("hello")).toBe("Hello");
  });

  it("Multiple words", () => {
    expect(toLabel("hello world")).toBe("Hello World");
  });

  it("Trims spaces", () => {
    expect(toLabel(" hello world ")).toBe("Hello World");
  });

  it("Trims multiple spaces", () => {
    expect(toLabel("hello    world   ")).toBe("Hello World");
  });
});
