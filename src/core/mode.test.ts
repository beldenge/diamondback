import { describe, expect, it } from "vitest";
import { clientMode, needsUnlockedSpoilerWarning } from "./mode";

describe("clientMode", () => {
  it("opens the landing chooser with no query", () => {
    expect(clientMode("")).toBe("landing");
    expect(clientMode("?")).toBe("landing");
  });

  it("maps each query to one mode", () => {
    expect(clientMode("?mode=unlocked")).toBe("unlocked");
    expect(clientMode("mode=UNLOCKED")).toBe("unlocked");
    expect(clientMode("?mode=resurrected")).toBe("resurrected");
    expect(clientMode("?mode=resurrected&intro=1")).toBe("resurrected");
    expect(clientMode("?mode=movies")).toBe("movies");
    expect(clientMode("?mode=movies&reel=intro")).toBe("movies");
    expect(clientMode("?mode=reimagined")).toBe("reimagined");
    expect(clientMode("mode=REIMAGINED")).toBe("reimagined");
    expect(clientMode("?mode=reimagined&tx=6&ty=6")).toBe("reimagined");
  });

  it("ignores unknown modes", () => {
    expect(clientMode("?mode=play")).toBe("landing");
    expect(clientMode("?mode=gallery&reel=intro")).toBe("landing");
    expect(clientMode("?mode=free")).toBe("landing");
    expect(clientMode("?mode=renewed")).toBe("landing");
    expect(clientMode("?mode=3d")).toBe("landing");
    expect(clientMode("?clock=2")).toBe("landing");
  });
});

describe("needsUnlockedSpoilerWarning", () => {
  it("gates a chooser click onto Unlocked until confirmed", () => {
    expect(needsUnlockedSpoilerWarning("landing", "unlocked", false)).toBe(true);
    expect(needsUnlockedSpoilerWarning("landing", "unlocked", true)).toBe(false);
  });

  it("does not gate other chooser titles or a direct Unlocked URL", () => {
    expect(needsUnlockedSpoilerWarning("landing", "resurrected", false)).toBe(false);
    expect(needsUnlockedSpoilerWarning("landing", "movies", false)).toBe(false);
    expect(needsUnlockedSpoilerWarning("landing", "reimagined", false)).toBe(false);
    expect(needsUnlockedSpoilerWarning("landing", "landing", false)).toBe(false);
    expect(needsUnlockedSpoilerWarning("unlocked", "unlocked", false)).toBe(false);
    expect(needsUnlockedSpoilerWarning("resurrected", "unlocked", false)).toBe(false);
    expect(needsUnlockedSpoilerWarning("movies", "unlocked", false)).toBe(false);
  });
});
