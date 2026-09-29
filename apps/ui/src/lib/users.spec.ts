import { describe, expect, it } from "vitest";
import { userDisplayName } from "./users";

describe("userDisplayName", () => {
  it.each([
    [{ id: "u1", name: "Réception", username: "reception" }, "Réception"],
    [{ id: "u1", name: "Réception" }, "Réception"],
    [{ id: "u1", name: "", username: "reception" }, "reception"],
    [{ id: "u1", name: "  ", username: "reception" }, "reception"],
    [{ id: "u1", name: "" }, "u1"],
    [{ id: "u1" }, "u1"],
  ])("labels %o as %s", (user, expected) => {
    expect(userDisplayName(user)).toBe(expected);
  });
});
