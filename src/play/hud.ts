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

/** NEW.FLT container 10 — avatar / inventory. */
export const AVATAR_BUTTONS: MacRect[] = [
  { name: "info", top: 320, left: 155, bottom: 345, right: 256 },
  { name: "ok", top: 321, left: 266, bottom: 345, right: 367 },
];

export const FLAT_STILL: Record<string, string> = {
  map: extractUrl("FLT/_NEW/frame_6.png"),
  avatar: extractUrl("FLT/_NEW/frame_9.png"),
  score: extractUrl("FLT/_NEW/frame_12.png"),
};

export function hitMacRect(rects: MacRect[], x: number, y: number): MacRect | undefined {
  return rects.find((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom);
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
    this.root.addEventListener("click", (event) => this.onClick(event));
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
    this.setItems(kind === "avatar" ? items : []);
  }

  setItems(items: FlatItem[]): void {
    this.itemsEl.replaceChildren();
    for (const item of items) {
      const img = document.createElement("img");
      img.alt = "";
      img.draggable = false;
      img.src = item.url;
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

  private onClick(event: MouseEvent): void {
    const bounds = this.root.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * STAGE_WIDTH;
    const y = ((event.clientY - bounds.top) / bounds.height) * STAGE_HEIGHT;
    if (this.kind === "avatar") {
      const hit = hitMacRect(AVATAR_BUTTONS, x, y);
      if (hit?.name === "ok") {
        this.close();
      }
      return;
    }
    this.close();
  }
}
