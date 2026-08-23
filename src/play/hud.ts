import { extractUrl } from "../world/set/extract";
import { HUD_HEIGHT, STAGE_HEIGHT, STAGE_WIDTH } from "./stage";

/** DreamFactory / Mac Rect: top, left, bottom, right in 512×384 stage pixels. */
export interface MacRect {
  top: number;
  left: number;
  bottom: number;
  right: number;
  name: string;
}

/** HUD chrome hits in 512×384 stage pixels. Map / skull-menu / portrait. */
export const MAINPANEL_BUTTONS: MacRect[] = [
  { name: "map", top: 280, left: 24, bottom: 372, right: 128 },
  { name: "horn", top: 268, left: 145, bottom: 384, right: 372 },
  { name: "self", top: 264, left: 390, bottom: 384, right: 512 },
];

/** NEW.FLT container 10 — avatar / inventory. `info` is EXAMINE. */
export const AVATAR_BUTTONS: MacRect[] = [
  { name: "info", top: 320, left: 155, bottom: 345, right: 256 },
  { name: "ok", top: 321, left: 266, bottom: 345, right: 367 },
];

export type AvatarFlatAction =
  | { kind: "info" }
  | { kind: "ok" }
  | { kind: "item"; name: string };

/**
 * Avatar-flat hit. Buttons win over item sprites (Dust `hittest` kind
 * `button` before `prop`). EXAMINE/OK must not wait for a second click
 * because an inventory PNG's box covered the HUD.
 */
export function avatarFlatAction(
  x: number,
  y: number,
  itemName?: string,
): AvatarFlatAction | undefined {
  const hit = hitMacRect(AVATAR_BUTTONS, x, y);
  if (hit?.name === "info") {
    return { kind: "info" };
  }
  if (hit?.name === "ok") {
    return { kind: "ok" };
  }
  if (itemName) {
    return { kind: "item", name: itemName };
  }
  return undefined;
}

/**
 * Avatar EXAMINE `handitem`. Boot `addinven ("helpbut")` parks the HELP
 * chrome as the held prop — that object's `infoyoself` is empty. Skip it
 * and fall back to the first real owned item so EXAMINE plays on the
 * first pointer, without a prior panel click.
 */
export function examineHandName(handitem: string, owned: string[]): string {
  const skip = (name: string) => !name || name.toLowerCase() === "helpbut";
  const hand = handitem.trim();
  if (!skip(hand)) {
    return hand;
  }
  return owned.find((name) => !skip(name)) ?? "";
}

/** Avatar-flat INVEN view. `stdmouse` hilite is the HUD `handitem`. */
export function inventorySpriteView(name: string, handitem: string): "hilite" | "panel" {
  const who = name.toLowerCase();
  const hand = handitem.toLowerCase();
  return who !== "" && who === hand ? "hilite" : "panel";
}

export const FLAT_STILL: Record<string, string> = {
  map: extractUrl("FLT/_NEW/frame_6.png"),
  avatar: extractUrl("FLT/_NEW/frame_9.png"),
  score: extractUrl("FLT/_NEW/frame_12.png"),
};

/**
 * Map `cross` hotspot. NEW.FLT `openflat`: `scenecol * 20 + 222`,
 * `scenerow * 20 + 93`. Pass **0-based** tiles (`scene a1` = 0,0):
 * 1-based opcode values would put `scene g15` at y=393, off the still.
 * PRP `_HOUSE` cross timing is `1,1,1,2,2,2` (frame 2 missing = blink).
 */
export const MAP_CROSS_ORIGIN = { x: 222, y: 93 };
export const MAP_CROSS_CELL = 20;
export const MAP_CROSS_TIMING = [1, 1, 1, 2, 2, 2];
/** 6 game frames at boot `framerate (3)` = 20 Hz → 300 ms on/off. */
export const MAP_CROSS_FLASH_SEC = 0.3;

export function mapCrossHotspot(col0: number, row0: number): { x: number; y: number } {
  return {
    x: col0 * MAP_CROSS_CELL + MAP_CROSS_ORIGIN.x,
    y: row0 * MAP_CROSS_CELL + MAP_CROSS_ORIGIN.y,
  };
}

export function mapCrossLit(animTick: number, timing = MAP_CROSS_TIMING): boolean {
  return (timing[animTick % timing.length] ?? 1) === 1;
}

export function hitMacRect(rects: MacRect[], x: number, y: number): MacRect | undefined {
  return rects.find((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom);
}

/** INVEN `addinven` / `stdmouse` slot on the mainpanel HUD. */
export const HAND_SLOT = { x: 316, y: 320 };
export const HAND_HIT = 40;

/** HOUSE `noface` portrait hotspot on the 512×384 stage. */
export const AVATAR_SLOT = { x: 460, y: 325 };

/**
 * PRP view frame. Timing tables are 1-based CST/PRP setInfo +0x2e slots
 * (niterite glance, nitehattip). Length-1 tables stay on `propdeg`.
 */
export function propViewFrame<T>(
  frames: T[],
  deg: number,
  timing: number[] | undefined,
  animTick: number,
): T | undefined {
  if (!frames.length) {
    return undefined;
  }
  if (timing && timing.length > 1) {
    const slot = timing[animTick % timing.length] ?? 1;
    return frames[Math.max(0, Math.min(frames.length - 1, slot - 1))];
  }
  const index = Math.max(0, Math.min(frames.length - 1, Math.trunc(deg) || 0));
  return frames[index];
}

/** Dust `stdmouse`: click the large held prop, not the skull under it. */
export function hitsHandSlot(x: number, y: number, hx = HAND_SLOT.x, hy = HAND_SLOT.y): boolean {
  return Math.abs(hx - x) < HAND_HIT && Math.abs(hy - y) < HAND_HIT;
}

/** Stage pixel from a pointer on the 512×384 `#play-stage` box. */
export function stageFromClient(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
): { x: number; y: number } | null {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }
  return {
    x: ((clientX - bounds.left) / bounds.width) * STAGE_WIDTH,
    y: ((clientY - bounds.top) / bounds.height) * STAGE_HEIGHT,
  };
}

export function stageFromHudClick(
  localX: number,
  localY: number,
  hudW: number,
  hudH: number,
): { x: number; y: number } | null {
  if (hudW <= 0 || hudH <= 0) {
    return null;
  }
  return {
    x: (localX / hudW) * STAGE_WIDTH,
    y: STAGE_HEIGHT - HUD_HEIGHT + (localY / hudH) * HUD_HEIGHT,
  };
}

export interface FlatItem {
  name?: string;
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class FlatOverlay {
  readonly root: HTMLDivElement;
  private readonly img: HTMLImageElement;
  private readonly cash: HTMLDivElement;
  private readonly itemsEl: HTMLDivElement;
  private kind: string | null = null;
  onClose: (() => void) | null = null;
  /** INVEN `stdmouse` panel/hilite click. */
  onSelect: ((name: string) => void) | null = null;
  /** Avatar EXAMINE — `sendtoprop (handitem, infoyoself ())`. */
  onInfo: (() => void) | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.id = "play-flat";
    this.root.hidden = true;
    this.img = document.createElement("img");
    this.img.alt = "";
    this.img.draggable = false;
    this.cash = document.createElement("div");
    this.cash.id = "play-flat-cash";
    this.itemsEl = document.createElement("div");
    this.itemsEl.id = "play-flat-items";
    this.root.append(this.img, this.itemsEl, this.cash);
    // Dust FLT buttons are `mousedown` + `trackbut`. A `click` after
    // `#play-stage` pointerdown can lose the first press (no click, or
    // the leftover click is skipNextClick). Fire on pointerdown.
    this.root.addEventListener("pointerdown", (event) => this.onPointerDown(event));
  }

  get open(): boolean {
    return this.kind !== null;
  }

  show(kind: "map" | "avatar" | "score", cash = 0, items: FlatItem[] = []): void {
    const url = FLAT_STILL[kind];
    if (!url) {
      return;
    }
    this.kind = kind;
    this.img.src = url;
    this.root.hidden = false;
    this.cash.hidden = kind !== "avatar";
    this.cash.textContent = kind === "avatar" ? `$${cash}` : "";
    this.setItems(items);
  }

  setItems(items: FlatItem[]): void {
    this.itemsEl.replaceChildren();
    for (const item of items) {
      const img = document.createElement("img");
      img.alt = "";
      img.draggable = false;
      img.src = item.url;
      if (item.name) {
        img.dataset.item = item.name;
      }
      img.style.left = `${(item.x / STAGE_WIDTH) * 100}%`;
      img.style.top = `${(item.y / STAGE_HEIGHT) * 100}%`;
      img.style.width = `${(item.w / STAGE_WIDTH) * 100}%`;
      img.style.height = `${(item.h / STAGE_HEIGHT) * 100}%`;
      this.itemsEl.append(img);
    }
  }

  close(): void {
    this.kind = null;
    this.setItems([]);
    this.root.hidden = true;
    this.onClose?.();
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (this.kind === "avatar") {
      const bounds = this.root.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) * STAGE_WIDTH;
      const y = ((event.clientY - bounds.top) / bounds.height) * STAGE_HEIGHT;
      const item =
        event.target instanceof HTMLElement ? event.target.dataset.item : undefined;
      const action = avatarFlatAction(x, y, item);
      if (action?.kind === "ok") {
        this.close();
      } else if (action?.kind === "info") {
        this.onInfo?.();
      } else if (action?.kind === "item") {
        this.onSelect?.(action.name);
      }
      return;
    }
    this.close();
  }
}
