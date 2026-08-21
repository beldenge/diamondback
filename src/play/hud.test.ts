import { describe, expect, it } from "vitest";
import { hitMacRect, MAINPANEL_BUTTONS, stageFromHudClick } from "./hud";

describe("mainpanel Mac rects", () => {
  it("hits the map on the left of the HUD bar", () => {
    expect(hitMacRect(MAINPANEL_BUTTONS, 80, 320)?.name).toBe("map");
  });

  it("hits the portrait on the right", () => {
    expect(hitMacRect(MAINPANEL_BUTTONS, 450, 320)?.name).toBe("self");
  });

  it("misses the stills above the bar", () => {
    expect(hitMacRect(MAINPANEL_BUTTONS, 256, 100)).toBeUndefined();
  });

  it("maps a HUD-local click into stage pixels", () => {
    const at = stageFromHudClick(80, 40, 512, 120);
    expect(at).not.toBeNull();
    expect(at!.x).toBeCloseTo(80);
    expect(at!.y).toBeGreaterThan(264);
    expect(at!.y).toBeLessThan(384);
    expect(hitMacRect(MAINPANEL_BUTTONS, at!.x, at!.y)?.name).toBe("map");
  });
});
