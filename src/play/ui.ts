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
}

export interface PuppetSheet {
  folder: string;
  layers: Record<string, SpritePlace[]>;
  /** Viseme rest-pose centers `{ x, y }` on the 512×264 still. */
  rest?: Record<string, { x: number; y: number }>;
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

/** Head goes in the Body face-hole, so Body is painted over Head. */
const FACE_LAYERS = [
  "Background",
  "Head",
  "Body",
  "Eyes",
  "Eyebrows",
  "Nose",
  "Jaw",
] as const;

export const VISEME_HZ = 60;

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
  private readonly skip: HTMLButtonElement;
  private sheet: PuppetSheet | null = null;
  private speakWait: (() => void) | null = null;
  private eventWait: ((id: number) => void) | null = null;
  private speakTimer: ReturnType<typeof setTimeout> | null = null;
  private lipsLive = false;
  private talking = false;
  private viseme: VisemeLine | null = null;
  private visemeTick = -1;
  private readonly bitmaps = new Map<string, HTMLImageElement>();
  private readonly knockouts = new Map<string, HTMLCanvasElement>();
  private readonly flatBackdrop = new Map<string, boolean>();
  private readonly layerIndex = new Map<string, number>();
  private readonly layerAt = new Map<string, { x: number; y: number }>();
  private paintGen = 0;

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
    this.choices = document.createElement("div");
    this.choices.id = "puppet-choices";
    this.skip = document.createElement("button");
    this.skip.type = "button";
    this.skip.textContent = "Continue";
    this.skip.addEventListener("click", () => {
      voices.unlock();
      this.finishSpeak();
    });
    this.root.append(this.canvas, this.line, this.skip, this.choices);
  }

  layout(scale: number): void {
    this.root.style.width = `${STAGE_WIDTH * scale}px`;
    this.root.style.height = `${STAGE_HEIGHT * scale}px`;
    this.canvas.style.width = `${STAGE_WIDTH * scale}px`;
    this.canvas.style.height = `${STAGE_HEIGHT * scale}px`;
    this.canvas.width = STAGE_WIDTH;
    this.canvas.height = STAGE_HEIGHT;
    this.paint();
  }

  open(sheet: PuppetSheet): void {
    this.sheet = sheet;
    this.root.hidden = false;
    this.layerIndex.clear();
    this.layerAt.clear();
    for (const name of FACE_LAYERS) {
      if (sheet.layers[name]?.length) {
        this.layerIndex.set(name, 0);
      }
    }
    this.line.textContent = "";
    this.choices.replaceChildren();
    this.skip.hidden = true;
    void this.paint();
  }

  close(): void {
    this.stopJaw();
    this.stopAudio();
    this.root.hidden = true;
    this.sheet = null;
    this.finishSpeak();
    this.eventWait?.(-1);
    this.eventWait = null;
  }

  clear(): void {
    this.choices.replaceChildren();
    this.line.textContent = "";
    this.skip.hidden = true;
  }

  addBevel(choice: BevelChoice): void {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = choice.label;
    button.addEventListener("click", () => {
      voices.unlock();
      const wait = this.eventWait;
      this.eventWait = null;
      wait?.(choice.id);
    });
    this.choices.append(button);
  }

  waitEvent(): Promise<number> {
    this.skip.hidden = true;
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
    this.line.textContent = text;
    this.skip.hidden = false;
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

  private stopJaw(): void {
    this.talking = false;
    this.lipsLive = false;
    this.viseme = null;
    this.layerAt.clear();
    for (const name of FACE_LAYERS) {
      this.layerIndex.set(name, 0);
    }
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
    for (const name of FACE_LAYERS) {
      const frames = sheet.layers[name];
      if (!frames?.length) {
        continue;
      }
      const index = this.layerIndex.get(name) ?? 0;
      if (index < 0) {
        continue;
      }
      const place = frames[index] ?? frames[0]!;
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
    const draws = loaded.map((job) => ({
      name: job.name,
      place: job.place,
      img: job.name === "Body" ? this.knockoutBlack(job.img) : job.img,
    }));
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    const rest = sheet.rest ?? {};
    for (const { name, img, place } of draws) {
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

  private knockoutBlack(img: HTMLImageElement): HTMLCanvasElement {
    const key = img.src;
    const hit = this.knockouts.get(key);
    if (hit) {
      return hit;
    }
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return canvas;
    }
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! < 14 && data[i + 1]! < 14 && data[i + 2]! < 14) {
        data[i + 3] = 0;
      }
    }
    ctx.putImageData(pixels, 0, 0);
    this.knockouts.set(key, canvas);
    return canvas;
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

  private finishSpeak(): void {
    const wait = this.speakWait;
    this.speakWait = null;
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

export const PLAY_HUD_FACE_NIGHT = extractUrl(
  "PRP/_HOUSE/FRAMES/avatar/nitefaces/00_c83.png",
);
export const PLAY_HUD_CHROME = extractUrl("FLT/_NEW/frame_3.png");
export const HUD_BAND = HUD_HEIGHT;
