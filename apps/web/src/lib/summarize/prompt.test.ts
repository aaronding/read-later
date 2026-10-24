import { describe, expect, it } from "vitest";
import { keyPointCount } from "./prompt";

const english = (words: number) => "word ".repeat(words);
const chinese = (characters: number) => "字".repeat(characters);

describe("keyPointCount", () => {
  it("gives a longer article more points", () => {
    expect(keyPointCount(english(700))).toBe(3);
    expect(keyPointCount(english(1_000))).toBe(3);
    expect(keyPointCount(english(2_000))).toBe(4);
    expect(keyPointCount(english(3_000))).toBe(4);
    expect(keyPointCount(english(5_000))).toBe(5);
  });

  it("counts Chinese by its reading time, not one word a character", () => {
    // 2,000 characters read in about 4 minutes, as 1,000 English words do.
    expect(keyPointCount(chinese(2_000))).toBe(3);
    expect(keyPointCount(chinese(4_860))).toBe(4);
    expect(keyPointCount(chinese(8_000))).toBe(5);
  });
});
