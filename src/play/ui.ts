import { extractUrl } from "../world/set/extract";
import { rasterizePng } from "../world/set/stillsView";
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

/** In-flight puppet blit must not land after close / a new `open` / a new pose. */
export function puppetPaintIsStale(
  started: { gen: number; sheet: unknown; pose?: number },
  live: { gen: number; sheet: unknown; pose?: number },
): boolean {
  return (
    started.gen !== live.gen ||
    started.sheet !== live.sheet ||
    started.pose !== live.pose
  );
}

/** Idle-1 (or any viseme frame) is the rest pose for every PUP, not the 384 header. */
export function visemeRestFromFrame(
  frame: VisemeFrame | undefined,
): {
  rest: Record<string, { x: number; y: number }>;
  restLayers: Record<string, number>;
} {
  const rest: Record<string, { x: number; y: number }> = {};
  const restLayers: Record<string, number> = {};
  if (!frame) {
    return { rest, restLayers };
  }
  for (const [name, index] of Object.entries(frame.layers ?? {})) {
    restLayers[name] = index;
  }
  for (const [name, value] of Object.entries(frame.at ?? {})) {
    const center = asCenter(value);
    if (center) {
      rest[name] = center;
    }
  }
  return { rest, restLayers };
}

/** Rest viseme index. Missing Hands hide; missing Background hides (no invented room plate). */
export function idleLayerIndex(
  name: string,
  restLayers?: Record<string, number>,
): number {
  if (restLayers && Object.prototype.hasOwnProperty.call(restLayers, name)) {
    return restLayers[name]!;
  }
  // Do not invent a room plate. Outdoor Help/Dell/Cobb hide Background on
  // idle 1; indoor puppets keep index 0 in restLayers.
  if (name === "Background") {
    return -1;
  }
  return GESTURE_TABLES.has(name) ? -1 : 0;
}

/** Idle-1 extras win; sprites.json fills gaps when that fetch misses. */
export function mergePuppetRest(
  dump: {
    rest?: Record<string, unknown>;
    restLayers?: Record<string, number>;
  },
  idleFrame?: VisemeFrame,
): {
  rest: Record<string, { x: number; y: number }>;
  restLayers: Record<string, number>;
} {
  const fromIdle = visemeRestFromFrame(idleFrame);
  const rest: Record<string, { x: number; y: number }> = {};
  for (const [name, value] of Object.entries(dump.rest ?? {})) {
    const center = asCenter(value);
    if (center) {
      rest[name] = center;
    }
  }
  Object.assign(rest, fromIdle.rest);
  const restLayers: Record<string, number> = {};
  for (const [name, value] of Object.entries(dump.restLayers ?? {})) {
    const index = Number(value);
    if (Number.isFinite(index)) {
      restLayers[name] = index;
    }
  }
  Object.assign(restLayers, fromIdle.restLayers);
  return { rest, restLayers };
}

/** Viseme extras move the 384 header; missing extras keep the header. */
export function layerBlitDest(
  place: SpritePlace,
  center: unknown,
): { x: number; y: number } {
  const at = asCenter(center);
  return at ? spriteTopLeft(at.x, at.y, place.x, place.y) : place;
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

/** Hourglass for `puppetspeak`. Arrow once `puppetevent` is live. */
export function puppetUiCursor(speaking: boolean): "watch" | "arrow" {
  return speaking ? "watch" : "arrow";
}

/** Idle 1–4: blink / glance vs the spoken fidget (`idlespeak`). */
export type PuppetIdleKind = "blink" | "gesture" | "speak";

/**
 * CSV tags (`blink`, `gesture 1`, `idlespeak`) decide the kind.
 * `*` is a production prefix, not speech. Mayor’s spoken idle is
 * `idle 3`; idle 1 defaults to blink, idle 4 to speak.
 */
export function puppetIdleKind(ident: string, text = ""): PuppetIdleKind {
  const tag = text.trim().replace(/^\*+/, "").trim().toLowerCase();
  if (tag === "idlespeak" || tag === "idle speak" || /\bidle\s*speak\b/.test(tag)) {
    return "speak";
  }
  if (/\bblink/.test(tag)) {
    return "blink";
  }
  const slot = ident.trim().toLowerCase().match(/^idle\s*([1-4])$/);
  if (slot?.[1] === "1") {
    return "blink";
  }
  if (slot?.[1] === "4") {
    return "speak";
  }
  return "gesture";
}

/** Blink timer is 1/3 of the clip so blinks beat glances. Not from DF.EXE. */
export const PUPPET_IDLE_BLINK_SCALE = 1 / 3;
/** Glances wait 3× the clip so they stay rarer than blinks. Not from DF.EXE. */
export const PUPPET_IDLE_GESTURE_SCALE = 3;
/** Spoken idle WAV when the mixer has not decoded it yet (Leroy idle 4). */
export const PUPPET_IDLE_SPEAK_FALLBACK_MS = 2600;
/** After an `idlespeak` line, wait at least 4 s. Stops back-to-back replay. */
export const PUPPET_IDLE_SPEAK_MIN_TICKS = 240;

/** Dust `delay` / `puppetevent` ticks. Same 60 Hz as visemes. */
export const PUPPET_TICK_HZ = VISEME_HZ;

/**
 * Engine idle tracks on a live `puppetevent` wait. DF.EXE `0x431330`
 * looks up these four names and gives each its own timer.
 */
export const PUPPET_IDLE_CLIPS = ["idle 1", "idle 2", "idle 3", "idle 4"] as const;

/** DF.EXE `0x438210`: `timeGetTime * 3 / 50` (integer). */
export function dustTick(ms: number): number {
  return Math.floor((Math.max(0, ms) * 3) / 50);
}

export function puppetTicksToMs(ticks: number): number {
  return (Math.max(0, ticks) / PUPPET_TICK_HZ) * 1000;
}

/**
 * DF.EXE `0x40B060`: `(rand15 * duration / 0x7FFF) + 1`.
 * `duration` is that clip’s WAV length in milliseconds (mixer
 * end−start); the wait loop compares it to 60 Hz ticks.
 */
export function dustIdleInterval(duration: number, rand15: number): number {
  let r = rand15 & 0x7fff;
  if (r === 0x7fff) {
    r = 0x7ffe;
  }
  return Math.trunc((r * Math.max(0, duration)) / 0x7fff) + 1;
}

/**
 * WAV seconds → the integer `0x40B060` wants. Viseme length is playback,
 * not the wait (Leroy idle 2 is 29 ticks / 0.5 s — that dumped glances).
 */
export function puppetIdleDurationUnits(
  wavSec: number,
  _visemeTicks = 0,
  kind: PuppetIdleKind = "speak",
): number {
  let ms = 1000;
  if (wavSec > 0) {
    ms = Math.max(1, Math.round(wavSec * 1000));
  } else if (kind === "speak") {
    ms = PUPPET_IDLE_SPEAK_FALLBACK_MS;
  }
  if (kind === "blink") {
    return Math.max(1, Math.round(ms * PUPPET_IDLE_BLINK_SCALE));
  }
  if (kind === "gesture") {
    return Math.max(1, Math.round(ms * PUPPET_IDLE_GESTURE_SCALE));
  }
  return ms;
}

/**
 * Engine idle 1–4 csv text is a tag (`blink`, `idlespeak`), not a
 * subtitle. `idlefx` lines that go through `puppetspeak("mayor.10")`
 * keep their real captions.
 */
export function puppetIdleCaption(ident: string, text = ""): string {
  if (/^idle\s*[1-4]$/i.test(ident.trim())) {
    return "";
  }
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("*")) {
    return "";
  }
  const lower = trimmed.toLowerCase();
  if (lower === "idlespeak" || lower === "idle speak") {
    return "";
  }
  return text;
}

/** Watchdog only: never a 12s floor. Wait for the WAV, or a short viseme estimate. */
export function speakHangSec(duration: number, visemeTicks?: number, ident?: string): number {
  const fromWav = duration > 0 ? duration : 0;
  const fromViseme = (visemeTicks ?? 0) / VISEME_HZ;
  const floor = ident && /^idle\s*[1-4]$/i.test(ident.trim()) ? 0 : 1.5;
  return Math.max(fromWav, fromViseme, floor) + 0.15;
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
  private eventWait: ((id: number | undefined) => void) | null = null;
  private eventTimer: ReturnType<typeof setTimeout> | null = null;
  private speakTimer: ReturnType<typeof setTimeout> | null = null;
  private fidgetTimer: ReturnType<typeof setTimeout> | null = null;
  private talking = false;
  private fidgetOn = false;
  private fidgetT0 = 0;
  private viseme: VisemeLine | null = null;
  private visemeTick = -1;
  private readonly bitmaps = new Map<string, HTMLCanvasElement>();
  private readonly bitmapLoads = new Map<string, Promise<HTMLCanvasElement>>();
  private readonly flatBackdrop = new Map<string, boolean>();
  private readonly layerIndex = new Map<string, number>();
  private readonly layerAt = new Map<string, { x: number; y: number }>();
  private paintBusy = false;
  private paintAgain = false;
  /** Bumped on `open` / `close` so a late blit cannot show the previous face. */
  private paintGen = 0;
  /** Bumped when layer indices / extras change so a rest blit cannot land after idle. */
  private paintPose = 0;
  /** Speech bar on. Audio and visemes keep running when this is off. */
  private captionsOn = true;

  constructor() {
    this.root = document.createElement("div");
    this.root.id = "puppet-ui";
    this.root.hidden = true;
    this.canvas = document.createElement("canvas");
    this.canvas.id = "puppet-layers";
    const ctx = this.canvas.getContext("2d", { alpha: true });
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

  /** True for the duration of `puppetspeak`, not the whole puppet file. */
  get speaking(): boolean {
    return this.talking;
  }

  /** Silent blink/gesture. Not speech — no hourglass, bevels stay live. */
  get fidgeting(): boolean {
    return this.fidgetOn;
  }

  layout(scale: number): void {
    this.root.style.width = `${STAGE_WIDTH * scale}px`;
    this.root.style.height = `${STAGE_HEIGHT * scale}px`;
    this.root.style.setProperty("--play-scale", String(scale));
    this.canvas.style.width = `${STAGE_WIDTH * scale}px`;
    this.canvas.style.height = `${STAGE_HEIGHT * scale}px`;
    this.canvas.width = STAGE_WIDTH;
    this.canvas.height = STAGE_HEIGHT;
    this.schedulePaint();
  }

  async open(sheet: PuppetSheet): Promise<void> {
    this.sheet = sheet;
    const gen = ++this.paintGen;
    this.applyIdle();
    this.setLine("");
    this.showEmptyBevels();
    this.clearCanvas();
    // Bevels must be live before the first blit returns. A pose tick during
    // that paint used to skip `hidden = false`, so the second blackjack
    // `mainbetbj` waited on `puppetevent` with no visible choices.
    this.root.hidden = false;
    try {
      await this.paint();
    } catch {
      /* keep bevels; a failed blit must not reject openpuppet */
    }
    if (this.paintGen !== gen || this.sheet !== sheet) {
      return;
    }
  }

  close(): void {
    this.paintGen += 1;
    this.stopFidget();
    this.talking = false;
    this.viseme = null;
    this.stopAudio();
    this.setLine("");
    this.sheet = null;
    this.clearCanvas();
    this.root.hidden = true;
    this.clearBevels();
    this.finishSpeak();
    this.finishWait(-1);
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
      if (this.talking) {
        return;
      }
      voices.unlock();
      this.finishWait(choice.id);
    };
    this.choices.hidden = false;
    this.root.classList.add("choosing");
  }

  /** End the current `puppetspeak` line (click bar or Escape). */
  skipLine(): void {
    if (!this.talking) {
      return;
    }
    this.finishSpeak();
  }

  private clearEventTimer(): void {
    if (this.eventTimer !== null) {
      clearTimeout(this.eventTimer);
      this.eventTimer = null;
    }
  }

  private finishWait(id: number | undefined): void {
    this.clearEventTimer();
    const wait = this.eventWait;
    this.eventWait = null;
    wait?.(id);
  }

  /**
   * Wait for a bevel (or dismiss). `timeoutMs` resolves `undefined` so
   * the host can fire idle 1–4 / return -2 without eating a click.
   */
  waitEvent(timeoutMs?: number): Promise<number | undefined> {
    this.choices.hidden = false;
    this.root.classList.add("choosing");
    this.clearEventTimer();
    return new Promise((resolve) => {
      this.eventWait = resolve;
      if (timeoutMs !== undefined) {
        this.eventTimer = setTimeout(() => this.finishWait(undefined), Math.max(0, timeoutMs));
      }
    });
  }

  preloadVoices(urls: string[]): Promise<void> {
    return voices.preload(urls);
  }

  async speak(
    text: string,
    wavUrl: string | undefined,
    viseme: VisemeLine | undefined,
    ident?: string,
  ): Promise<void> {
    this.stopFidget();
    this.setLine(text);
    this.root.classList.add("speaking");
    this.clearSpeakTimer();
    this.viseme = viseme ?? null;
    this.visemeTick = -1;
    this.talking = true;
    const done = new Promise<void>((resolve) => {
      this.speakWait = resolve;
    });
    this.applyViseme(0);
    let duration = 0;
    if (wavUrl) {
      duration = await voices.play(wavUrl);
    }
    this.applyViseme(voices.currentTime());
    const hold = speakHangSec(duration, viseme?.ticks, ident);
    this.speakTimer = setTimeout(() => this.finishSpeak(), hold * 1000);
    await done;
    this.root.classList.remove("speaking");
    this.stopJaw();
  }

  /**
   * Blink / glance while a choice is live. Visemes only — idle 1–3 WAVs
   * are silent and must not take the speech channel. No hourglass.
   */
  async fidget(
    wavUrl: string | undefined,
    viseme: VisemeLine | undefined,
    ident?: string,
  ): Promise<void> {
    if (this.talking || this.fidgetOn) {
      return;
    }
    this.fidgetOn = true;
    this.viseme = viseme ?? null;
    this.visemeTick = -1;
    this.fidgetT0 = performance.now();
    this.applyViseme(0);
    const wavSec = wavUrl ? voices.bufferDuration(wavUrl) : 0;
    const hold = Math.max(speakHangSec(wavSec, viseme?.ticks, ident), 1);
    this.fidgetTimer = setTimeout(() => this.stopFidget(), hold * 1000);
  }

  setViseme(viseme: VisemeLine): void {
    if (!this.talking && !this.fidgetOn) {
      return;
    }
    this.viseme = viseme;
    this.visemeTick = -1;
    this.applyViseme(this.faceClock());
  }

  tick(_dt: number): void {
    if ((!this.talking && !this.fidgetOn) || !this.viseme) {
      return;
    }
    this.applyViseme(this.faceClock());
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
      this.paintPose += 1;
      this.schedulePaint();
    }
  }

  private applyIdle(): void {
    const sheet = this.sheet;
    this.layerIndex.clear();
    this.layerAt.clear();
    this.paintPose += 1;
    if (!sheet) {
      return;
    }
    for (const name of FACE_TABLES) {
      if (!sheet.layers[name]?.length) {
        continue;
      }
      this.layerIndex.set(name, idleLayerIndex(name, sheet.restLayers));
      const at = asCenter(sheet.rest?.[name]);
      if (at) {
        this.layerAt.set(name, at);
      }
    }
  }

  private stopJaw(): void {
    this.talking = false;
    this.viseme = null;
    this.applyIdle();
    this.schedulePaint();
  }

  /** One blit in flight. A newer viseme waits, then paints — never drop the load. */
  private schedulePaint(): void {
    if (this.paintBusy) {
      this.paintAgain = true;
      return;
    }
    this.paintBusy = true;
    void this.paint().finally(() => {
      this.paintBusy = false;
      if (this.paintAgain) {
        this.paintAgain = false;
        this.schedulePaint();
      }
    });
  }

  private clearCanvas(): void {
    if (this.canvas.width && this.canvas.height) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private async paint(): Promise<void> {
    const started = { gen: this.paintGen, sheet: this.sheet, pose: this.paintPose };
    const sheet = this.sheet;
    if (!sheet) {
      this.clearCanvas();
      return;
    }
    const jobs: { name: string; place: SpritePlace; url: string; img: Promise<HTMLCanvasElement> }[] =
      [];
    for (const name of FACE_TABLES) {
      const index = this.layerIndex.get(name) ?? idleLayerIndex(name, sheet.restLayers);
      const place = layerPlace(sheet, name, index);
      if (!place) {
        continue;
      }
      const url = extractUrl(`${sheet.folder}/FRAMES/${place.path}`);
      jobs.push({ name, place, url, img: this.bitmap(url) });
    }
    const loaded: { name: string; place: SpritePlace; url: string; img: HTMLCanvasElement }[] = [];
    for (const job of jobs) {
      try {
        loaded.push({ name: job.name, place: job.place, url: job.url, img: await job.img });
      } catch {
        /* missing sprite */
      }
    }
    if (
      puppetPaintIsStale(started, {
        gen: this.paintGen,
        sheet: this.sheet,
        pose: this.paintPose,
      })
    ) {
      return;
    }
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    const rest = sheet.rest ?? {};
    for (const { name, img, place, url } of loaded) {
      if (name === "Background" && this.backdropIsFlat(url, img)) {
        continue;
      }
      const dest = layerBlitDest(place, this.layerAt.get(name) ?? rest[name]);
      this.ctx.drawImage(img, dest.x, dest.y, place.w, place.h);
    }
  }

  /**
   * CloudFront PUP frames used to load via `new Image()` without CORS.
   * Firefox then throws `DOMException: The operation is insecure` on
   * getImageData — that aborted Help's paint and left a black overlay.
   */
  private backdropIsFlat(key: string, img: CanvasImageSource): boolean {
    const cached = this.flatBackdrop.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const sample = document.createElement("canvas");
    sample.width = 64;
    sample.height = 32;
    const ctx = sample.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      this.flatBackdrop.set(key, false);
      return false;
    }
    try {
      ctx.drawImage(img, 0, 0, 64, 32);
      const flat = isFlatBackdrop(ctx.getImageData(0, 0, 64, 32).data);
      this.flatBackdrop.set(key, flat);
      return flat;
    } catch {
      this.flatBackdrop.set(key, false);
      return false;
    }
  }

  private bitmap(url: string): Promise<HTMLCanvasElement> {
    const hit = this.bitmaps.get(url);
    if (hit) {
      return Promise.resolve(hit);
    }
    const pending = this.bitmapLoads.get(url);
    if (pending) {
      return pending;
    }
    const job = rasterizePng(url)
      .then(({ canvas }) => {
        this.bitmaps.set(url, canvas);
        return canvas;
      })
      .finally(() => {
        this.bitmapLoads.delete(url);
      });
    this.bitmapLoads.set(url, job);
    return job;
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

  private faceClock(): number {
    if (this.talking) {
      return voices.currentTime();
    }
    if (this.fidgetT0) {
      return Math.max(0, (performance.now() - this.fidgetT0) / 1000);
    }
    return 0;
  }

  private stopFidget(): void {
    if (this.fidgetTimer !== null) {
      clearTimeout(this.fidgetTimer);
      this.fidgetTimer = null;
    }
    const was = this.fidgetOn;
    this.fidgetOn = false;
    this.fidgetT0 = 0;
    if (was && !this.talking) {
      this.stopAudio();
      this.viseme = null;
      this.applyIdle();
      this.schedulePaint();
    }
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
