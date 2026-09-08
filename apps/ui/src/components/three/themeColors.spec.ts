import { describe, expect, it } from "vitest";
import { viewerThemeFixture as theme } from "@/test/viewerTheme";
import { functionKeyOf, NEUTRAL_SPACE, zoneTriplet } from "./themeColors";

/** The function-mode colour of a classification, through the public surface. */
function byFunction(objectType: string | null) {
  return zoneTriplet(
    { temperature: null, severity: null, objectType },
    theme,
    "function",
  );
}

describe("functionKeyOf", () => {
  it.each([
    ["Chambre Twin", "room"],
    ["Local technique", "technical"],
    ["Cuisine centrale", "restaurant"],
    ["Lobby & Reception", "reception"],
    ["Circulation 200", "circulation"],
  ])("classifies %s as %s", (objectType, expected) => {
    expect(functionKeyOf(objectType)).toBe(expected);
  });

  it("returns null for an unrecognised or empty classification", () => {
    expect(functionKeyOf("Espace commun")).toBeNull();
    expect(functionKeyOf(null)).toBeNull();
  });

  it("gives each recognised family its own colour, neutral otherwise", () => {
    expect(byFunction("Chambre Twin")).not.toEqual(
      byFunction("Local technique"),
    );
    expect(byFunction("Espace commun")).toEqual(NEUTRAL_SPACE);
  });
});

describe("zoneTriplet modes", () => {
  const room = {
    temperature: 26,
    severity: "alert" as const,
    objectType: "Chambre Twin",
    connection: "error" as const,
  };

  it("shows temperature (not the alert) in temperature mode", () => {
    // 26 °C leans hot: the red channel dominates, but it is the heat end of
    // the gradient, not the flat error token.
    expect(zoneTriplet(room, theme, "temperature")).toEqual(
      zoneTriplet({ ...room, severity: null }, theme, "temperature"),
    );
  });

  it("shows the fault severity in alerts mode", () => {
    expect(zoneTriplet(room, theme, "alerts")).toEqual(theme.error);
    expect(
      zoneTriplet({ ...room, severity: "warning" }, theme, "alerts"),
    ).toEqual(theme.heat);
    expect(zoneTriplet({ ...room, severity: null }, theme, "alerts")).toEqual(
      NEUTRAL_SPACE,
    );
  });

  it("shows the connection in connectivity mode", () => {
    expect(zoneTriplet(room, theme, "connectivity")).toEqual(theme.error);
    expect(
      zoneTriplet({ ...room, connection: "ok" }, theme, "connectivity"),
    ).toEqual(theme.ok);
    expect(
      zoneTriplet({ ...room, connection: null }, theme, "connectivity"),
    ).toEqual(NEUTRAL_SPACE);
  });

  it("colours by classification in function mode", () => {
    // The room family, not the alert red the same zone shows in alerts mode.
    expect(zoneTriplet(room, theme, "function")).toEqual(
      byFunction("Chambre Twin"),
    );
    expect(zoneTriplet(room, theme, "function")).not.toEqual(theme.error);
  });

  it("is neutral for a zone it knows nothing about", () => {
    expect(zoneTriplet(undefined, theme, "temperature")).toEqual(NEUTRAL_SPACE);
  });
});
