import { describe, expect, it } from "vitest";
import {
  findWord,
  hitFlatButton,
  isMenuFlat,
  isPuzzleStage,
  isReaderStage,
  pointHitsFlatItem,
  pointHitsReaderBorder,
  pointInMacRect,
  putWord,
  readerBorderName,
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
    expect(isPuzzleStage("crack")).toBe(true);
    expect(isPuzzleStage("fight")).toBe(true);
    expect(isPuzzleStage("sundial")).toBe(true);
    expect(isPuzzleStage("flute")).toBe(true);
    expect(isPuzzleStage("snake")).toBe(true);
    expect(isPuzzleStage("tumble")).toBe(true);
    expect(isPuzzleStage("yunnibox")).toBe(true);
    expect(isPuzzleStage("diary")).toBe(true);
    expect(isPuzzleStage("yunni")).toBe(true);
    expect(isPuzzleStage("hist")).toBe(true);
    expect(isPuzzleStage("pages")).toBe(true);
    expect(isPuzzleStage("new")).toBe(false);
    expect(isPuzzleStage("credits")).toBe(true);
    expect(isPuzzleStage("target")).toBe(false);
    expect(isMenuFlat("score")).toBe(true);
    expect(isMenuFlat("death")).toBe(true);
    expect(isMenuFlat("mainpanel")).toBe(false);
    expect(isPuzzleStage("target.flt")).toBe(false);
    expect(shopFileOf("salgames")).toBe("salgames.prp");
    expect(shopFileOf("checkers")).toBe("checkers.prp");
    expect(
      pointHitsFlatItem({ url: "x", x: 100, y: 100, w: 40, h: 50 }, 110, 120),
    ).toBe(true);
  });

  it("reader borders miss the page hole and keep the frame", () => {
    expect(isReaderStage("diary.flt")).toBe(true);
    expect(isReaderStage("yunnibook")).toBe(true);
    expect(isReaderStage("torn")).toBe(true);
    expect(isReaderStage("dbhist")).toBe(true);
    expect(isReaderStage("cure.flt")).toBe(true);
    expect(isReaderStage("drugbook")).toBe(true);
    expect(readerBorderName("hist")).toBe("histbord");
    expect(readerBorderName("yunnibook")).toBe("yunnibord");
    expect(readerBorderName("drugbook")).toBe("curebord");
    expect(pointHitsReaderBorder("diarybord", 256, 132)).toBe(false);
    expect(pointHitsReaderBorder("diarybord", 256, 300)).toBe(false);
    expect(pointHitsReaderBorder("diarybord", 10, 40)).toBe(true);
    expect(pointHitsReaderBorder("histbord", 256, 132)).toBe(false);
    expect(pointHitsReaderBorder("histbord", 256, 300)).toBe(false);
    expect(pointHitsReaderBorder("histbord", 10, 20)).toBe(true);
    expect(pointHitsReaderBorder("yunnibord", 256, 132)).toBe(false);
    expect(pointHitsReaderBorder("yunnibord", 256, 300)).toBe(false);
    expect(pointHitsReaderBorder("yunnibord", 10, 20)).toBe(true);
    expect(pointHitsReaderBorder("pagebord", 256, 192)).toBe(false);
    expect(pointHitsReaderBorder("pagebord", 256, 300)).toBe(false);
    expect(pointHitsReaderBorder("pagebord", 100, 50)).toBe(true);
    expect(pointHitsReaderBorder("curebord", 256, 192)).toBe(false);
    expect(pointHitsReaderBorder("curebord", 256, 300)).toBe(false);
    expect(pointHitsReaderBorder("curebord", 10, 20)).toBe(true);
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
