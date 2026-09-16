import { describe, expect, it } from "vitest";
import i18n from "./i18n";

describe("i18n composition", () => {
  it("lowercases a catalog noun composed into a French sentence", () => {
    expect(
      i18n.t("devices:groups.deviceCount", { total: 8, type: "Thermostats" }),
    ).toBe("8 thermostats");
    expect(
      i18n.t("devices:groups.deviceCount", {
        total: 3,
        type: "Pompes à chaleur",
      }),
    ).toBe("3 pompes à chaleur");
  });

  it("leaves the English composition alone", () => {
    expect(
      i18n.getFixedT("en", "devices")("groups.deviceCount", {
        total: 8,
        type: "Thermostats",
      }),
    ).toBe("8 Thermostats");
  });
});
