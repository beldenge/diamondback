import { describe, expect, it } from "vitest";
import {
  DEFAULT_REEL,
  GALLERY_REELS,
  galleryGroups,
  galleryReel,
  reelFromSearch,
} from "./reels";

describe("picture-show reels", () => {
  it("defaults to the opening movie", () => {
    expect(DEFAULT_REEL).toBe("intro");
    expect(GALLERY_REELS[0]?.id).toBe("intro");
    expect(reelFromSearch("")).toBe("intro");
    expect(reelFromSearch("?mode=movies")).toBe("intro");
  });

  it("accepts a reel query and strips .mov", () => {
    expect(reelFromSearch("?mode=movies&reel=intro3")).toBe("intro3");
    expect(reelFromSearch("reel=DESEREND.mov")).toBe("deserend");
  });

  it("falls back when the reel is unknown", () => {
    expect(reelFromSearch("?reel=apple")).toBe("intro");
    expect(galleryReel("armopen")).toBeUndefined();
    expect(galleryReel("hotup")).toBeUndefined();
  });

  it("is cutscenes, not inspectables or stairs", () => {
    const ids = new Set(GALLERY_REELS.map((reel) => reel.id));
    expect(ids.has("intro")).toBe(true);
    expect(ids.has("intro2")).toBe(true);
    expect(ids.has("bone")).toBe(false);
    expect(ids.has("apple")).toBe(false);
    expect(ids.has("gun")).toBe(false);
    expect(ids.has("salup")).toBe(false);
    expect(ids.has("dog1")).toBe(false);
  });

  it("lists the CD INFO attract reels as coming attractions", () => {
    const ids = new Set(GALLERY_REELS.map((reel) => reel.id));
    for (const id of [
      "main",
      "duss",
      "jrpre",
      "jrss",
      "scpre",
      "scss",
      "coming",
      "action",
      "lupre",
      "luss",
      "tipre",
      "tiss",
    ]) {
      expect(ids.has(id)).toBe(true);
      expect(galleryReel(id)?.group).toBe("Coming attractions");
    }
    expect(reelFromSearch("?mode=movies&reel=lupre")).toBe("lupre");
    expect(galleryGroups().map((entry) => entry.group)).toEqual([
      "Opening",
      "Days",
      "Endings",
      "Deaths",
      "Town",
      "Coming attractions",
    ]);
  });
});
