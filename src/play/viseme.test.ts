import { describe, expect, it } from "vitest";
import type { PuppetSheet, VisemeFrame } from "./ui";
import {
  asCenter,
  FACE_TABLES,
  idleLayerIndex,
  isFlatBackdrop,
  layerPlace,
  speakHangSec,
  spriteTopLeft,
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

describe("speak watchdog", () => {
  it("waits for the WAV, not a 12 second floor", () => {
    expect(speakHangSec(4.2, 125)).toBeCloseTo(4.35);
    expect(speakHangSec(0, 125)).toBeLessThan(5);
    expect(speakHangSec(0, 125)).toBeGreaterThan(2);
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
  });
});

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


