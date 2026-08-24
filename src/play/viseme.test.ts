import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { PuppetSheet, VisemeFrame } from "./ui";
import {
  asCenter,
  FACE_TABLES,
  idleLayerIndex,
  isFlatBackdrop,
  layerBlitDest,
  layerPlace,
  mergePuppetRest,
  puppetPaintIsStale,
  puppetUiCursor,
  speakHangSec,
  spriteTopLeft,
  visemeRestFromFrame,
  VISEME_HZ,
} from "./ui";

function frameAt(frames: VisemeFrame[], seconds: number): VisemeFrame {
  const tick = Math.max(0, Math.round(seconds * VISEME_HZ));
  let hit = frames[0]!;
  for (const frame of frames) {
    if (frame.t > tick) {
      break;
    }
    hit = frame;
  }
  return hit;
}

describe("puppet paint handoff", () => {
  it("drops a blit when the sheet or generation changed", () => {
    const leroy = { folder: "PUP/_LEROY" };
    const jones = { folder: "PUP/_JONES" };
    expect(
      puppetPaintIsStale({ gen: 1, sheet: leroy }, { gen: 1, sheet: leroy }),
    ).toBe(false);
    expect(
      puppetPaintIsStale({ gen: 1, sheet: leroy }, { gen: 2, sheet: leroy }),
    ).toBe(true);
    expect(
      puppetPaintIsStale({ gen: 2, sheet: leroy }, { gen: 2, sheet: jones }),
    ).toBe(true);
    expect(
      puppetPaintIsStale({ gen: 2, sheet: leroy }, { gen: 2, sheet: null }),
    ).toBe(true);
  });
});

describe("speak watchdog", () => {
  it("waits for the WAV, not a 12 second floor", () => {
    expect(speakHangSec(4.2, 125)).toBeCloseTo(4.35);
    expect(speakHangSec(0, 125)).toBeLessThan(5);
    expect(speakHangSec(0, 125)).toBeGreaterThan(2);
  });
});

describe("dialogue lock while speaking", () => {
  it("uses the hourglass during puppetspeak, arrow for choices", () => {
    expect(puppetUiCursor(true)).toBe("watch");
    expect(puppetUiCursor(false)).toBe("arrow");
  });
});

describe("viseme clock", () => {
  it("uses 60 Hz ticks matching the WAV", () => {
    expect(184 / VISEME_HZ).toBeCloseTo(3.07, 1);
  });

  it("holds a jaw shape until the next keyframe", () => {
    const frames: VisemeFrame[] = [
      { t: 0, layers: { Jaw: 0 } },
      { t: 20, layers: { Jaw: 11 } },
      { t: 40, layers: { Jaw: 4 } },
    ];
    expect(frameAt(frames, 0).layers.Jaw).toBe(0);
    expect(frameAt(frames, 20 / 60).layers.Jaw).toBe(11);
    expect(frameAt(frames, 0.8).layers.Jaw).toBe(4);
  });
});

describe("viseme rest centers", () => {
  it("places the body on the HUD from viseme extras, not the 384 header", () => {
    const body = spriteTopLeft(256, 207, 76, 135);
    expect(body.y + 114).toBe(264);
    const head = spriteTopLeft(249, 120, 190, 87);
    expect(head.y).toBeLessThan(body.y);
    expect(head.y + 211).toBeGreaterThan(body.y);
  });

  it("keeps brows above eyes and the jaw below", () => {
    const brows = spriteTopLeft(248, 108, 216, 180);
    const eyes = spriteTopLeft(246, 120, 219, 179);
    const jaw = spriteTopLeft(251, 170, 231, 174);
    expect(brows.y).toBeLessThan(eyes.y);
    expect(jaw.y).toBeGreaterThan(eyes.y);
  });

  it("keeps a wide talking jaw on the hotspot instead of bbox-centering", () => {
    const idle = spriteTopLeft(251, 170, 231, 174);
    const open = spriteTopLeft(251, 172, 206, 151);
    expect(open.x).toBeGreaterThan(251 - Math.round(111 / 2));
    expect(open.x - idle.x).toBe(206 - 231);
  });

  it("reads [cx, cy] arrays from the viseme dump", () => {
    expect(asCenter([249, 120])).toEqual({ x: 249, y: 120 });
    expect(asCenter({ x: 256, y: 207 })).toEqual({ x: 256, y: 207 });
    expect(asCenter(undefined)).toBeUndefined();
  });
});

describe("face tables", () => {
  const sheet: PuppetSheet = {
    folder: "PUP/_KID",
    layers: {
      Head: [{ path: "Head/0.png", x: 0, y: 0, w: 10, h: 10 }],
      Jaw: [{ path: "Jaw/0.png", x: 0, y: 0, w: 10, h: 10 }],
      "Hands 1": [
        { path: "Hands 1/0.png", x: 1, y: 2, w: 3, h: 4 },
        { path: "Hands 1/1.png", x: 5, y: 6, w: 7, h: 8 },
      ],
    },
    restLayers: { Head: 0, Jaw: 0, "Hands 1": -1 },
  };

  it("paints the head (and beard) over the body", () => {
    expect(FACE_TABLES.indexOf("Body")).toBeLessThan(FACE_TABLES.indexOf("Head"));
    expect(FACE_TABLES.indexOf("Head")).toBeLessThan(FACE_TABLES.indexOf("Jaw"));
    expect(FACE_TABLES.indexOf("Jaw")).toBeLessThan(FACE_TABLES.indexOf("Hands 1"));
  });

  it("skips a missing part instead of substituting frame 0", () => {
    expect(layerPlace(sheet, "Eyebrows", 0)).toBeUndefined();
    expect(layerPlace(sheet, "Hands 1", -1)).toBeUndefined();
    expect(layerPlace(sheet, "Hands 1", 4)).toBeUndefined();
    expect(layerPlace(sheet, "Hands 1", 1)?.path).toBe("Hands 1/1.png");
  });

  it("hides hands at rest when the viseme rest index is -1", () => {
    expect(idleLayerIndex("Hands 1", sheet.restLayers)).toBe(-1);
    expect(idleLayerIndex("Jaw", sheet.restLayers)).toBe(0);
    expect(idleLayerIndex("Hands 1")).toBe(-1);
    expect(idleLayerIndex("Head")).toBe(0);
    expect(idleLayerIndex("Background")).toBe(-1);
  });
});

describe("idle-1 rest for every puppet", () => {
  it("hides Help1's shop-interior plate and keeps Help2's indoor plate", () => {
    const outdoor = visemeRestFromFrame({
      t: 0,
      layers: { Background: -1, Body: 0, Head: 0, Jaw: 0, "Hands 1": 0 },
      at: { Body: [255, 169], Head: [253, 44], Jaw: [253, 70] },
    });
    expect(outdoor.restLayers.Background).toBe(-1);
    expect(outdoor.rest.Head).toEqual({ x: 253, y: 44 });
    expect(outdoor.rest.Body).toEqual({ x: 255, y: 169 });
    const indoor = visemeRestFromFrame({
      t: 0,
      layers: { Background: 0, Body: 0, Head: 0 },
      at: { Background: [256, 132], Body: [255, 169], Head: [253, 44] },
    });
    expect(indoor.restLayers.Background).toBe(0);
    expect(indoor.rest.Background).toEqual({ x: 256, y: 132 });
  });

  it("prefers idle 1 over an earlier speech line", () => {
    const rest = mergePuppetRest(
      {
        rest: { Head: [1, 1] },
        restLayers: { Background: 0 },
      },
      { t: 0, layers: { Background: -1, Body: 0 }, at: { Body: [255, 169] } },
    );
    expect(rest.restLayers.Background).toBe(-1);
    expect(rest.rest.Body).toEqual({ x: 255, y: 169 });
  });

  it("drops a rest blit that finished after idle extras applied", () => {
    const sheet = { folder: "PUP/_HELP1" };
    expect(
      puppetPaintIsStale({ gen: 1, sheet, pose: 1 }, { gen: 1, sheet, pose: 2 }),
    ).toBe(true);
  });

  it("keeps Help2's shop plate and hides Help1's on the street", () => {
    const help1 = extractPuppet("PUP/_HELP1");
    const help2 = extractPuppet("PUP/_HELP2");
    if (!help1 || !help2) {
      return;
    }
    expect(help1.restLayers?.Background).toBe(-1);
    expect(help2.restLayers?.Background).toBe(0);
    expect(idleLayerIndex("Background", help1.restLayers)).toBe(-1);
    expect(idleLayerIndex("Background", help2.restLayers)).toBe(0);
    expect(layerPlace(help1, "Background", help1.restLayers?.Background ?? 0)).toBeUndefined();
    expect(layerPlace(help2, "Background", help2.restLayers?.Background ?? -1)?.path).toMatch(
      /Background\//,
    );
  });

  it("hides Dell1 and Cobb outdoor plates the same way as Help1", () => {
    const dell = extractPuppet("PUP/_DELL1");
    const cobb = extractPuppet("PUP/_COBB");
    if (!dell || !cobb) {
      return;
    }
    expect(dell.restLayers?.Background).toBe(-1);
    expect(cobb.restLayers?.Background).toBe(-1);
  });

  it("keeps idle 2 and idle 4 extras on the owning PUP", () => {
    const helpGlance = extractVisemeLine("PUP/_HELP1", "idle 2");
    const leroyGlance = extractVisemeLine("PUP/_LEROY", "idle 2");
    const helpSpeak = extractVisemeLine("PUP/_HELP1", "idle 4");
    const leroySpeak = extractVisemeLine("PUP/_LEROY", "idle 4");
    if (!helpGlance || !leroyGlance || !helpSpeak || !leroySpeak) {
      return;
    }
    expect(helpGlance.frames[0]?.layers.Background).toBe(-1);
    expect(leroyGlance.frames[0]?.layers.Background).toBe(0);
    expect(helpGlance.frames[1]?.layers.Head).toBe(3);
    expect(leroyGlance.frames[1]?.layers.Head).toBe(6);
    expect(helpSpeak.ticks).toBe(102);
    expect(leroySpeak.ticks).toBe(77);
    expect(helpSpeak.frames[0]?.layers.Background).toBe(-1);
    expect(leroySpeak.frames[0]?.layers.Background).toBe(0);
    expect(helpSpeak.frames[0]?.at?.Head).toEqual([253, 44]);
    expect(leroySpeak.frames[0]?.at?.Head).toEqual([249, 120]);
  });

  it("does not place Help's head with Leroy idle extras", () => {
    const help1 = extractPuppet("PUP/_HELP1");
    const leroy = extractPuppet("PUP/_LEROY");
    if (!help1 || !leroy) {
      return;
    }
    expect(help1.rest?.Head).toEqual({ x: 253, y: 44 });
    expect(leroy.rest?.Head).toEqual({ x: 249, y: 120 });
    expect(help1.restLayers?.Background).toBe(-1);
    expect(leroy.restLayers?.Background).toBe(0);
    const head = layerPlace(help1, "Head", 0);
    if (!head) {
      return;
    }
    const authored = layerBlitDest(head, help1.rest?.Head);
    const mixed = layerBlitDest(head, leroy.rest?.Head);
    expect(Math.abs(mixed.y - authored.y)).toBeGreaterThan(40);
  });

  it("places outdoor Help sleeves from idle extras, not stacked 384 headers", () => {
    const help1 = extractPuppet("PUP/_HELP1");
    if (!help1) {
      return;
    }
    const body = layerPlace(help1, "Body", 0)!;
    const hands = layerPlace(help1, "Hands 1", 0)!;
    const right = layerPlace(help1, "Right", 0)!;
    const bodyDest = layerBlitDest(body, help1.rest?.Body);
    const handsDest = layerBlitDest(hands, help1.rest?.["Hands 1"]);
    const rightDest = layerBlitDest(right, help1.rest?.Right);
    expect(handsDest.x).toBeLessThan(bodyDest.x);
    expect(rightDest.x).toBeGreaterThan(bodyDest.x);
    expect(Math.abs(hands.x - right.x)).toBeLessThan(10);
    expect(layerBlitDest(hands, undefined).x).toBe(hands.x);
  });

  it("still hides Background when sprites.json restLayers is missing", () => {
    const rest = mergePuppetRest(
      { rest: { Body: [255, 169] } },
      { t: 0, layers: { Background: -1, Body: 0 }, at: { Body: [255, 169] } },
    );
    expect(rest.restLayers.Background).toBe(-1);
    expect(idleLayerIndex("Background")).toBe(-1);
    const fromDumpOnly = mergePuppetRest({
      rest: { Body: [255, 169] },
      restLayers: { Background: -1, Body: 0 },
    });
    expect(fromDumpOnly.restLayers.Background).toBe(-1);
    expect(fromDumpOnly.rest.Body).toEqual({ x: 255, y: 169 });
  });
});

function extractVisemeLine(
  folder: string,
  ident: string,
): { ticks: number; frames: VisemeFrame[] } | undefined {
  const path = resolve("dfextract/out", folder, "AUDIO/visemes", `${ident}.json`);
  if (!existsSync(path)) {
    return undefined;
  }
  const data = JSON.parse(readFileSync(path, "utf8")) as {
    ticks?: number;
    frames?: VisemeFrame[];
  };
  if (!data.frames?.length) {
    return undefined;
  }
  return { ticks: data.ticks ?? 0, frames: data.frames };
}

function extractPuppet(folder: string): PuppetSheet | undefined {
  const sheetPath = resolve("dfextract/out", folder, "FRAMES/sprites.json");
  const idlePath = resolve("dfextract/out", folder, "AUDIO/visemes/idle 1.json");
  if (!existsSync(sheetPath) || !existsSync(idlePath)) {
    return undefined;
  }
  const data = JSON.parse(readFileSync(sheetPath, "utf8")) as {
    layers: PuppetSheet["layers"];
    rest?: Record<string, unknown>;
    restLayers?: Record<string, number>;
  };
  const idle = JSON.parse(readFileSync(idlePath, "utf8")) as { frames?: VisemeFrame[] };
  const merged = mergePuppetRest(data, idle.frames?.[0]);
  return {
    folder,
    layers: data.layers,
    rest: merged.rest,
    restLayers: merged.restLayers,
  };
}

describe("isFlatBackdrop", () => {
  it("treats a uniform plate as a fill, not a scene", () => {
    const data = new Uint8ClampedArray(64 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 80;
      data[i + 1] = 40;
      data[i + 2] = 32;
      data[i + 3] = 255;
    }
    expect(isFlatBackdrop(data)).toBe(true);
    data[0] = 0;
    data[1] = 0;
    data[2] = 0;
    data[4] = 255;
    data[5] = 255;
    data[6] = 255;
    expect(isFlatBackdrop(data)).toBe(false);
  });
});


