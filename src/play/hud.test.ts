import { describe, expect, it } from "vitest";
import {
  AVATAR_BUTTONS,
  AVATAR_SLOT,
  HAND_SLOT,
  hitMacRect,
  hitsHandSlot,
  inventorySpriteView,
  MAINPANEL_BUTTONS,
  propViewFrame,
  stageFromClient,
  stageFromHudClick,
} from "./hud";
import { BEVEL_CHROME, BEVEL_DARK, BEVEL_SLOTS, SPEECH_BAR_HEIGHT } from "./ui";
import { HUD_HEIGHT, STAGE_HEIGHT } from "./stage";

describe("mainpanel Mac rects", () => {
  it("hits the map on the left of the HUD bar", () => {
    expect(hitMacRect(MAINPANEL_BUTTONS, 80, 320)?.name).toBe("map");
  });

  it("hits the portrait on the right", () => {
    expect(hitMacRect(MAINPANEL_BUTTONS, 450, 320)?.name).toBe("self");
  });

  it("hits the skull as the menu, not the map or portrait", () => {
    expect(hitMacRect(MAINPANEL_BUTTONS, 256, 330)?.name).toBe("horn");
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

  it("prefers the held-item slot over the skull chrome under it", () => {
    expect(hitMacRect(MAINPANEL_BUTTONS, HAND_SLOT.x, HAND_SLOT.y)?.name).toBe("horn");
    expect(hitsHandSlot(HAND_SLOT.x, HAND_SLOT.y)).toBe(true);
  });

  it("maps a client point on the stage box into 512×384", () => {
    const at = stageFromClient(10, 20, { left: 0, top: 0, width: 512, height: 384 });
    expect(at).toEqual({ x: 10, y: 20 });
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

describe("avatar inventory Mac rects", () => {
  it("hits EXAMINE on the left HUD button", () => {
    expect(hitMacRect(AVATAR_BUTTONS, 200, 330)?.name).toBe("info");
  });

  it("hits OK on the right HUD button", () => {
    expect(hitMacRect(AVATAR_BUTTONS, 300, 330)?.name).toBe("ok");
  });

  it("does not treat the avatar still as a button", () => {
    expect(hitMacRect(AVATAR_BUTTONS, 256, 180)).toBeUndefined();
  });

  it("hilite is the HUD handitem, other owned props stay panel", () => {
    expect(inventorySpriteView("bone", "bone")).toBe("hilite");
    expect(inventorySpriteView("jug", "bone")).toBe("panel");
    expect(inventorySpriteView("bone", "")).toBe("panel");
  });
});

describe("HUD portrait frames", () => {
  it("puts noface on the portrait pocket, not the still", () => {
    expect(AVATAR_SLOT).toEqual({ x: 460, y: 325 });
    expect(AVATAR_SLOT.y).toBeGreaterThan(264);
  });

  it("picks nitefaces by propdeg when the timing table is a rest pose", () => {
    const frames = ["rest", "blink", "look", "frown", "grin", "wince"];
    expect(propViewFrame(frames, 0, [1], 0)).toBe("rest");
    expect(propViewFrame(frames, 1, [1], 9)).toBe("blink");
    expect(propViewFrame(frames, 5, [1], 0)).toBe("wince");
  });

  it("plays 1-based +0x2e slots for a glance strip", () => {
    const frames = ["a", "b", "c"];
    const timing = [1, 1, 2, 2, 3, 3, 2, 1];
    expect(propViewFrame(frames, 0, timing, 0)).toBe("a");
    expect(propViewFrame(frames, 0, timing, 2)).toBe("b");
    expect(propViewFrame(frames, 0, timing, 4)).toBe("c");
    expect(propViewFrame(frames, 0, timing, 8)).toBe("a");
  });
});
