import { describe, it, expect } from "vitest";
import { capitalize, foldText, toLabel } from "./textFormat";

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

  it("Formats from camelCase", () => {
    expect(toLabel("helloWorld")).toBe("Hello World");
  });

  it("Keeps consecutive upper case", () => {
    expect(toLabel("systemHVAC")).toBe("System HVAC");
  });
});

describe("foldText", () => {
  it("drops accents and case", () => {
    expect(foldText("RÉCHAUFFEUR de boucle")).toBe("rechauffeur de boucle");
    expect(foldText("Arrêt")).toBe("arret");
  });
});

describe("capitalize", () => {
  it("upper-cases the first letter only", () => {
    expect(capitalize("lundi 12 octobre", "fr")).toBe("Lundi 12 octobre");
    expect(capitalize("état", "fr")).toBe("État");
    expect(capitalize("")).toBe("");
  });
});
