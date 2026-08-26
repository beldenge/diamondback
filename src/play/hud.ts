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

/**
 * INVEN HUD cels (`large` / `panel` / `hilite` / `empty`). TARGET sets
 * the held gun to `empty` so it is not the skull-slot revolver; do not
 * blit those as world sprites.
 */
export function isInventoryHudView(view: string): boolean {
  const name = view.toLowerCase();
  return name === "large" || name === "panel" || name === "hilite" || name === "empty";
}

/**
 * Boot `idle`: `cursor ("sight")` when gunhand is up, the pointer is on
 * the still, and it is not on the hand itself (reload / holster).
 */
export function gunhandWantsSight(
  gunhandVisible: boolean,
  point: { x: number; y: number },
  hitsGunhand: boolean,
): boolean {
  return (
    gunhandVisible &&
    point.x >= 0 &&
    point.x <= 512 &&
    point.y >= 0 &&
    point.y < 264 &&
    !hitsGunhand
  );
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

/** HUD-band cursor. Range EXIT is a FLT button; town uses MAINPANEL_BUTTONS. */
export function hudBarCursor(
  range: boolean,
  flatButton: string | undefined,
  held: boolean,
  panel: string | undefined,
): "touch" | "arrow" {
  if (range) {
    return flatButton ? "touch" : "arrow";
  }
  if (held || panel) {
    return "touch";
  }
  return "arrow";
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
/**
 * Keep the last blit on screen while the next PNG decodes.
 * Hiding the portrait / skipping an actor is the flicker.
 */
export function holdWhileLoading(nextReady: boolean, hasShown: boolean): boolean {
  return nextReady || hasShown;
}

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

/**
 * Screen-space PRP (`propxy` gunhand) uses `propdeg` as a cel index.
 * TARGET `pointx * 13 / 512 + 1` is 1-based on the 13 aim plates.
 * Reload is 0-based `bulletcount` on 7 cels. World strips stay 8-dir.
 */
export function propBlitFrame<T>(
  frames: T[],
  deg: number,
  timing: number[] | undefined,
  animTick: number,
  screen: boolean,
): T | undefined {
  if (!frames.length) {
    return undefined;
  }
  if (screen) {
    const d = Math.trunc(deg);
    if ((!timing || timing.length <= 1) && frames.length > 8 && d >= 1 && d <= frames.length) {
      return frames[d - 1];
    }
    return propViewFrame(frames, deg, timing, animTick);
  }
  if (frames.length === 1) {
    return frames[0];
  }
  const oct = Math.floor((((deg % 256) + 256) % 256) / 32) % frames.length;
  return frames[oct] ?? frames[0];
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

/** Same FLT still: do not retarget img.src (that flashes the board). */
export function boardStillNeedsBlit(drawnUrl: string, nextUrl: string): boolean {
  return nextUrl !== "" && drawnUrl !== nextUrl;
}

export function flatItemKey(item: FlatItem, index: number): string {
  return item.name || `${item.url}#${index}`;
}

export function sameFlatItems(a: readonly FlatItem[], b: readonly FlatItem[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.name !== right.name ||
      left.url !== right.url ||
      left.x !== right.x ||
      left.y !== right.y ||
      left.w !== right.w ||
      left.h !== right.h
    ) {
      return false;
    }
  }
  return true;
}

export class FlatOverlay {
  readonly root: HTMLDivElement;
  private readonly img: HTMLImageElement;
  private boardUrl = "";
  private boardItems: FlatItem[] = [];
  private readonly cash: HTMLDivElement;
  private readonly itemsEl: HTMLDivElement;
  private readonly labelsEl: HTMLDivElement;
  private kind: string | null = null;
  onClose: (() => void) | null = null;
  /** INVEN `stdmouse` panel/hilite click. */
  onSelect: ((name: string) => void) | null = null;
  /** Avatar EXAMINE — `sendtoprop (handitem, infoyoself ())`. */
  onInfo: (() => void) | null = null;
  /** SALGAMES / other FLT boards: stage-pixel pointerdown (not dismiss). */
  onBoardDown: ((x: number, y: number) => void) | null = null;

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
    this.labelsEl = document.createElement("div");
    this.labelsEl.id = "play-flat-labels";
    this.root.append(this.img, this.itemsEl, this.labelsEl, this.cash);
    // Dust FLT buttons are `mousedown` + `trackbut`. A `click` after
    // `#play-stage` pointerdown can lose the first press (no click, or
    // the leftover click is skipNextClick). Fire on pointerdown.
    this.root.addEventListener("pointerdown", (event) => this.onPointerDown(event));
  }

  get open(): boolean {
    return this.kind !== null;
  }

  get board(): boolean {
    return this.kind === "board";
  }

  show(kind: "map" | "avatar" | "score", cash = 0, items: FlatItem[] = []): void {
    const url = FLAT_STILL[kind];
    if (!url) {
      return;
    }
    this.kind = kind;
    this.root.classList.remove("board");
    this.boardUrl = "";
    this.img.src = url;
    this.root.hidden = false;
    this.cash.hidden = kind !== "avatar";
    this.cash.textContent = kind === "avatar" ? `$${cash}` : "";
    this.setItems(items);
    this.setLabels([]);
  }

  /** SALGAMES.FLT / CHECKERS.FLT: full 512×384 still + screen-space props. */
  showBoard(url: string, items: FlatItem[] = [], labels: { text: string; x: number; y: number; size?: number }[] = []): void {
    this.kind = "board";
    this.root.classList.add("board");
    this.root.hidden = false;
    this.cash.hidden = true;
    this.cash.textContent = "";
    if (boardStillNeedsBlit(this.boardUrl, url)) {
      this.boardUrl = url;
      this.img.src = url;
    }
    if (items.length === 0 && this.boardItems.length > 0) {
      this.setLabels(labels);
      return;
    }
    this.setItems(items);
    this.setLabels(labels);
  }

  setLabels(labels: { text: string; x: number; y: number; size?: number }[]): void {
    this.labelsEl.replaceChildren();
    for (const label of labels) {
      const el = document.createElement("div");
      el.textContent = label.text;
      el.style.left = `${(label.x / STAGE_WIDTH) * 100}%`;
      el.style.top = `${(label.y / STAGE_HEIGHT) * 100}%`;
      el.style.fontSize = `${label.size ?? 12}px`;
      this.labelsEl.append(el);
    }
  }

  setItems(items: FlatItem[]): void {
    if (sameFlatItems(this.boardItems, items)) {
      return;
    }
    this.boardItems = items.map((item) => ({ ...item }));
    const prev = new Map<string, HTMLImageElement>();
    for (const node of [...this.itemsEl.children]) {
      if (!(node instanceof HTMLImageElement)) {
        node.remove();
        continue;
      }
      const key = node.dataset.item || node.src;
      if (key && !prev.has(key)) {
        prev.set(key, node);
      } else {
        node.remove();
      }
    }
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]!;
      const key = flatItemKey(item, i);
      let img = prev.get(key);
      if (img) {
        prev.delete(key);
      } else {
        img = document.createElement("img");
        img.alt = "";
        img.draggable = false;
      }
      if (item.name) {
        img.dataset.item = item.name;
      } else {
        delete img.dataset.item;
      }
      if (img.getAttribute("src") !== item.url) {
        img.src = item.url;
      }
      img.style.left = `${(item.x / STAGE_WIDTH) * 100}%`;
      img.style.top = `${(item.y / STAGE_HEIGHT) * 100}%`;
      img.style.width = `${(item.w / STAGE_WIDTH) * 100}%`;
      img.style.height = `${(item.h / STAGE_HEIGHT) * 100}%`;
      this.itemsEl.append(img);
    }
    for (const leftover of prev.values()) {
      leftover.remove();
    }
  }

  close(): void {
    const wasBoard = this.kind === "board";
    this.kind = null;
    this.root.classList.remove("board");
    this.boardUrl = "";
    this.setItems([]);
    this.setLabels([]);
    this.root.hidden = true;
    if (!wasBoard) {
      this.onClose?.();
    }
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (this.kind === "board") {
      const bounds = this.root.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return;
      }
      const x = ((event.clientX - bounds.left) / bounds.width) * STAGE_WIDTH;
      const y = ((event.clientY - bounds.top) / bounds.height) * STAGE_HEIGHT;
      this.onBoardDown?.(x, y);
      return;
    }
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
