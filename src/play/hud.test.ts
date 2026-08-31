import { describe, expect, it } from "vitest";
import {
  AVATAR_BUTTONS,
  AVATAR_SLOT,
  avatarFlatAction,
  boardStillNeedsBlit,
  keepBoardItems,
  flatBoardCacheKey,
  samePuzzleLabels,
  examineHandName,
  flatItemKey,
  HAND_SLOT,
  hitMacRect,
  hitsHandSlot,
  gunhandWantsSight,
  holdWhileLoading,
  hudBarCursor,
  inventorySpriteView,
  isInventoryHudView,
  MAINPANEL_BUTTONS,
  townHudChromePress,
  flatBoardPressSetsSkipClick,
  mapCrossHotspot,
  mapCrossLit,
  propBlitFrame,
  propViewFrame,
  sameFlatItems,
  stageFromClient,
  stageFromHudClick,
  actorLayerVisibility,
} from "./hud";
import { BEVEL_CHROME, BEVEL_DARK, BEVEL_SLOTS, scrambleInPlace, SPEECH_BAR_HEIGHT } from "./ui";
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

  it("does not skip the next HUD click after a menu-board pointerdown", () => {
    expect(flatBoardPressSetsSkipClick()).toBe(false);
  });

  it("lets town HUD chrome use click instead of stage pointer capture", () => {
    expect(townHudChromePress(320, false, false)).toBe(true);
    expect(townHudChromePress(100, false, false)).toBe(false);
    expect(townHudChromePress(320, true, false)).toBe(false);
    expect(townHudChromePress(320, false, true)).toBe(false);
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

  it("puppetscramble shuffles in place so a later bevel can stay last", () => {
    const items = [101, 102, 102, 102, 102];
    scrambleInPlace(items, () => 0);
    expect(items[0]).toBe(102);
    expect(items).toContain(101);
    const withBye = [101, 102, 102];
    scrambleInPlace(withBye, () => 0);
    withBye.push(700);
    expect(withBye[withBye.length - 1]).toBe(700);
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

  it("hits EXAMINE on the first pointer even if an item sprite overlaps the HUD", () => {
    expect(avatarFlatAction(200, 330, "bone")).toEqual({ kind: "info" });
    expect(avatarFlatAction(300, 330, "bone")).toEqual({ kind: "ok" });
    expect(avatarFlatAction(400, 180, "bone")).toEqual({ kind: "item", name: "bone" });
  });

  it("EXAMINE skips helpbut and uses the first owned item when the hand is empty", () => {
    expect(examineHandName("bone", ["jug", "bone"])).toBe("bone");
    expect(examineHandName("", ["bone", "jug"])).toBe("bone");
    expect(examineHandName("helpbut", ["bone"])).toBe("bone");
    expect(examineHandName("helpbut", [])).toBe("");
  });
});

describe("map location cross", () => {
  it("places the south-gate start on the parchment, not off the still", () => {
    // scene g15 = tile (6, 14). 1-based *20+93 would be y=393.
    const g15 = mapCrossHotspot(6, 14);
    expect(g15).toEqual({ x: 342, y: 373 });
    expect(g15.y).toBeLessThan(STAGE_HEIGHT);
    const a1 = mapCrossHotspot(0, 0);
    expect(a1).toEqual({ x: 222, y: 93 });
    const saloon = mapCrossHotspot(6, 7);
    const jail = mapCrossHotspot(6, 11);
    expect(saloon.x).toBe(jail.x);
    expect(saloon.y).toBeLessThan(jail.y);
    expect(jail.y).toBeLessThan(g15.y);
  });

  it("blinks with HOUSE cross timing (frame 2 has no sprite)", () => {
    expect(mapCrossLit(0)).toBe(true);
    expect(mapCrossLit(2)).toBe(true);
    expect(mapCrossLit(3)).toBe(false);
    expect(mapCrossLit(5)).toBe(false);
    expect(mapCrossLit(6)).toBe(true);
  });
});

describe("sprite hold while the next PNG loads", () => {
  it("keeps the last portrait/actor blit instead of hiding", () => {
    expect(holdWhileLoading(true, false)).toBe(true);
    expect(holdWhileLoading(true, true)).toBe(true);
    expect(holdWhileLoading(false, true)).toBe(true);
    expect(holdWhileLoading(false, false)).toBe(false);
  });
});

describe("puzzle board overlay", () => {
  it("does not reload the FLT still on every forceupdate", () => {
    const url = "/extract/FLT/_CHECKERS/frame_3.png";
    expect(boardStillNeedsBlit("", url)).toBe(true);
    expect(boardStillNeedsBlit(url, url)).toBe(false);
    expect(boardStillNeedsBlit(url, "/extract/FLT/_SALGAMES/frame_3.png")).toBe(true);
  });

  it("drops avatar satchel icons when a book board opens", () => {
    expect(keepBoardItems(false, 0, 7)).toBe(false);
    expect(keepBoardItems(true, 0, 7)).toBe(true);
    expect(keepBoardItems(true, 1, 7)).toBe(false);
  });

  it("keeps piece identity so a drag can move one img without wiping the rest", () => {
    const a = { name: "him3", url: "him.png", x: 10, y: 20, w: 26, h: 26 };
    const b = { ...a, x: 40, y: 50 };
    expect(flatItemKey(a, 0)).toBe("him3");
    expect(sameFlatItems([a], [a])).toBe(true);
    expect(sameFlatItems([a], [b])).toBe(false);
  });

  it("keys CRACK spin frames by url so deg swaps do not retarget one img", () => {
    const a = { name: "spin", url: "00.png", x: 163, y: 47, w: 180, h: 180 };
    const b = { ...a, url: "01.png" };
    expect(flatBoardCacheKey(a, 0)).not.toBe(flatBoardCacheKey(b, 0));
    expect(flatBoardCacheKey(a, 0)).toBe("spin\0" + "00.png");
    expect(samePuzzleLabels([{ text: "08", x: 57, y: 337, size: 12 }], [{ text: "08", x: 57, y: 337, size: 12 }])).toBe(
      true,
    );
    expect(samePuzzleLabels([{ text: "08", x: 57, y: 337 }], [{ text: "23", x: 57, y: 337 }])).toBe(false);
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

describe("range gunhand", () => {
  it("treats INVEN empty/large as HUD, not world", () => {
    expect(isInventoryHudView("empty")).toBe(true);
    expect(isInventoryHudView("large")).toBe(true);
    expect(isInventoryHudView("idle")).toBe(false);
    expect(isInventoryHudView("hifire")).toBe(false);
  });

  it("plays world powder-keg explode from the +0x2e table, not octant 0", () => {
    const frames = ["c1", "c2", "c3", "c4", "c5"];
    const timing = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
    expect(propBlitFrame(frames, 0, timing, 0, false)).toBe("c1");
    expect(propBlitFrame(frames, 0, timing, 2, false)).toBe("c2");
    expect(propBlitFrame(frames, 0, timing, 8, false)).toBe("c5");
  });

  it("aims with propdeg 1..13, not an 8-dir octant", () => {
    const frames = [..."abcdefghijklm"];
    expect(propBlitFrame(frames, 7, undefined, 0, true)).toBe("g");
    expect(propBlitFrame(frames, 1, undefined, 0, true)).toBe("a");
    expect(propBlitFrame(frames, 13, undefined, 0, true)).toBe("m");
    expect(propBlitFrame(frames, 7, undefined, 0, false)).toBe("a");
  });

  it("keeps reload on 0-based bulletcount", () => {
    const frames = ["c0", "c1", "c2", "c3", "c4", "c5", "c6"];
    expect(propBlitFrame(frames, 0, undefined, 0, true)).toBe("c0");
    expect(propBlitFrame(frames, 6, undefined, 0, true)).toBe("c6");
  });

  it("uses the boot idle sight rule on the still, not on the hand", () => {
    expect(gunhandWantsSight(true, { x: 256, y: 80 }, false)).toBe(true);
    expect(gunhandWantsSight(true, { x: 256, y: 80 }, true)).toBe(false);
    expect(gunhandWantsSight(true, { x: 256, y: 300 }, false)).toBe(false);
    expect(gunhandWantsSight(false, { x: 256, y: 80 }, false)).toBe(false);
  });
});

describe("range EXIT plaque", () => {
  const exit = { name: "exit", top: 292, left: 256, bottom: 315, right: 340 };

  it("is the FLT Mac rect, not the town holster slot", () => {
    expect(hitMacRect([exit], 297, 304)?.name).toBe("exit");
    expect(hitMacRect([exit], HAND_SLOT.x, HAND_SLOT.y)).toBeUndefined();
    expect(hitsHandSlot(297, 304)).toBe(true);
  });

  it("uses the pointer cursor on the plaque", () => {
    expect(hudBarCursor(true, "exit", false, undefined)).toBe("touch");
    expect(hudBarCursor(true, undefined, false, "horn")).toBe("arrow");
    expect(hudBarCursor(false, undefined, false, "map")).toBe("touch");
  });

  it("maps the plaque the same way from the stage box and the HUD strip", () => {
    const fromStage = stageFromClient(297, 304, { left: 0, top: 0, width: 512, height: 384 });
    const fromHud = stageFromHudClick(297, 304 - 264, 512, 120);
    expect(fromStage).not.toBeNull();
    expect(fromHud).not.toBeNull();
    expect(fromHud!.x).toBeCloseTo(fromStage!.x);
    expect(fromHud!.y).toBeCloseTo(fromStage!.y);
    expect(hitMacRect([exit], fromStage!.x, fromStage!.y)?.name).toBe("exit");
    expect(hitMacRect([exit], fromHud!.x, fromHud!.y)?.name).toBe("exit");
  });
});

describe("actor layer vs puppet", () => {
  it("clears inline visibility when the world is shown so the puppet CSS can hide CST sprites", () => {
    expect(actorLayerVisibility(true)).toBe("");
    expect(actorLayerVisibility(false)).toBe("hidden");
  });
});
