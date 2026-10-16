import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import i18next from "i18next";
import { describe, expect, it } from "vitest";

// What the code and the API call a fault, the interface calls an alert; the
// highest severity, `alert` in the API, reads Critical.

type Tree = { [key: string]: Tree | string };

const LOCALES = resolve(import.meta.dirname, "../locales");

/** Every namespace of a language, as its JSON catalog. */
function catalogs(lang: string): Record<string, Tree> {
  const dir = resolve(LOCALES, lang);
  return Object.fromEntries(
    readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => [
        file.replace(/\.json$/, ""),
        JSON.parse(readFileSync(resolve(dir, file), "utf8")) as Tree,
      ]),
  );
}

/** Every label of a language as `namespace:key.path` and its text. */
function labels(catalog: Record<string, Tree>): [string, string][] {
  const found: [string, string][] = [];
  const walk = (node: Tree | string, path: string) => {
    if (typeof node === "string") found.push([path, node]);
    else
      for (const [key, child] of Object.entries(node))
        walk(child, path.endsWith(":") ? path + key : `${path}.${key}`);
  };
  for (const [namespace, tree] of Object.entries(catalog))
    walk(tree, `${namespace}:`);
  return found;
}

const FR = catalogs("fr");
const EN = catalogs("en");

describe("alert vocabulary", () => {
  // « par défaut » (a default value) is another word and stays.
  it("never calls a fault « défaut » in French", () => {
    expect(
      labels(FR).filter(([, text]) =>
        /d[ée]faut/i.test(text.replace(/par d[ée]faut/gi, "")),
      ),
    ).toEqual([]);
  });

  it("never calls a fault « fault » in English", () => {
    expect(
      labels(EN).filter(([, text]) =>
        /fault/i.test(text.replace(/default/gi, "")),
      ),
    ).toEqual([]);
  });

  it.each([
    ["fr", FR, { alert: "critique", warning: "avertissement", info: "info" }],
    ["en", EN, { alert: "critical", warning: "warning", info: "info" }],
  ])("names the severity levels in %s", (_, catalog, levels) => {
    expect((catalog.common.common as Tree).severity).toEqual(levels);
  });

  it("agrees an alert in gender and number", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({
      lng: "fr",
      resources: { fr: FR },
      defaultNS: "common",
      interpolation: { escapeValue: false },
    });
    const t = i18n.t as (key: string, options?: object) => string;
    expect(t("sidebar.faultsBadge", { count: 1 })).toBe("1 alerte active");
    expect(t("sidebar.faultsBadge", { count: 3 })).toBe("3 alertes actives");
    expect(t("common.severityCount.alert", { count: 1 })).toBe(
      "1 alerte critique",
    );
    expect(t("common.severityCount.alert", { count: 2 })).toBe(
      "2 alertes critiques",
    );
  });
});
