import { describe, expect, it } from "vitest";
import { hitMacRect, MAINPANEL_BUTTONS, stageFromHudClick } from "./hud";
import { BEVEL_CHROME, BEVEL_DARK, BEVEL_SLOTS, SPEECH_BAR_HEIGHT } from "./ui";
import { HUD_HEIGHT, STAGE_HEIGHT } from "./stage";

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

  it("keeps speech over the still and five bevels in the HUD band", () => {
    expect(BEVEL_SLOTS).toBe(5);
    expect(SPEECH_BAR_HEIGHT).toBe(40);
    expect(HUD_HEIGHT / BEVEL_SLOTS).toBe(24);
    expect(STAGE_HEIGHT - HUD_HEIGHT - SPEECH_BAR_HEIGHT).toBe(224);
  });


  it("uses HOUSE butbevel, not an OS button", () => {
    expect(BEVEL_CHROME).toContain("butbevel");
    expect(BEVEL_DARK).toBe("rgb(111, 56, 38)");
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
