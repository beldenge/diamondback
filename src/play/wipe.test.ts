import { describe, expect, it } from "vitest";
import {
  BARN_DOOR_STEPS,
  barnDoorClipPath,
  barnDoorOverlayRange,
  barnDoorStepTicks,
  barnDoorStripPx,
} from "./wipe";

describe("barn door wipe", () => {
  it("matches DF.EXE strip width and 8 blits", () => {
    expect(barnDoorStripPx(512)).toBe(33);
    expect(BARN_DOOR_STEPS).toBe(8);
    expect(barnDoorStepTicks(30)).toBe(3);
    expect(barnDoorStepTicks(1)).toBe(1);
  });

  it("opens from a center slit (FUN_0040eec0 first blit)", () => {
    expect(barnDoorOverlayRange("open", 0)).toEqual({ left: 256, right: 256 });
    expect(barnDoorOverlayRange("open", 1)).toEqual({ left: 223, right: 289 });
    expect(barnDoorOverlayRange("open", 8)).toEqual({ left: 0, right: 512 });
  });

  it("closes from the edges (FUN_0040edf0 first blit)", () => {
    expect(barnDoorOverlayRange("close", 0)).toEqual({ left: 0, right: 512 });
    expect(barnDoorOverlayRange("close", 1)).toEqual({ left: 33, right: 479 });
    const done = barnDoorOverlayRange("close", 8);
    expect(done.right).toBeLessThanOrEqual(done.left);
  });

  it("uses inset clip-path so the dest still shows through the doors", () => {
    expect(barnDoorClipPath("open", 0)).toBe("inset(0 50% 0 50%)");
    expect(barnDoorClipPath("open", 8)).toBe("inset(0 0% 0 0%)");
    expect(barnDoorClipPath("close", 0)).toBe("inset(0 0% 0 0%)");
    expect(barnDoorClipPath("close", 8)).toBe("inset(0 50% 0 50%)");
  });

  it("leaves Subtitles (x 298–408) outside the first open strips", () => {
    // Clip on the hit root would swallow those clicks until a later strip
    // (or a reflow). The wipe paints `#play-flat-visual`, not `#play-flat`.
    expect(barnDoorOverlayRange("open", 1).right).toBeLessThan(298);
    expect(barnDoorOverlayRange("open", 8).right).toBeGreaterThanOrEqual(408);
  });
});
