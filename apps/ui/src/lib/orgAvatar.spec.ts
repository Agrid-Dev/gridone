import { describe, it, expect } from "vitest";
import { isImageSrc, orgInitials, resolveOrgAvatar } from "./orgAvatar";

describe("isImageSrc", () => {
  it.each([
    "http://example.com/logo.png",
    "https://example.com/a/b/logo.svg?v=2",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
    "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
  ])("accepts %s", (value) => {
    expect(isImageSrc(value)).toBe(true);
  });

  it.each([
    ["a registry key", "hotel"],
    ["a plain word", "Accor"],
    ["empty", ""],
    ["whitespace", "   "],
    ["null", null],
    ["undefined", undefined],
    ["a relative path", "/assets/logo.png"],
    ["a non-http protocol", "ftp://example.com/logo.png"],
    ["a non-image data uri", "data:text/plain;base64,SGk="],
  ])("rejects %s", (_label, value) => {
    expect(isImageSrc(value)).toBe(false);
  });
});

describe("orgInitials", () => {
  it.each([
    ["Accor", "A"],
    ["John Doe", "JD"],
    ["  john   doe  ", "JD"],
    ["John Ronald Reuel Tolkien", "JT"],
    ["x", "X"],
    ["", ""],
    ["   ", ""],
  ])("%s -> %s", (name, expected) => {
    expect(orgInitials(name)).toBe(expected);
  });

  it("handles nullish names", () => {
    expect(orgInitials(null)).toBe("");
    expect(orgInitials(undefined)).toBe("");
  });
});

describe("resolveOrgAvatar", () => {
  const keys = new Set(["hotel", "rocket"]);

  it("prefers a matching registry icon", () => {
    expect(resolveOrgAvatar("hotel", "Accor", keys)).toEqual({
      kind: "icon",
      key: "hotel",
    });
  });

  it("falls back to an image src when the icon is not a registry key", () => {
    expect(resolveOrgAvatar("https://x.com/logo.png", "Accor", keys)).toEqual({
      kind: "image",
      src: "https://x.com/logo.png",
    });
  });

  it("falls back to initials when icon is unresolvable but a name exists", () => {
    expect(resolveOrgAvatar(null, "John Doe", keys)).toEqual({
      kind: "initials",
      text: "JD",
    });
    expect(resolveOrgAvatar("not-an-icon", "Accor", keys)).toEqual({
      kind: "initials",
      text: "A",
    });
  });

  it("falls back to neutral when nothing resolves", () => {
    expect(resolveOrgAvatar(null, null, keys)).toEqual({ kind: "fallback" });
    expect(resolveOrgAvatar("   ", "  ", keys)).toEqual({ kind: "fallback" });
  });
});
