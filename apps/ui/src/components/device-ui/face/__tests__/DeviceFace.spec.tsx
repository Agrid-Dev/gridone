import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeviceFace, localize } from "../DeviceFace";
import type { DeviceFaceDocument, LoadedGlyphSet } from "../types";
import type { Scalar } from "../../conditions";

afterEach(cleanup);

const lcd: LoadedGlyphSet = {
  atlasUrl: "blob:atlas",
  atlasSize: { width: 200, height: 50 },
  lineHeight: 50,
  baseLine: 0,
  cells: {
    P: {
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      advance: 40,
      offsetX: 0,
      offsetY: 0,
    },
    "1": {
      x: 40,
      y: 0,
      width: 30,
      height: 50,
      advance: 30,
      offsetX: 0,
      offsetY: 0,
    },
  },
};

const doc: DeviceFaceDocument = {
  kind: "device-face",
  label: { default: "Thermostat", translations: { fr: "Thermostat FR" } },
  view_box: { width: 480, height: 320 },
  layers: [
    {
      kind: "rect",
      box: { x: 0, y: 0, width: 480, height: 320 },
      fill: "#3a3a3a",
      radius: 8,
    },
    {
      kind: "image",
      asset: "case",
      box: { x: 10, y: 20, width: 100, height: 50 },
    },
    {
      kind: "glyph",
      glyph_set: "lcd",
      char: "P",
      box: { x: 40, y: 220, width: 40, height: 40 },
      color: {
        rules: [
          {
            when: { op: "eq", binding: "mode", value: "heat" },
            color: "#8caee7",
          },
        ],
        default: "#bebebe",
      },
      label: { default: "Power" },
    },
    {
      kind: "glyph",
      glyph_set: "lcd",
      char: "1",
      box: { x: 100, y: 100, width: 60, height: 100 },
      color: "#ffffff",
      visible_when: { op: "eq", binding: "power", value: true },
    },
    {
      kind: "button",
      box: { x: 375, y: 135, width: 120, height: 100 },
      label: {
        default: "Increase setpoint",
        translations: { fr: "Augmenter" },
      },
      action: { control: "target", op: "increment" },
      visible_when: { op: "eq", binding: "power", value: true },
      blocked_when: { op: "eq", binding: "lock", value: true },
    },
  ],
};

function renderFace(
  values: Record<string, Scalar | null>,
  { language = "en", onAction = vi.fn() } = {},
) {
  const utils = render(
    <DeviceFace
      document={doc}
      resolve={(b) => values[b]}
      assetUrl={(id) => (id === "case" ? "blob:case" : undefined)}
      glyphSet={(id) => (id === "lcd" ? lcd : undefined)}
      onAction={onAction}
      language={language}
    />,
  );
  return { ...utils, onAction };
}

function glyphLayers(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-layer="glyph"]'),
  );
}

describe("DeviceFace", () => {
  it("lays the surface out in view-box pixels at native scale", () => {
    renderFace({ power: true, mode: "heat", lock: false });
    const surface = screen.getByTestId("device-face-surface");
    expect(surface).toHaveStyle({ width: "480px", height: "320px" });
    expect(surface.style.transform).toBe("scale(1)");
    const rect = surface.querySelector<HTMLElement>('[data-layer="rect"]');
    expect(rect).toHaveStyle({
      left: "0px",
      top: "0px",
      width: "480px",
      height: "320px",
      backgroundColor: "#3a3a3a",
      borderRadius: "8px",
    });
    const image = surface.querySelector<HTMLImageElement>(
      '[data-layer="image"]',
    );
    expect(image?.getAttribute("src")).toBe("blob:case");
    expect(image).toHaveStyle({
      left: "10px",
      top: "20px",
      width: "100px",
      height: "50px",
    });
  });

  it("tints a glyph through a mask positioned on its atlas cell", () => {
    renderFace({ power: true, mode: "heat", lock: false });
    const power = screen.getByRole("img", { name: "Power" });
    expect(power.style.backgroundColor).toBe("rgb(140, 174, 231)");
    expect(power.style.maskImage).toBe('url("blob:atlas")');
    expect(power.style.maskSize).toBe("200px 50px");
    expect(power.style.maskPosition).toBe("0px 0px");
    // The digit cell (30×50) is drawn into a 60×100 box: the atlas scales ×2.
    const digit = glyphLayers().find((g) => g !== power);
    expect(digit).toHaveAttribute("aria-hidden", "true");
    expect(digit?.style.maskSize).toBe("400px 100px");
    expect(digit?.style.maskPosition).toBe("-80px 0px");
  });

  it("falls back to the default colour when no rule matches", () => {
    renderFace({ power: true, mode: "cool", lock: false });
    const power = screen.getByRole("img", { name: "Power" });
    expect(power.style.backgroundColor).toBe("rgb(190, 190, 190)");
  });

  it("hides layers whose visibility is false or unknown", () => {
    const { rerender } = renderFace({
      power: false,
      mode: "heat",
      lock: false,
    });
    expect(screen.queryByRole("button")).toBeNull();
    expect(glyphLayers()).toHaveLength(1);
    rerender(
      <DeviceFace
        document={doc}
        resolve={() => null}
        assetUrl={() => undefined}
        glyphSet={() => lcd}
        onAction={vi.fn()}
        language="en"
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(glyphLayers()).toHaveLength(1);
    // Missing asset: the image layer renders nothing, the rest stays.
    expect(document.querySelector('[data-layer="image"]')).toBeNull();
    expect(document.querySelector('[data-layer="rect"]')).not.toBeNull();
  });

  it("dispatches the action of an enabled button and localizes its name", async () => {
    const user = userEvent.setup();
    const { onAction } = renderFace(
      { power: true, mode: "heat", lock: false },
      { language: "fr-FR" },
    );
    const button = screen.getByRole("button", { name: "Augmenter" });
    expect(button).toHaveStyle({
      left: "375px",
      top: "135px",
      width: "120px",
      height: "100px",
    });
    await user.click(button);
    expect(onAction).toHaveBeenCalledWith({
      control: "target",
      op: "increment",
    });
    expect(
      screen.getByRole("group", { name: "Thermostat FR" }),
    ).toBeInTheDocument();
  });

  it.each<[string, Scalar | null]>([
    ["blocked", true],
    ["unknown-lock", null],
  ])("keeps a %s button focusable but inert", async (_label, lock) => {
    const user = userEvent.setup();
    const { onAction } = renderFace({ power: true, mode: "heat", lock });
    const button = screen.getByRole("button", { name: "Increase setpoint" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    button.focus();
    expect(button).toHaveFocus();
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe("localize", () => {
  it.each([
    ["fr", "Bonjour"],
    ["fr-CA", "Bonjour"],
    ["de", "Hello"],
    ["en-GB", "Hi"],
  ])("%s → %s", (language, expected) => {
    expect(
      localize(
        { default: "Hello", translations: { fr: "Bonjour", "en-GB": "Hi" } },
        language,
      ),
    ).toBe(expected);
  });
});
