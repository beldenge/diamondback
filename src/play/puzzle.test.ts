import { describe, expect, it } from "vitest";
import {
  findWord,
  hitFlatButton,
  isPuzzleStage,
  pointHitsFlatItem,
  pointInMacRect,
  putWord,
  shopFileOf,
  substringIndex,
  upsertPuzzleLabel,
} from "./puzzle";

describe("saloon game helpers", () => {
  it("finds 1-based words and returns empty past the end", () => {
    const deck = "2h 3h 4h ";
    expect(findWord(deck, " ", 1)).toBe("2h");
    expect(findWord(deck, " ", 3)).toBe("4h");
    expect(findWord(deck, " ", 4)).toBe("");
    expect(findWord("1 -1 ", " ", 1)).toBe("1");
    expect(findWord("1 -1 ", " ", 2)).toBe("-1");
  });

  it("putword swaps like SALGAMES shuffle without dropping cards", () => {
    let list = "ah kd qs";
    list = putWord(list, " ", 1, "");
    list = putWord(list, " ", 1, "qs");
    list = putWord(list, " ", 3, "");
    list = putWord(list, " ", 3, "ah");
    expect(findWord(list, " ", 1)).toBe("qs");
    expect(findWord(list, " ", 2)).toBe("kd");
    expect(findWord(list, " ", 3)).toBe("ah");
    expect(findWord(list, " ", 4)).toBe("");
  });

  it("substring is 1-based so boot `= 1` and cards `>= 0` both work", () => {
    expect(substringIndex("dust:data:", "dust:")).toBe(1);
    expect(substringIndex("2h 3h ah", "ah")).toBeGreaterThan(0);
    expect(substringIndex("2h 3h", "kd")).toBe(-1);
  });

  it("hits FLT Mac button rects", () => {
    const pull = { name: "pull", top: 26, left: 431, bottom: 105, right: 517 };
    expect(pointInMacRect(pull, 450, 40)).toBe(true);
    expect(pointInMacRect(pull, 10, 10)).toBe(false);
    expect(hitFlatButton([pull], 450, 40)?.name).toBe("pull");
  });

  it("treats SALGAMES as a puzzle stage and names the shop file", () => {
    expect(isPuzzleStage("salgames")).toBe(true);
    expect(isPuzzleStage("checkers")).toBe(true);
    expect(isPuzzleStage("checkers.flt")).toBe(true);
    expect(isPuzzleStage("fight")).toBe(true);
    expect(isPuzzleStage("new")).toBe(false);
    expect(isPuzzleStage("target")).toBe(false);
    expect(isPuzzleStage("target.flt")).toBe(false);
    expect(shopFileOf("salgames")).toBe("salgames.prp");
    expect(shopFileOf("checkers")).toBe("checkers.prp");
    expect(
      pointHitsFlatItem({ url: "x", x: 100, y: 100, w: 40, h: 50 }, 110, 120),
    ).toBe(true);
  });

  it("keeps TARGET scores that share a row", () => {
    let labels = upsertPuzzleLabel([], { text: "3", x: 64, y: 348, size: 12 });
    labels = upsertPuzzleLabel(labels, { text: "1", x: 121, y: 348, size: 12 });
    labels = upsertPuzzleLabel(labels, { text: "2", x: 178, y: 348, size: 12 });
    labels = upsertPuzzleLabel(labels, { text: "50", x: 267, y: 348, size: 12 });
    labels = upsertPuzzleLabel(labels, { text: "4", x: 64, y: 348, size: 12 });
    expect(labels).toEqual([
      { text: "1", x: 121, y: 348, size: 12 },
      { text: "2", x: 178, y: 348, size: 12 },
      { text: "50", x: 267, y: 348, size: 12 },
      { text: "4", x: 64, y: 348, size: 12 },
    ]);
  });
});
