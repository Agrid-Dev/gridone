import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The path goes through a parameter: Vite rewrites `new URL("<literal>",
// import.meta.url)` into a served asset URL, which readFileSync refuses.
const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const INDEX_CSS = read("../index.css");

/** The `--name: value;` declarations of the first block opened by `selector`
 *  at the start of a line (`:root {`, `.dark {`, `.sidebar-chrome {`). */
function block(selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = INDEX_CSS.match(
    new RegExp(`^\\s*${escaped}\\s*\\{([^}]*)\\}`, "m"),
  );
  if (!body) throw new Error(`no ${selector} block in index.css`);
  return new Map(
    [...body[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
}

const LIGHT = block(":root");
const DARK = new Map([...LIGHT, ...block(".dark")]);

/** WCAG relative luminance of an `H S% L%` token. */
function luminance(tokens: Map<string, string>, name: string): number {
  const value = tokens.get(name);
  const match = value?.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!match) throw new Error(`--${name} is not an HSL triplet: ${value}`);
  const [h, s, l] = [
    Number(match[1]),
    Number(match[2]) / 100,
    Number(match[3]) / 100,
  ];
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}

function contrast(tokens: Map<string, string>, text: string, surface: string) {
  const [a, b] = [luminance(tokens, text), luminance(tokens, surface)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Text token on the surface it is painted on, inside the app chrome. */
const PAIRS: [text: string, surface: string][] = [
  ["primary-foreground", "primary"],
  ["foreground", "background"],
  ["foreground", "card"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-muted-foreground", "sidebar"],
  // The device count sits on the active entry.
  ["sidebar-muted-foreground", "sidebar-accent"],
  ["sidebar-accent-foreground", "sidebar-accent"],
];

describe("theme tokens", () => {
  it("no longer carries the Agrid blue", () => {
    expect(INDEX_CSS).not.toMatch(/201 90% 27%|201 85% 55%/);
  });

  it("paints the sidebar with its own tokens", () => {
    const scope = block(".sidebar-chrome");
    expect(scope.get("foreground")).toBe("var(--sidebar-foreground)");
    expect(scope.get("muted-foreground")).toBe(
      "var(--sidebar-muted-foreground)",
    );
    expect(scope.get("accent")).toBe("var(--sidebar-accent)");
    expect(scope.get("accent-foreground")).toBe(
      "var(--sidebar-accent-foreground)",
    );
  });

  it.each([
    ["light", LIGHT],
    ["dark", DARK],
  ] as const)("meets AA (4.5:1) for chrome text in %s mode", (_, tokens) => {
    for (const [text, surface] of PAIRS) {
      expect(
        contrast(tokens, text, surface),
        `--${text} on --${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
