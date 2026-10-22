import { describe, expect, it } from "vitest";
import { contrastRatio, mixColors } from "./color";

describe("mixColors", () => {
  it("mixes like CSS color-mix in sRGB", () => {
    expect(mixColors("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixColors("#ff0000", "#0000ff", 0.25)).toBe("#4000bf");
    expect(mixColors("#123456", "#abcdef", 1)).toBe("#123456");
    expect(mixColors("#123456", "#abcdef", 0)).toBe("#abcdef");
  });

  it("accepts only #rrggbb colors", () => {
    expect(() => mixColors("red", "#ffffff", 0.5)).toThrow();
    expect(() => mixColors("#fff", "#ffffff", 0.5)).toThrow();
  });
});

describe("contrastRatio", () => {
  it("matches WCAG's figures", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    // The darkest gray on white that is still under AA's 4.5:1, and the lightest that passes.
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.5);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it("doesn't depend on the order of the colors", () => {
    expect(contrastRatio("#1f6f5c", "#fbfaf7")).toBe(contrastRatio("#fbfaf7", "#1f6f5c"));
  });
});
