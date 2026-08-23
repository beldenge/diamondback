import { extractUrl } from "../world/set/extract";
import { HUD_HEIGHT, STAGE_HEIGHT, STAGE_WIDTH } from "./stage";
import { voices } from "./speech";

export interface BevelChoice {
  id: number;
  label: string;
}

export interface SpritePlace {
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
  id?: number;
  index?: number;
  /** CST frame record +8: 0-based pose in this `actorpose` strip. */
  pose?: number;
  /** CST frame record +0x28: authored facing on the 256-circle (0=south). */
  deg?: number;
}

export interface PuppetSheet {
  folder: string;
  layers: Record<string, SpritePlace[]>;
  /** Viseme rest-pose centers `{ x, y }` on the 512×264 still. */
  rest?: Record<string, { x: number; y: number }>;
  /** Viseme rest-pose table indices (`-1` = hide). */
  restLayers?: Record<string, number>;
}

export interface VisemeFrame {
  t: number;
  layers: Record<string, number>;
  /** Per-layer sprite centers `[cx, cy]` or `{ x, y }` on the 512×264 still. */
  at?: Record<string, { x: number; y: number } | number[]>;
}

/** DFET sprite headers put the hotspot at (256, 192). Viseme extras move that hotspot. */
export const HOTSPOT_X = 256;
export const HOTSPOT_Y = 192;

/**
 * Blit top-left so the sprite's authored hotspot lands on viseme `(cx, cy)`.
 * `headerX/Y` is the 384-stage top-left from the sprite header (hotspot at 256,192).
 * Do not bbox-center: talking jaws are wider to the right, so that pulls the mouth left.
 */
export function spriteTopLeft(
  cx: number,
  cy: number,
  headerX: number,
  headerY: number,
): { x: number; y: number } {
  return {
    x: Math.round(cx + headerX - HOTSPOT_X),
    y: Math.round(cy + headerY - HOTSPOT_Y),
  };
}

export function asCenter(value: unknown): { x: number; y: number } | undefined {
  if (Array.isArray(value) && value.length >= 2) {
    const x = Number(value[0]);
    const y = Number(value[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x, y };
    }
    return undefined;
  }
  if (value && typeof value === "object" && "x" in value && "y" in value) {
    const x = Number((value as { x: number }).x);
    const y = Number((value as { y: number }).y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x, y };
    }
  }
  return undefined;
}

export interface VisemeLine {
  ticks: number;
  frames: VisemeFrame[];
}

/**
 * Paint order matches the PUP face tables. Body is the chest (black
 * face-hole is a matte). Head includes the beard and sits on top so a
 * head-turn is not covered by the body's front-facing beard ring.
 * Features then hands. Skip a missing folder (Kid has no Eyebrows).
 */
export const FACE_TABLES = [
  "Background",
  "Body",
  "Head",
  "Eyes",
  "Eyebrows",
  "Nose",
  "Jaw",
  "Left",
  "Hands 1",
  "Right",
  "Hands 2",
] as const;

const GESTURE_TABLES = new Set(["Left", "Hands 1", "Right", "Hands 2"]);

/** Rest viseme index, or hide hands until a viseme shows them. */
export function idleLayerIndex(
  name: string,
  restLayers?: Record<string, number>,
): number {
  if (restLayers && Object.prototype.hasOwnProperty.call(restLayers, name)) {
    return restLayers[name]!;
  }
  return GESTURE_TABLES.has(name) ? -1 : 0;
}

/** No fallback to frame 0: a missing part is skipped, not a wrong sprite. */
export function layerPlace(
  sheet: PuppetSheet,
  name: string,
  index: number,
): SpritePlace | undefined {
  if (index < 0) {
    return undefined;
  }
  return sheet.layers[name]?.[index];
}

export const VISEME_HZ = 60;

/** DreamFactory draws five stacked bevels in the 120px HUD band. */
export const BEVEL_SLOTS = 5;
/** Speech bar height in stage pixels, flush on the HUD, over the still. */
export const SPEECH_BAR_HEIGHT = 40;

/** Watchdog only: never a 12s floor. Wait for the WAV, or a short viseme estimate. */
export function speakHangSec(duration: number, visemeTicks?: number): number {
  const fromWav = duration > 0 ? duration : 0;
  const fromViseme = (visemeTicks ?? 0) / VISEME_HZ;
  return Math.max(fromWav, fromViseme, 1.5) + 0.15;
}

/** Solid studio plates (Leroy brown, Jenix black) are not scene art. */
export function isFlatBackdrop(data: Uint8ClampedArray): boolean {
  let min = 765;
  let max = 0;
  for (let i = 0; i < data.length; i += 16) {
    const luma = data[i]! + data[i + 1]! + data[i + 2]!;
    if (luma < min) {
      min = luma;
    }
    if (luma > max) {
      max = luma;
    }
    if (max - min >= 120) {
      return false;
    }
  }
  return max - min < 120;
}

export class PuppetUi {
  readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly line: HTMLDivElement;
  private readonly choices: HTMLDivElement;
  private readonly slots: HTMLButtonElement[] = [];
  private sheet: PuppetSheet | null = null;
  private speakWait: (() => void) | null = null;
  private eventWait: ((id: number) => void) | null = null;
  private speakTimer: ReturnType<typeof setTimeout> | null = null;
  private lipsLive = false;
  private talking = false;
  private viseme: VisemeLine | null = null;
  private visemeTick = -1;
  private readonly bitmaps = new Map<string, HTMLImageElement>();
  private readonly flatBackdrop = new Map<string, boolean>();
  private readonly layerIndex = new Map<string, number>();
  private readonly layerAt = new Map<string, { x: number; y: number }>();
  private paintGen = 0;
  /** Speech bar on. Audio and visemes keep running when this is off. */
  private captionsOn = true;

  constructor() {
    this.root = document.createElement("div");
    this.root.id = "puppet-ui";
    this.root.hidden = true;
    this.canvas = document.createElement("canvas");
    this.canvas.id = "puppet-layers";
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2d canvas missing");
    }
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.line = document.createElement("div");
    this.line.id = "puppet-line";
    this.line.hidden = true;
    this.line.addEventListener("click", () => {
      if (!this.speakWait) {
        return;
      }
      voices.unlock();
      this.finishSpeak();
    });
    this.choices = document.createElement("div");
    this.choices.id = "puppet-choices";
    this.choices.hidden = true;
    this.choices.style.setProperty("--bevel-art", `url("${BEVEL_CHROME}")`);
    for (let i = 0; i < BEVEL_SLOTS; i += 1) {
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = "puppet-bevel";
      slot.disabled = true;
      this.slots.push(slot);
      this.choices.append(slot);
    }
    this.root.append(this.canvas, this.line, this.choices);
  }

  layout(scale: number): void {
    this.root.style.width = `${STAGE_WIDTH * scale}px`;
    this.root.style.height = `${STAGE_HEIGHT * scale}px`;
    this.root.style.setProperty("--play-scale", String(scale));
    this.canvas.style.width = `${STAGE_WIDTH * scale}px`;
    this.canvas.style.height = `${STAGE_HEIGHT * scale}px`;
    this.canvas.width = STAGE_WIDTH;
    this.canvas.height = STAGE_HEIGHT;
    this.paint();
  }

  open(sheet: PuppetSheet): void {
    this.sheet = sheet;
    this.root.hidden = false;
    this.applyIdle();
    this.setLine("");
    this.showEmptyBevels();
    void this.paint();
  }

  close(): void {
    this.stopJaw();
    this.stopAudio();
    this.setLine("");
    this.root.hidden = true;
    this.clearBevels();
    this.sheet = null;
    this.finishSpeak();
    this.eventWait?.(-1);
    this.eventWait = null;
  }

  clear(): void {
    this.setLine("");
    this.clearBevels();
  }

  toggleCaptions(): boolean {
    this.captionsOn = !this.captionsOn;
    this.root.classList.toggle("hide-captions", !this.captionsOn);
    return this.captionsOn;
  }

  addBevel(choice: BevelChoice): void {
    const slot = this.slots.find((button) => button.disabled);
    if (!slot) {
      return;
    }
    slot.textContent = choice.label;
    slot.disabled = false;
    slot.onclick = () => {
      voices.unlock();
      const wait = this.eventWait;
      this.eventWait = null;
      wait?.(choice.id);
    };
    this.choices.hidden = false;
    this.root.classList.add("choosing");
  }

  waitEvent(): Promise<number> {
    this.choices.hidden = false;
    this.root.classList.add("choosing");
    return new Promise((resolve) => {
      this.eventWait = resolve;
    });
  }

  preloadVoices(urls: string[]): Promise<void> {
    return voices.preload(urls);
  }

  async speak(
    text: string,
    wavUrl: string | undefined,
    viseme: VisemeLine | undefined,
  ): Promise<void> {
    this.setLine(text);
    this.root.classList.add("speaking");
    this.clearSpeakTimer();
    this.viseme = viseme ?? null;
    this.visemeTick = -1;
    this.talking = true;
    this.lipsLive = false;
    const done = new Promise<void>((resolve) => {
      this.speakWait = resolve;
    });
    this.applyViseme(0);
    let duration = 0;
    if (wavUrl) {
      duration = await voices.play(wavUrl);
    }
    this.lipsLive = duration > 0 || voices.outputLive();
    this.applyViseme(0);
    const hold = speakHangSec(duration, viseme?.ticks);
    this.speakTimer = setTimeout(() => this.finishSpeak(), hold * 1000);
    await done;
    this.root.classList.remove("speaking");
    this.stopJaw();
  }

  setViseme(viseme: VisemeLine): void {
    if (!this.talking) {
      return;
    }
    this.viseme = viseme;
    this.visemeTick = -1;
    this.applyViseme(voices.currentTime());
  }

  tick(_dt: number): void {
    if (!this.talking || !this.viseme || !this.lipsLive) {
      return;
    }
    if (!voices.outputLive()) {
      return;
    }
    this.applyViseme(voices.currentTime());
  }

  private applyViseme(seconds: number): void {
    const tick = Math.max(0, Math.round(seconds * VISEME_HZ));
    if (tick === this.visemeTick) {
      return;
    }
    this.visemeTick = tick;
    const frames = this.viseme?.frames;
    if (!frames?.length) {
      return;
    }
    let hit = frames[0]!;
    for (const frame of frames) {
      if (frame.t > tick) {
        break;
      }
      hit = frame;
    }
    let changed = false;
    for (const [name, index] of Object.entries(hit.layers)) {
      if (this.layerIndex.get(name) !== index) {
        this.layerIndex.set(name, index);
        changed = true;
      }
    }
    if (hit.at) {
      for (const [name, value] of Object.entries(hit.at)) {
        const center = asCenter(value);
        if (!center) {
          continue;
        }
        const prev = this.layerAt.get(name);
        if (!prev || prev.x !== center.x || prev.y !== center.y) {
          this.layerAt.set(name, center);
          changed = true;
        }
      }
    }
    if (changed) {
      void this.paint();
    }
  }

  private applyIdle(): void {
    const sheet = this.sheet;
    this.layerIndex.clear();
    this.layerAt.clear();
    if (!sheet) {
      return;
    }
    for (const name of FACE_TABLES) {
      if (!sheet.layers[name]?.length) {
        continue;
      }
      this.layerIndex.set(name, idleLayerIndex(name, sheet.restLayers));
    }
  }

  private stopJaw(): void {
    this.talking = false;
    this.lipsLive = false;
    this.viseme = null;
    this.applyIdle();
    void this.paint();
  }

  private async paint(): Promise<void> {
    const sheet = this.sheet;
    if (!sheet) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    const gen = ++this.paintGen;
    const jobs: { name: string; place: SpritePlace; img: Promise<HTMLImageElement> }[] = [];
    for (const name of FACE_TABLES) {
      const index = this.layerIndex.get(name) ?? idleLayerIndex(name, sheet.restLayers);
      const place = layerPlace(sheet, name, index);
      if (!place) {
        continue;
      }
      jobs.push({ name, place, img: this.bitmap(sheet.folder, place.path) });
    }
    const loaded = await Promise.all(jobs.map(async (job) => ({
      name: job.name,
      place: job.place,
      img: await job.img,
    })));
    if (gen !== this.paintGen) {
      return;
    }
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    const rest = sheet.rest ?? {};
    for (const { name, img, place } of loaded) {
      if (name === "Background" && this.backdropIsFlat(img)) {
        continue;
      }
      const center = this.layerAt.get(name) ?? rest[name];
      const dest = center
        ? spriteTopLeft(center.x, center.y, place.x, place.y)
        : place;
      this.ctx.drawImage(img, dest.x, dest.y, place.w, place.h);
    }
  }

  private backdropIsFlat(img: CanvasImageSource): boolean {
    if (!(img instanceof HTMLImageElement) || !img.src) {
      return false;
    }
    const cached = this.flatBackdrop.get(img.src);
    if (cached !== undefined) {
      return cached;
    }
    const sample = document.createElement("canvas");
    sample.width = 64;
    sample.height = 32;
    const ctx = sample.getContext("2d");
    if (!ctx) {
      this.flatBackdrop.set(img.src, false);
      return false;
    }
    ctx.drawImage(img, 0, 0, 64, 32);
    const flat = isFlatBackdrop(ctx.getImageData(0, 0, 64, 32).data);
    this.flatBackdrop.set(img.src, flat);
    return flat;
  }

  private bitmap(folder: string, rel: string): Promise<HTMLImageElement> {
    const url = extractUrl(`${folder}/FRAMES/${rel}`);
    const hit = this.bitmaps.get(url);
    if (hit && hit.complete && hit.naturalWidth) {
      return Promise.resolve(hit);
    }
    return new Promise((resolve, reject) => {
      const img = hit ?? new Image();
      this.bitmaps.set(url, img);
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(url));
      if (!img.src) {
        img.src = url;
      } else if (img.complete) {
        resolve(img);
      }
    });
  }

  private setLine(text: string): void {
    this.line.textContent = text;
    this.line.hidden = !text;
  }

  private clearBevels(): void {
    for (const slot of this.slots) {
      slot.textContent = "";
      slot.disabled = true;
      slot.onclick = null;
    }
    if (this.root.hidden) {
      this.choices.hidden = true;
      this.root.classList.remove("choosing");
    } else {
      this.showEmptyBevels();
    }
  }

  /** Five blank HOUSE bevels replace the HUD for the whole puppet. */
  private showEmptyBevels(): void {
    this.choices.hidden = false;
    this.root.classList.add("choosing");
  }

  private finishSpeak(): void {
    const wait = this.speakWait;
    this.speakWait = null;
    this.root.classList.remove("speaking");
    this.stopAudio();
    wait?.();
  }

  private clearSpeakTimer(): void {
    if (this.speakTimer !== null) {
      clearTimeout(this.speakTimer);
      this.speakTimer = null;
    }
  }

  private stopAudio(): void {
    this.clearSpeakTimer();
    voices.stop();
  }
}

export const PLAY_HUD_CHROME = extractUrl("FLT/_NEW/frame_3.png");
/** HOUSE.PRP 72×23 3D rim. Interior is transparent, not an OS button. */
export const BEVEL_CHROME = extractUrl("PRP/_HOUSE/FRAMES/butbevel/base/00_c66.png");
/** Only opaque pixels on `butbevel`: dark top/left, tan bottom/right. */
export const BEVEL_DARK = "rgb(111, 56, 38)";
export const BEVEL_LIGHT = "rgb(206, 166, 128)";
export const HUD_BAND = HUD_HEIGHT;
