import { Color, Timer, WebGLRenderer } from "three";
import { isClockSlot, toggleDayNight, type ClockSlot } from "../core/time";
import { VM, type Point } from "../vm/runtime";
import {
  sandboxClockFromSearch,
  sandboxGraphFolder,
} from "./sandbox";
import {
  applyTransition,
  isSwipePointer,
  isTileStep,
  stillClickPixel,
  swipeWalkInput,
  transitionForInput,
  queuedWalk,
  walkInputFromCode,
  walkInputKey,
  type WalkInput,
} from "../world/set/walker";
import { neighborStillUrls, poseHqUrl, transitionStillUrls } from "../world/set/film";
import { mediaGate, type MediaPriority } from "../world/set/media";
import {
  createStillAnim,
  displayedFilmstripIndex,
  tickStillAnim,
  type StillAnim,
} from "../world/set/playback";
import {
  STILL_FRAME_SEC,
  STILL_HEIGHT,
  STILL_WIDTH,
  type SetGraph,
  type SetTransition,
  type WalkerPose,
} from "../world/set/types";
import {
  doorMatchesPose,
  doorOnPose,
  exitTownPose,
  goWorld,
  sceneNameOf,
  type DoorDef,
} from "../world/set/doors";
import {
  cameraZOf,
  frameUrl,
  framesFolder,
  hqFrame,
  loadSetGraph,
  poseLabel,
  sceneByName,
  WORLD_TOWN,
  zUrl,
  zUrlFromStill,
} from "../world/set/graph";
import { rasterizePng, StillsView } from "../world/set/stillsView";
import {
  actorSprite,
  actorStillHeight,
  CST_SCALE_FIELD,
  cameraFromPose,
  lerpViewCamera,
  filmstripT,
  SPRITE_HOTSPOT_X,
  SPRITE_HOTSPOT_Y,
  TIME_TICK_HZ,
  dustTicksToMs,
  spriteStillTopLeft,
  worldToStill,
  worldToStillFilmstrip,
  type StillHit,
  type ViewCamera,
} from "./facing";
import {
  actorBlitZ,
  exeSpriteZ,
  blitSpriteZ,
  isDoorOverlay,
  isWallOverlay,
  rangeGroundBlitZ,
  shouldBlitDoorOverlay,
  paintFarToNear,
  spriteBitsFromImageData,
  wallOverlayBlitZ,
  propStillScale,
  zPlaneFromImageData,
  liveZPlaneForStill,
  type SpriteBits,
} from "./occlude";
import { DustHost, type PropState, type WorldView } from "./host";
import { extractUrl } from "../world/set/extract";
import {
  AVATAR_SLOT,
  examineHandName,
  FlatOverlay,
  HAND_SLOT,
  hitMacRect,
  holdWhileLoading,
  hudBarCursor,
  inventorySpriteView,
  isInventoryHudView,
  MAINPANEL_BUTTONS,
  mapCrossHotspot,
  propBlitFrame,
  propViewFrame,
  stageFromClient,
  type FlatItem,
} from "./hud";
import { playStageRect, STAGE_HEIGHT, STAGE_WIDTH } from "./stage";
import { parseScriptScene } from "./sceneName";
import { PLAY_HUD_CHROME, RANGE_HUD_CHROME, PuppetUi } from "./ui";
import { boardMouseGate, idlePumpAllowed, mouseDispatchPoint, worldInputBlocked, worldMouseGate } from "./lock";
import type { PuzzleBoard, PuzzleLabel } from "./puzzle";
import {
  movieClipsStarting,
  movieFrameWaitsForClick,
  movieIndexAt,
  movieWaitSetsSkipClick,
  planMoviePasses,
} from "./movies";
import { unlockVoices, voices } from "./speech";

const CURSORS: Record<string, string> = {
  arrow: "/rsrc/cursors/arrow.cur",
  touch: "/rsrc/cursors/touch.cur",
  goleft: "/rsrc/cursors/goleft.cur",
  goright: "/rsrc/cursors/goright.cur",
  gostrait: "/rsrc/cursors/gostrait.cur",
  watch: "/rsrc/cursors/watch.cur",
  hand: "/rsrc/cursors/hand.cur",
  fist: "/rsrc/cursors/fist.cur",
  sight: "/rsrc/cursors/sight.cur",
};

const CURSOR_FALLBACK: Record<string, string> = {
  arrow: "default",
  touch: "pointer",
  goleft: "w-resize",
  goright: "e-resize",
  gostrait: "n-resize",
  watch: "wait",
  hand: "grab",
  fist: "grabbing",
  sight: "crosshair",
};

/** CURS.SIGHT hotspot is 16,15 in `cursors.json`. */
const CURSOR_HOTSPOT: Record<string, string> = {
  sight: "16 15",
};

/** GitHub Pages has no `dustdecompile/out/rsrc`; skip the 404 `.cur` fetch. */
function cursorCss(name: string): string {
  const fallback = CURSOR_FALLBACK[name] ?? "auto";
  if (import.meta.env.PROD) {
    return fallback;
  }
  const url = CURSORS[name] ?? CURSORS.arrow;
  const hot = CURSOR_HOTSPOT[name];
  return hot ? `url("${url}") ${hot}, ${fallback}` : `url("${url}"), ${fallback}`;
}

export { worldToStill } from "./facing";

/**
 * `opensetfile` often `setPose`s the pose boot already stored (O7 N).
 * Skip the still load only when that plate is already on screen — otherwise
 * the MeshBasicMaterial stays white (HUD + sprites, no town).
 */
export function skipRedundantStillShow(
  alreadyShown: boolean,
  cur: { world: string; x: number; y: number; facing: string },
  next: { world: string; x: number; y: number; facing: string },
): boolean {
  return (
    alreadyShown &&
    cur.world === next.world &&
    cur.x === next.x &&
    cur.y === next.y &&
    cur.facing === next.facing
  );
}

export type PlayKind = "story" | "sandbox";

export class PlayGame implements WorldView {
  pose: WalkerPose = { x: 6, y: 14, facing: "N" };
  world = WORLD_TOWN;
  graph!: SetGraph;

  private readonly renderer: WebGLRenderer;
  private readonly timer = new Timer();
  private readonly canvas: HTMLCanvasElement;
  private readonly timeEl: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly view: StillsView;
  private readonly ui: PuppetUi;
  readonly host: DustHost;
  readonly vm: VM;
  private readonly graphs = new Map<string, SetGraph>();
  private townPose: WalkerPose = { x: 6, y: 14, facing: "N" };
  private openDoor: DoorDef | null = null;
  private anim: StillAnim | null = null;
  private pending: SetTransition | null = null;
  private pendingTileStep = false;
  private hqGen = 0;
  private busy = false;
  /**
   * Blocking click/key script owns the VM (`walktopuppet`'s
   * `while iswalk { forceupdate }`). Locks input; world actors only
   * tick via forceupdate. Not set for SET filmstrips (`busy`).
   */
  private talking = false;
  private readonly heldKeys = new Set<string>();
  private pendingWalk: WalkInput | null = null;
  private booting = true;
  private visible = true;
  private scriptsReady = false;
  private logLine = "";
  private readonly loadEl: HTMLDivElement;
  private readonly actorLayer: HTMLDivElement;
  private readonly fadeEl: HTMLDivElement;
  private fadeOpacity = 0;
  private fadeGen = 0;
  private readonly actorCanvas: HTMLCanvasElement;
  private readonly actorCtx: CanvasRenderingContext2D;
  private readonly pick = new Uint16Array(STILL_WIDTH * STILL_HEIGHT);
  private readonly pickNames: string[] = [""];
  private readonly spriteBits = new Map<string, SpriteBits>();
  private readonly spriteLoading = new Map<string, Promise<SpriteBits | null>>();
  private readonly lastActorDraw = new Map<
    string,
    {
      bits: SpriteBits;
      place: { x: number; y: number; w: number; h: number };
      stillScale: number;
    }
  >();
  private zPlane: Uint8Array | null = null;
  private zWant = "";
  private readonly zCache = new Map<string, Uint8Array | null>();
  private readonly zLoading = new Map<string, Promise<void>>();
  private readonly stageEl: HTMLDivElement;
  private readonly hudEl: HTMLDivElement;
  private readonly hudFace: HTMLCanvasElement;
  private readonly hudFaceCtx: CanvasRenderingContext2D;
  private hudFaceSrc = "";
  private readonly captionEl: HTMLDivElement;
  private readonly movieEl: HTMLCanvasElement;
  private readonly movieCtx: CanvasRenderingContext2D;
  private readonly movieImages = new Map<string, HTMLImageElement>();
  private readonly handEl: HTMLCanvasElement;
  private readonly handCtx: CanvasRenderingContext2D;
  private handSrc = "";
  private readonly hudLabelsEl: HTMLDivElement;
  /** `stdmouse` drag started on pointerdown; ignore the leftover click. */
  private skipNextClick = false;
  private readonly kind: PlayKind;
  private lastDayClock: ClockSlot = 2;
  private hoverPoint: Point | null = null;
  private cursorPointKey = "";
  private cursorGen = 0;
  private cursorWork: Promise<void> | null = null;
  private pendingCursor: Point | null = null;
  private swipe: { id: number; x: number; y: number } | null = null;
  private readonly flats: FlatOverlay;
  private needsRender = true;
  private cursorOn = "";
  private stageScale = 1;

  constructor(kind: PlayKind = "story") {
    this.kind = kind;
    this.canvas = document.createElement("canvas");
    this.canvas.id = "play-world";
    document.body.classList.add("play");
    this.stageEl = document.createElement("div");
    this.stageEl.id = "play-stage";
    this.hudEl = document.createElement("div");
    this.hudEl.id = "play-hud";
    this.hudEl.style.backgroundImage = `url("${PLAY_HUD_CHROME}")`;
    this.hudFace = document.createElement("canvas");
    this.hudFace.id = "play-hud-face";
    this.hudFace.hidden = true;
    const faceCtx = this.hudFace.getContext("2d", { alpha: true });
    if (!faceCtx) {
      throw new Error("hud face canvas");
    }
    this.hudFaceCtx = faceCtx;
    this.actorLayer = document.createElement("div");
    this.actorLayer.id = "actor-layer";
    this.actorCanvas = document.createElement("canvas");
    this.actorCanvas.width = STILL_WIDTH;
    this.actorCanvas.height = STILL_HEIGHT;
    const actorCtx = this.actorCanvas.getContext("2d", { alpha: true });
    if (!actorCtx) {
      throw new Error("actor canvas");
    }
    this.actorCtx = actorCtx;
    this.actorCanvas.style.backgroundColor = "transparent";
    this.actorLayer.append(this.actorCanvas);
    this.captionEl = document.createElement("div");
    this.captionEl.id = "play-caption";
    this.movieEl = document.createElement("canvas");
    this.movieEl.id = "play-movie";
    this.movieEl.hidden = true;
    const movieCtx = this.movieEl.getContext("2d", { alpha: false });
    if (!movieCtx) {
      throw new Error("movie canvas");
    }
    this.movieCtx = movieCtx;
    this.movieCtx.imageSmoothingEnabled = false;
    this.handEl = document.createElement("canvas");
    this.loadEl = document.createElement("div");
    this.loadEl.id = "play-loading";
    this.loadEl.textContent = "Loading…";
    this.fadeEl = document.createElement("div");
    this.fadeEl.id = "play-fade";
    this.handEl.id = "play-hand";
    this.handEl.hidden = true;
    this.hudLabelsEl = document.createElement("div");
    this.hudLabelsEl.id = "play-hud-labels";
    const handCtx = this.handEl.getContext("2d", { alpha: true });
    if (!handCtx) {
      throw new Error("hand canvas");
    }
    this.handCtx = handCtx;
    const app = document.getElementById("app");
    this.stageEl.append(
      this.canvas,
      this.actorLayer,
      this.hudEl,
      this.hudLabelsEl,
      this.hudFace,
      this.movieEl,
      this.handEl,
      this.fadeEl,
      this.loadEl,
    );
    app?.append(this.stageEl, this.captionEl);
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(new Color(0x000000));
    const timeEl = document.getElementById("hud-time");
    const promptEl = document.getElementById("hud-prompt");
    const hintEl = document.getElementById("hud-hint");
    if (!timeEl || !promptEl || !hintEl) {
      throw new Error("HUD elements missing");
    }
    this.timeEl = timeEl;
    this.promptEl = promptEl;
    this.hintEl = hintEl;
    this.timer.connect(document);
    this.view = new StillsView();
    this.ui = new PuppetUi();
    this.flats = new FlatOverlay();
    this.flats.onSelect = (name) => void this.selectInventoryItem(name);
    this.flats.onInfo = () => void this.examineHeldItem();
    this.flats.onClose = () => {
      void this.closeHudFlat();
    };
    this.flats.onBoardDown = (x, y) => {
      this.host.stillDown = true;
      const point: Point = { kind: "point", x, y, z: 0 };
      this.host.pointer = point;
      this.hoverPoint = point;
      this.skipNextClick = true;
      if (!this.scriptsReady) {
        return;
      }
      void this.runScriptMouse(point, "board");
    };
    this.stageEl.append(this.ui.root, this.flats.root);
    this.hudEl.addEventListener("click", (event) => this.onHudClick(event));
    this.hudEl.addEventListener("mousemove", (event) => this.onHudMove(event));
    this.host = new DustHost(this.ui);
    this.host.sandbox = kind === "sandbox";
    const params = new URLSearchParams(location.search);
    this.host.skipMovies = kind === "sandbox" || !params.has("intro");
    if (kind === "sandbox") {
      const clock = sandboxClockFromSearch(location.search) ?? 2;
      this.host.sandboxClock = clock;
      this.lastDayClock = clock === 3 ? 2 : clock;
    }
    this.host.view = this;
    this.vm = new VM({
      call: (name, args, ctx) => this.host.call(name, args, ctx),
      lookup: (name, ctx) => this.host.lookup(name, ctx),
      lookupChain: (name, ctx) => this.host.lookupChain(name, ctx),
      log: (message) => this.log(message),
    });
    this.layoutStage();
    this.visible = true;

    this.canvas.addEventListener("click", (event) => void this.onClick(event));
    this.canvas.addEventListener("mousemove", (event) => this.onMove(event));
    this.stageEl.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.stageEl.addEventListener("contextmenu", (event) => {
      if (this.onRange()) {
        event.preventDefault();
      }
    });
    window.addEventListener("pointermove", (event) => this.onPointerMove(event));
    window.addEventListener("pointerup", (event) => void this.onPointerUp(event));
    window.addEventListener("pointercancel", (event) => void this.onPointerUp(event));
    window.addEventListener("pointerdown", () => unlockVoices(), { capture: true });
    this.actorLayer.addEventListener("mousemove", (event) => this.onMove(event));
    this.stageEl.addEventListener("mouseleave", () => {
      this.hoverPoint = null;
      this.applyCursor();
    });
    window.addEventListener("keydown", (event) => this.onKey(event));
    window.addEventListener("keyup", (event) => this.heldKeys.delete(event.code));
    window.addEventListener("blur", () => this.heldKeys.clear());
    window.addEventListener("resize", () => this.layoutStage());
    window.visualViewport?.addEventListener("resize", () => this.layoutStage());
    window.visualViewport?.addEventListener("scroll", () => this.layoutStage());
  }

  refreshActors(): void {
    this.layoutActors();
    this.host.paintPuzzle();
  }

  showPuzzle(board: PuzzleBoard | null): void {
    if (!board) {
      if (this.flats.board) {
        this.flats.close();
      }
      return;
    }
    // `playagame` `setvisible (false)` then BitBlts the FLT still.
    this.setWorldVisible(false);
    this.flats.showBoard(board.stillUrl, board.items, board.labels);
  }

  showHudLabels(labels: PuzzleLabel[]): void {
    this.hudLabelsEl.replaceChildren();
    for (const label of labels) {
      const el = document.createElement("div");
      el.textContent = label.text;
      el.style.left = `${(label.x / STAGE_WIDTH) * 100}%`;
      el.style.top = `${(label.y / STAGE_HEIGHT) * 100}%`;
      el.style.fontSize = `${label.size ?? 12}px`;
      this.hudLabelsEl.append(el);
    }
  }

  setWorldVisible(on: boolean): void {
    this.canvas.style.visibility = on ? "visible" : "hidden";
    this.actorLayer.style.visibility = on ? "visible" : "hidden";
  }

  viewCamera(): ViewCamera {
    const camZ = cameraZOf(this.world, this.graph);
    const strip = this.filmstrip();
    if (strip) {
      return lerpViewCamera(strip.from, strip.to, strip.t, camZ);
    }
    return cameraFromPose(this.pose, camZ);
  }

  projectWorld(obj: { x: number; y: number; z?: number; screen?: boolean }): StillHit | null {
    if (obj.screen) {
      return { x: obj.x, y: obj.y, forward: 0, lensForward: 64 };
    }
    const camZ = cameraZOf(this.world, this.graph);
    const strip = this.filmstrip();
    if (strip) {
      return worldToStillFilmstrip(obj, strip.from, strip.to, strip.t, camZ);
    }
    return worldToStill(obj, cameraFromPose(this.pose, camZ));
  }

  private filmstrip(): {
    from: { x: number; y: number; facing: string };
    to: { x: number; y: number; facing: string };
    t: number;
  } | null {
    if (!this.anim || !this.pending) {
      return null;
    }
    return {
      from: {
        x: this.pending.xFrom,
        y: this.pending.yFrom,
        facing: this.pending.dirFrom,
      },
      to: {
        x: this.pending.xTo,
        y: this.pending.yTo,
        facing: this.pending.dirTo,
      },
      t: filmstripT(displayedFilmstripIndex(this.anim), this.anim.urls.length),
    };
  }

  private layoutStage(): void {
    const view = window.visualViewport;
    const winW = view?.width ?? window.innerWidth;
    const winH = view?.height ?? window.innerHeight;
    const ox = view?.offsetLeft ?? 0;
    const oy = view?.offsetTop ?? 0;
    const rect = playStageRect(winW, winH);
    this.stageEl.style.left = `${rect.x + ox}px`;
    this.stageEl.style.top = `${rect.y + oy}px`;
    this.stageEl.style.width = `${rect.w}px`;
    this.stageEl.style.height = `${rect.h}px`;
    this.canvas.style.position = "absolute";
    this.canvas.style.left = "0";
    this.canvas.style.top = "0";
    this.canvas.style.width = `${rect.worldW}px`;
    this.canvas.style.height = `${rect.worldH}px`;
    this.actorLayer.style.width = `${rect.worldW}px`;
    this.actorLayer.style.height = `${rect.worldH}px`;
    this.renderer.setSize(rect.worldW, rect.worldH, false);
    this.view.layout(rect.worldW, rect.worldH);
    this.stageScale = rect.scale;
    this.ui.layout(rect.scale);
    this.needsRender = true;
    this.captionEl.style.top = `${rect.y + rect.h + 6}px`;
    this.captionEl.style.bottom = "auto";
    this.layoutActors();
  }

  start(): void {
    this.visible = true;
    this.stageEl.hidden = false;
    this.captionEl.hidden = false;
    document.body.classList.add("play");
    this.syncHud();
    this.layoutStage();
    requestAnimationFrame(() => this.layoutStage());
    this.renderer.setAnimationLoop(() => this.tick());
    void this.boot();
  }

  show(): void {
    this.visible = true;
    this.stageEl.hidden = false;
    this.captionEl.hidden = false;
    document.body.classList.add("play");
    this.syncHud();
    this.layoutStage();
    requestAnimationFrame(() => this.layoutStage());
    this.renderer.setAnimationLoop(() => this.tick());
  }

  hide(): void {
    this.visible = false;
    this.renderer.setAnimationLoop(null);
    this.stageEl.hidden = true;
    this.captionEl.hidden = true;
    document.body.classList.remove("play");
  }

  log(message: string): void {
    this.logLine = message;
    this.syncHud();
  }

  walk(kind: "strait" | "left" | "right"): void {
    const input: WalkInput = kind === "strait" ? "forward" : kind;
    if (this.busy) {
      this.pendingWalk = input;
      return;
    }
    this.tryMove(input);
  }

  async setPose(world: string, pose: WalkerPose): Promise<void> {
    const folder = framesFolder(world, this.isNight());
    const graph = await this.graphFor(folder, world);
    const same = skipRedundantStillShow(
      this.view.hasStill(),
      { world: this.world, x: this.pose.x, y: this.pose.y, facing: this.pose.facing },
      { world, x: pose.x, y: pose.y, facing: pose.facing },
    );
    this.world = world;
    this.graph = graph;
    this.pose = pose;
    this.host.currentScene = this.host.sceneNameForPose(graph, pose.x, pose.y);
    this.host.currentDir = pose.facing;
    if (same) {
      return;
    }
    await this.showHold();
    this.preloadNeighbors();
    this.host.noticeCamera();
  }

  /** Dust `screentoblack` — 30 ticks is 0.5 s at 60 Hz. */
  async fadeToBlack(ticks: number): Promise<void> {
    await this.animateFade(1, ticks);
  }

  /** Dust `blacktoscreen` after the new SET still is up. */
  async fadeFromBlack(ticks: number): Promise<void> {
    await this.animateFade(0, ticks);
  }

  cutToBlack(): void {
    this.fadeGen += 1;
    this.fadeOpacity = 1;
    this.fadeEl.style.opacity = "1";
  }

  private async animateFade(target: number, ticks: number): Promise<void> {
    const gen = ++this.fadeGen;
    const ms = dustTicksToMs(ticks);
    const from = this.fadeOpacity;
    if (ms <= 0 || from === target) {
      this.fadeOpacity = target;
      this.fadeEl.style.opacity = String(target);
      return;
    }
    const t0 = performance.now();
    const stepMs = 1000 / TIME_TICK_HZ;
    for (;;) {
      if (gen !== this.fadeGen) {
        return;
      }
      const u = Math.min(1, (performance.now() - t0) / ms);
      const value = from + (target - from) * u;
      this.fadeOpacity = value;
      this.fadeEl.style.opacity = String(value);
      if (u >= 1) {
        this.fadeOpacity = target;
        this.fadeEl.style.opacity = String(target);
        return;
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, stepMs);
      });
    }
  }

  async playMovie(
    frames: { url: string; holdSec: number; action?: number; wait?: boolean }[],
    clips: { url: string; startSec: number; channel?: string }[],
  ): Promise<void> {
    if (!frames.length) {
      return;
    }
    this.busy = true;
    const playable: { url: string; holdSec: number; action?: number; wait?: boolean }[] = [];
    this.movieImages.clear();
    for (const frame of frames) {
      try {
        const img = await preloadMovieImage(frame.url);
        this.movieImages.set(frame.url, img);
        playable.push(frame);
      } catch {
        /* missing still */
      }
    }
    if (!playable.length) {
      this.busy = false;
      return;
    }
    const holds = playable.map((frame) => frame.holdSec);
    const clipUrls = clips.map((clip) => clip.url);
    await voices.preload(clipUrls);
    const timed = clips.map((clip) => ({
      url: clip.url,
      startSec: clip.startSec,
      channel: clip.channel,
      durationSec: voices.bufferDuration(clip.url),
    }));
    this.movieEl.hidden = false;
    try {
      if (playable.some((frame) => movieFrameWaitsForClick(frame.action, frame.wait))) {
        await this.playActionMovie(playable, clips);
      } else {
        const passes = planMoviePasses(holds, timed);
        for (const pass of passes) {
          await this.playMoviePass(
            playable,
            pass.holdSec,
            pass.clips.map((clip) => ({
              url: clip.url ?? "",
              startSec: clip.startSec,
              channel: clip.channel,
            })),
            pass.passSec,
          );
        }
      }
    } finally {
      this.movieEl.hidden = true;
      this.movieImages.clear();
      this.busy = false;
      this.needsRender = true;
    }
  }

  /**
   * Inspect stills wait for a click (`timeline.wait`, type-2 slot 0 last 2).
   * Then the reel continues — warning fades out; dog1 never hits this path.
   */
  private async playActionMovie(
    frames: { url: string; holdSec: number; action?: number; wait?: boolean }[],
    clips: { url: string; startSec: number; channel?: string }[],
  ): Promise<void> {
    const starts = clips.map((clip) => clip.startSec);
    let t = 0;
    for (const frame of frames) {
      this.blitMovieFrame(frame.url);
      const hold = Math.max(0, frame.holdSec);
      for (const index of movieClipsStarting(starts, t - 1e-6, t + hold)) {
        const url = clips[index]?.url;
        if (url) {
          void voices.playFx(url, 0.85, false, clips[index]?.channel);
        }
      }
      if (hold > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, hold * 1000);
        });
      }
      t += hold;
      if (movieFrameWaitsForClick(frame.action, frame.wait)) {
        await this.waitMovieClick();
      }
    }
  }

  /** Last inspect still stays up until a click. Swallow that click. */
  private waitMovieClick(): Promise<void> {
    return new Promise((resolve) => {
      const finish = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        window.removeEventListener("pointerdown", finish, true);
        // preventDefault on pointerdown suppresses the synthetic click.
        // skipNextClick would eat the next real EXAMINE / world press.
        this.skipNextClick = movieWaitSetsSkipClick(event.type);
        resolve();
      };
      window.addEventListener("pointerdown", finish, true);
    });
  }

  private blitMovieFrame(url: string): void {
    const img = this.movieImages.get(url);
    if (!img) {
      return;
    }
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (this.movieEl.width !== w || this.movieEl.height !== h) {
      this.movieEl.width = w;
      this.movieEl.height = h;
      this.movieCtx.imageSmoothingEnabled = false;
    }
    this.movieCtx.drawImage(img, 0, 0);
  }

  private playMoviePass(
    frames: { url: string }[],
    holds: number[],
    clips: { url: string; startSec: number; channel?: string }[],
    passSec: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const timers: number[] = [];
      let shown = -1;
      const show = (nowSec: number): void => {
        const index = movieIndexAt(holds, nowSec);
        if (index === shown) {
          return;
        }
        shown = index;
        const url = frames[index]?.url;
        if (url) {
          this.blitMovieFrame(url);
        }
      };
      show(0);
      for (const clip of clips) {
        const delay = Math.max(0, clip.startSec * 1000);
        timers.push(
          window.setTimeout(() => {
            void voices.playFx(clip.url, 0.85, false, clip.channel);
          }, delay),
        );
      }
      const t0 = performance.now();
      const totalMs = Math.max(0, passSec) * 1000;
      const finish = (): void => {
        for (const id of timers) {
          window.clearTimeout(id);
        }
        resolve();
      };
      if (totalMs <= 0) {
        finish();
        return;
      }
      const step = (): void => {
        const now = performance.now() - t0;
        if (now >= totalMs) {
          show(Math.max(0, passSec - 1e-4));
          finish();
          return;
        }
        show(now / 1000);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  private async boot(): Promise<void> {
    try {
      this.host.prefetchTalk();
      const spawnClock = this.host.sandbox ? (this.host.sandboxClock ?? 2) : 3;
      const spawnFolder = sandboxGraphFolder(spawnClock);
      this.graph = await loadSetGraph(spawnFolder);
      this.graphs.set(spawnFolder, this.graph);
      this.world = WORLD_TOWN;
      this.pose = { x: 6, y: 14, facing: "N" };
      this.townPose = { ...this.pose };
      this.host.currentSet = "town";
      this.host.currentSetFile = spawnClock === 3 ? "nite.set" : "town.set";
      this.host.currentScene = "scene g15";
      this.host.currentDir = "N";
      void this.showHold().catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.loadEl.hidden = false;
        this.loadEl.textContent = message;
      });
      this.syncHud();
      this.host.skipBootBlack = this.host.skipMovies;
      await this.host.installLibrary(this.vm);
      const boot = this.host.index.lookup(["boot"], "boot");
      if (boot) {
        await this.vm.inObject("boot", "", () => this.vm.runProc(boot));
      }
      this.scriptsReady = true;
      this.layoutActors();
      await this.host.ensureHudPortrait(this.vm);
      this.booting = false;
      this.loadEl.hidden = true;
      this.preloadNeighbors();
      await this.host.onArrive(this.vm);
      this.syncHud();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logLine = message;
      this.booting = false;
      this.loadEl.hidden = false;
      this.loadEl.textContent = message;
      this.syncHud();
    } finally {
      this.host.skipBootBlack = false;
    }
  }

  private isNight(): boolean {
    return numGlobal(this.vm, "clock") === 3;
  }

  private async graphFor(folder: string, world: string): Promise<SetGraph> {
    const cached = this.graphs.get(folder);
    if (cached) {
      return cached;
    }
    const graph = await loadSetGraph(folder);
    this.graphs.set(folder, graph);
    void world;
    return graph;
  }

  private tick(): void {
    if (!this.visible) {
      return;
    }
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    // Boot owns the VM (`boot` / `advanceday`). Do not drain `makeface`
    // or runQueued on the same VM until that returns.
    const scriptsLive = !this.booting && this.scriptsReady;
    if (
      scriptsLive &&
      !this.talking &&
      this.host.scriptPump === 0 &&
      !this.host.scriptBusy
    ) {
      this.host.advanceActors(dt);
    }
    if (scriptsLive) {
      this.host.tickScriptClock(dt);
      // Click/key owns the VM (`talking`). Idle `makeloop` (`resetgame`)
      // owns it via `scriptBusy`. Tick must not start a second runQueued
      // during `forceupdate` (scriptPump > 0 used to sneak past the host
      // guard) — that ate the second blackjack card on hand two.
      if (idlePumpAllowed(this.talking, this.host.scriptBusy)) {
        void this.host.runQueued(this.vm);
      }
    }
    if (this.anim) {
      this.driveAnim(this.anim, dt);
      this.needsRender = true;
    }
    // Project after the still advances so sprites ride the same plate.
    this.layoutActors();
    this.applyCursor();
    this.ui.tick(dt);
    if (this.needsRender) {
      this.renderer.render(this.view.scene, this.view.camera);
      if (!this.anim) {
        this.needsRender = false;
      }
    }
  }

  private onMove(event: MouseEvent): void {
    this.hoverPoint = this.stageFromPointer(event);
    this.applyCursor();
  }

  private inputBlocked(): boolean {
    return worldInputBlocked({
      booting: this.booting,
      busy: this.busy,
      talking: this.talking || this.host.scriptBusy,
      flatsOpen: this.flats.open,
    });
  }

  private applyCursor(): void {
    // Inspect movie: arrow (click to dismiss). Speech: watch until the
    // line ends — bevels stay visible but are not live. After that the
    // talking-head is arrow so choices can highlight. `walktopuppet`
    // still uses watch via `cursor ("watch")` / talking.
    if (!this.movieEl.hidden) {
      this.setCursor("arrow");
      return;
    }
    if (this.ui.speaking) {
      this.setCursor("watch");
      return;
    }
    if (this.host.currentPuppet !== "none" || this.flats.open) {
      this.setCursor("arrow");
      return;
    }
    const point = this.hoverPoint;
    // Range EXIT sits on the HUD. Do not let idle `scriptBusy` / sight
    // steal the pointer — that flickered touch/arrow on the plaque.
    if (point && point.y >= 264) {
      this.setCursor(
        hudBarCursor(
          this.onRange(),
          this.host.hitHudButton(point.x, point.y),
          this.hitsHeldAt(point),
          hitMacRect(MAINPANEL_BUTTONS, point.x, point.y)?.name,
        ),
      );
      return;
    }
    if (this.talking || this.host.scriptBusy) {
      const named = this.host.cursorName;
      this.setCursor(named && CURSORS[named] ? named : "watch");
      return;
    }
    if (!point) {
      this.setCursor("arrow");
      return;
    }
    if (!this.scriptsReady) {
      this.setCursor("arrow");
      return;
    }
    this.queueCursor(point);
    const named = this.host.cursorName;
    this.setCursor(named && CURSORS[named] ? named : "arrow");
  }

  /**
   * Boot idle path: hittest + object's `setcursor`. Scene G14
   * `pointinrules` / `pointinfire` set `touch` (the warning sign).
   */
  private queueCursor(point: Point): void {
    this.pendingCursor = point;
    if (!this.cursorWork) {
      this.flushCursor();
    }
  }

  private flushCursor(): void {
    const point = this.pendingCursor;
    if (!point || this.talking || this.host.scriptBusy || !this.scriptsReady) {
      this.pendingCursor = null;
      return;
    }
    const key = `${this.host.currentScene}:${this.host.currentDir}:${Math.round(point.x)},${Math.round(point.y)}`;
    if (key === this.cursorPointKey) {
      this.pendingCursor = null;
      return;
    }
    this.pendingCursor = null;
    this.cursorPointKey = key;
    const gen = ++this.cursorGen;
    this.cursorWork = this.host
      .dispatchCursor(this.vm, point)
      .then(() => {
        if (gen !== this.cursorGen) {
          return;
        }
        if (this.host.currentPuppet !== "none" || this.flats.open) {
          return;
        }
        if (this.talking || this.host.scriptBusy) {
          return;
        }
        if (!this.hoverPoint || this.hoverPoint.y >= 264) {
          return;
        }
        const named = this.host.cursorName;
        this.setCursor(named && CURSORS[named] ? named : "arrow");
      })
      .finally(() => {
        this.cursorWork = null;
        if (this.pendingCursor) {
          this.flushCursor();
        }
      });
  }

  private setCursor(name: string): void {
    if (this.cursorOn === name) {
      return;
    }
    this.cursorOn = name;
    const value = cursorCss(name);
    this.canvas.style.cursor = value;
    this.actorLayer.style.cursor = value;
    this.stageEl.style.cursor = value;
    this.hudEl.style.cursor = value;
  }

  private onHudMove(event: MouseEvent): void {
    this.hoverPoint = this.stageFromPointer(event);
    this.applyCursor();
  }

  private onHudClick(event: MouseEvent): void {
    event.stopPropagation();
    this.host.resumeBed();
    if (this.skipNextClick) {
      this.skipNextClick = false;
      return;
    }
    if (this.inputBlocked() || this.host.currentPuppet !== "none") {
      return;
    }
    // Range EXIT is `pointerdown` + `stilldown`. Town map/portrait still
    // use `click` (HUD-band pointerdown returns without skipNextClick).
    if (this.onRange()) {
      return;
    }
    const point = this.stageFromPointer(event);
    if (!point) {
      return;
    }
    if (this.hitsHeldAt(point)) {
      return;
    }
    const hit = hitMacRect(MAINPANEL_BUTTONS, point.x, point.y);
    if (hit) {
      void this.openHudFlat(hit.name);
      return;
    }
    if (this.scriptsReady) {
      this.talking = true;
      void this.host
        .dispatchMouse(this.vm, point)
        .then(() => this.syncHud())
        .finally(() => {
          this.talking = false;
        });
    }
  }

  private async openHudFlat(name: string): Promise<void> {
    const cash = numGlobal(this.vm, "playercash");
    if (name === "map") {
      this.host.currentFlatName = "map";
      this.flats.show("map", cash, this.mapCrossIcon());
      return;
    }
    if (name === "horn") {
      this.flats.show("score", cash);
      return;
    }
    if (name === "self") {
      this.host.currentFlatName = "avatar";
      this.flats.show("avatar", cash, []);
      const items = await this.inventoryIcons();
      if (this.flats.open) {
        this.flats.setItems(items);
      }
    }
  }

  /** Overlay dismiss: back on mainpanel so `noface` can run again. */
  private async closeHudFlat(): Promise<void> {
    this.host.currentFlatName = "mainpanel";
    if (this.scriptsReady) {
      await this.host.call("gotoflat", ["mainpanel"], this.vm);
    }
    this.restoreHandSlot();
    this.syncHud();
  }

  /**
   * NEW.FLT map `cross`. Town uses `currentscene`; interiors use
   * `townscene` (the street cell `gotointerior` saved).
   */
  private mapCrossIcon(): FlatItem[] {
    const scene =
      this.host.currentSet === "town"
        ? this.host.currentScene
        : String(this.vm.globals.get("townscene") ?? "");
    const pose = parseScriptScene(scene);
    if (!pose) {
      return [];
    }
    const at = mapCrossHotspot(pose.x, pose.y);
    const prop = this.host.props.get("cross");
    const raw = prop?.sprites.base?.[0];
    const place = raw ?? {
      path: "FRAMES/cross/base/00_c553.png",
      x: 253,
      y: 188,
      w: 7,
      h: 7,
    };
    const root = prop?.spriteRoot || "PRP/_HOUSE";
    return [
      {
        name: "cross",
        url: extractUrl(`${root}/${place.path}`),
        x: at.x + place.x - SPRITE_HOTSPOT_X,
        y: at.y + place.y - SPRITE_HOTSPOT_Y,
        w: place.w,
        h: place.h,
      },
    ];
  }

  private ownedInventory(): PropState[] {
    return [...this.host.props.values()].filter(
      (prop) => prop.shop === "inven" && prop.owner === "stranger" && prop.name !== "helpbut",
    );
  }

  private async inventoryIcons(): Promise<FlatItem[]> {
    const items: FlatItem[] = [];
    const hand = String(this.vm.globals.get("handitem") ?? "");
    for (const prop of this.ownedInventory()) {
      if (this.scriptsReady) {
        await this.vm.inObject("prop", prop.name, () => this.vm.evalCall("moveyoself", []));
      }
      prop.view = inventorySpriteView(prop.name, hand);
      const raw = (prop.sprites[prop.view] ?? prop.sprites.panel ?? prop.sprites.large)?.[0];
      if (!raw) {
        continue;
      }
      const url = extractUrl(`${prop.spriteRoot}/${raw.path}`);
      const bits = this.spriteBits.get(url) ?? (await this.loadSpriteBits(url));
      if (!bits) {
        continue;
      }
      const place = sizedPlace(raw, bits.w, bits.h);
      items.push({
        name: prop.name,
        url,
        x: prop.x + place.x - SPRITE_HOTSPOT_X,
        y: prop.y + place.y - SPRITE_HOTSPOT_Y,
        w: place.w,
        h: place.h,
      });
    }
    return items;
  }

  /** INVEN `stdmouse`: panel/hilite click sets `handitem` and the hilite sprite. */
  private async selectInventoryItem(name: string): Promise<void> {
    if (!name || !this.scriptsReady || this.busy) {
      return;
    }
    await this.vm.inObject("prop", name, () => this.vm.evalCall("mousedown", []));
    this.flats.setItems(await this.inventoryIcons());
    this.syncHud();
  }

  /** Avatar EXAMINE: `infoyoself` → `invenmovie` / `playmovie`. */
  private async examineHeldItem(): Promise<void> {
    const owned = this.ownedInventory().map((prop) => prop.name);
    const hand = examineHandName(String(this.vm.globals.get("handitem") ?? ""), owned);
    if (!hand || !this.scriptsReady || this.busy) {
      return;
    }
    this.talking = true;
    try {
      await this.vm.inObject("prop", hand, () => this.vm.evalCall("infoyoself", []));
    } finally {
      this.talking = false;
    }
  }

  private stageFromPointer(event: { clientX: number; clientY: number }): Point | null {
    const at = stageFromClient(event.clientX, event.clientY, this.stageEl.getBoundingClientRect());
    if (!at) {
      return null;
    }
    return { kind: "point", x: at.x, y: at.y, z: 0 };
  }

  private onRange(): boolean {
    return this.host.currentSet === "target";
  }

  private hitsHeldAt(point: Point): boolean {
    if (this.onRange()) {
      return false;
    }
    const hand = String(this.vm.globals.get("handitem") ?? "");
    return this.host.hitsHeldItem(point, hand);
  }

  /**
   * Dust `mousedown` is the press, not mouseup. INVEN `stdmouse` and
   * FLT hit/stay loop `while stilldown`; a `click` is too late. World
   * doors / the blackjack table used `click` and lost the first press
   * whenever idle `runQueued` held `scriptBusy`.
   */
  private onPointerDown(event: PointerEvent): void {
    if (!this.visible) {
      return;
    }
    if (event.button === 2 && this.onRange()) {
      event.preventDefault();
      const point = this.stageFromPointer(event);
      if (point) {
        this.host.pointer = point;
        this.hoverPoint = point;
      }
      if (this.booting || this.busy || !this.scriptsReady || this.inputBlocked()) {
        return;
      }
      this.talking = true;
      void this.host
        .dispatchGunhandClick(this.vm, point ?? undefined)
        .then(() => this.syncHud())
        .finally(() => {
          this.talking = false;
        });
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const point = this.stageFromPointer(event);
    if (point) {
      this.host.pointer = point;
      this.hoverPoint = point;
    }
    this.host.stillDown = true;
    if (!point || this.booting || this.busy || !this.scriptsReady) {
      return;
    }
    if (this.hitsHeldAt(point)) {
      if (this.inputBlocked()) {
        return;
      }
      event.preventDefault();
      this.skipNextClick = true;
      this.talking = true;
      void this.host
        .dispatchMouse(this.vm, point)
        .then(() => this.syncHud())
        .finally(() => {
          this.talking = false;
          this.restoreHandSlot();
          this.layoutHand();
        });
      return;
    }
    if (isSwipePointer(event.pointerType) && point.y < 264) {
      this.swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
      return;
    }
    if (point.y >= 264) {
      if (this.onRange() && !this.flats.open && !this.inputBlocked()) {
        this.skipNextClick = true;
        void this.runScriptMouse(point, "world");
      }
      return;
    }
    if (this.flats.open) {
      return;
    }
    this.skipNextClick = true;
    void this.runScriptMouse(point, "world");
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.visible) {
      return;
    }
    const point = this.stageFromPointer(event);
    if (point) {
      this.host.pointer = point;
      this.hoverPoint = point;
    }
  }

  private async onPointerUp(event: PointerEvent): Promise<void> {
    this.host.stillDown = false;
    const swipe = this.swipe;
    this.swipe = null;
    if (!swipe || event.type === "pointercancel" || event.pointerId !== swipe.id) {
      return;
    }
    const input = swipeWalkInput(event.clientX - swipe.x, event.clientY - swipe.y);
    if (!input || !this.scriptsReady) {
      return;
    }
    this.skipNextClick = true;
    if (this.busy && !this.talking) {
      this.pendingWalk = input;
      return;
    }
    if (this.inputBlocked()) {
      return;
    }
    this.talking = true;
    try {
      await this.host.dispatchKey(this.vm, walkInputKey(input));
    } finally {
      this.talking = false;
    }
  }

  private async onClick(event: MouseEvent): Promise<void> {
    if (!this.visible) {
      return;
    }
    unlockVoices();
    this.host.resumeBed();
    if (this.skipNextClick) {
      this.skipNextClick = false;
      return;
    }
    if (this.booting || this.busy || this.flats.open) {
      return;
    }
    const pixel = this.clickPixel(event);
    if (!pixel) {
      return;
    }
    if (!this.scriptsReady) {
      this.log("Loading scripts…");
      return;
    }
    const point: Point = { kind: "point", x: pixel.x, y: pixel.y, z: 0 };
    await this.runScriptMouse(point, "world");
  }

  /**
   * Claim the VM, cancel in-flight `setcursor`, and wait out idle
   * `runQueued` instead of dropping the press.
   */
  private async runScriptMouse(point: Point, kind: "world" | "board"): Promise<void> {
    const gate =
      kind === "board"
        ? boardMouseGate({
            talking: this.talking,
            scriptBusy: this.host.scriptBusy,
            puppetOpen: this.host.currentPuppet !== "none",
          })
        : worldMouseGate({
            booting: this.booting,
            busy: this.busy,
            talking: this.talking,
            flatsOpen: this.flats.open,
            scriptBusy: this.host.scriptBusy,
            puppetOpen: this.host.currentPuppet !== "none",
            cursorWatch: this.host.cursorName === "watch",
          });
    if (gate === "ignore") {
      return;
    }
    this.talking = true;
    this.cursorGen += 1;
    this.pendingCursor = null;
    try {
      if (this.cursorWork) {
        await this.cursorWork;
      }
      if (gate === "wait") {
        await this.waitForScriptIdle();
      }
      if (this.host.currentPuppet !== "none") {
        return;
      }
      const at = mouseDispatchPoint(kind, point, this.hoverPoint);
      this.host.pointer = at;
      await this.host.dispatchMouse(this.vm, at);
      if (kind === "board") {
        this.host.paintPuzzle();
      }
      this.syncHud();
    } finally {
      this.talking = false;
    }
  }

  /** Idle `makeloop` / `resetgame` owns the VM until `runQueued` returns. */
  private async waitForScriptIdle(): Promise<void> {
    for (let n = 0; n < 600 && this.host.scriptBusy; n += 1) {
      if (this.host.currentPuppet !== "none") {
        return;
      }
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 16);
        }
      });
    }
  }

  private clickPixel(event: MouseEvent): { x: number; y: number } | null {
    const norm = this.stillNorm(event);
    if (!norm) {
      return null;
    }
    return stillClickPixel(norm.nx, norm.ny, STILL_WIDTH, STILL_HEIGHT);
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.visible) {
      return;
    }
    this.host.resumeBed();
    if (event.altKey || event.ctrlKey || event.metaKey || this.booting) {
      return;
    }
    if (event.code === "KeyC" && !event.repeat) {
      this.ui.toggleCaptions();
      event.preventDefault();
      return;
    }
    if (this.host.sandbox && event.code === "KeyN" && !event.repeat) {
      event.preventDefault();
      if (this.talking || this.inputBlocked() || !this.scriptsReady) {
        return;
      }
      const clock = numGlobal(this.vm, "clock");
      const slot = isClockSlot(clock) ? clock : 2;
      const next = toggleDayNight(slot, this.lastDayClock);
      this.lastDayClock = next.lastDayClock;
      this.talking = true;
      void this.host
        .applySandboxClock(this.vm, next.clock)
        .then(() => {
          this.hqGen += 1;
          return this.showHold();
        })
        .finally(() => {
          this.talking = false;
          this.syncHud();
        });
      return;
    }
    if (event.code === "Escape" && !event.repeat) {
      if (this.flats.open && !this.flats.board) {
        this.flats.close();
        event.preventDefault();
        return;
      }
      if (this.ui.speaking) {
        this.host.skipRemainingSpeech();
        event.preventDefault();
        return;
      }
    }
    this.heldKeys.add(event.code);
    if (this.flats.open) {
      return;
    }
    const arg = keyToScriptArg(event.code);
    if (!arg) {
      return;
    }
    event.preventDefault();
    if (this.busy && !this.talking && this.scriptsReady) {
      const input = walkInputFromCode(event.code);
      if (input) {
        this.pendingWalk = input;
      }
      return;
    }
    if (this.inputBlocked() || !this.scriptsReady) {
      return;
    }
    this.dispatchWalkKey(arg, event.repeat);
  }

  private dispatchWalkKey(arg: string, repeat = false): void {
    this.talking = true;
    void this.host.dispatchKey(this.vm, arg, repeat).finally(() => {
      this.talking = false;
    });
  }

  private tryMove(input: WalkInput): void {
    if (this.busy || !this.graph) {
      if (this.busy) {
        this.pendingWalk = input;
      }
      return;
    }
    this.pendingWalk = null;
    this.hqGen += 1;
    if (input === "forward") {
      const door = doorOnPose(
        this.world,
        sceneNameOf(this.graph, this.pose.x, this.pose.y),
        this.pose.facing,
      );
      if (door?.autoWalk) {
        this.openDoor = door;
        void this.enterDoor();
        return;
      }
      if (this.openDoor && doorMatchesPose(
        this.openDoor,
        this.world,
        sceneNameOf(this.graph, this.pose.x, this.pose.y),
        this.pose.facing,
      )) {
        void this.enterDoor();
        return;
      }
    }
    const tr = transitionForInput(this.graph, this.pose, input);
    if (!tr) {
      return;
    }
    this.view.hideOverlay();
    this.playTransition(tr);
  }

  private playTransition(tr: SetTransition): void {
    const dest = applyTransition(tr);
    this.pendingTileStep = isTileStep(this.pose, dest);
    this.busy = true;
    this.pending = tr;
    const destScene = this.host.sceneNameForPose(this.graph, dest.x, dest.y);
    void (async () => {
      await this.host.closeDoorIfLeftOpening(this.vm, destScene, dest.facing);
      if (this.pendingTileStep) {
        await this.host.onLeave(this.vm);
      }
      if (this.pending === tr) {
        this.startStillStrip(tr, dest);
      }
    })();
  }

  private startStillStrip(tr: SetTransition, dest: WalkerPose): void {
    const folder = this.stillsFolder();
    const motion = transitionStillUrls(tr, folder);
    const destHq = poseHqUrl(this.graph, dest, folder);
    const urls = destHq ? [...motion, destHq] : motion;
    const nextMoves = neighborStillUrls(this.graph, dest, folder, 1);
    this.view.retain([...urls, ...nextMoves]);
    this.view.preload(urls, "high");
    this.view.preload(nextMoves, "high");
    const anim = createStillAnim(urls);
    this.anim = anim;
    if (this.view.showCached(urls[0])) {
      anim.ready = true;
    } else {
      void this.view.show(urls[0]).then(() => {
        if (this.anim === anim) {
          anim.ready = true;
          anim.elapsed = 0;
        }
      });
    }
    this.timer.reset();
    this.needsRender = true;
    this.preloadZ(urls, "high");
    this.preloadZ(nextMoves, "low");
    this.trimZCache([...urls, ...nextMoves]);
    this.bindZ(zUrlFromStill(urls[0]));
  }

  private driveAnim(anim: StillAnim, dt: number): void {
    const url = anim.urls[anim.index];
    if (!this.view.cached(url)) {
      void this.view.show(url);
      return;
    }
    if (!anim.ready) {
      this.view.showCached(url);
      anim.ready = true;
      anim.elapsed = 0;
      return;
    }
    const step = tickStillAnim(anim, dt, STILL_FRAME_SEC);
    if (step.frameChanged) {
      const next = anim.urls[anim.index];
      this.bindZ(zUrlFromStill(next));
      if (!this.view.showCached(next)) {
        anim.ready = false;
        void this.view.show(next).then(() => {
          if (this.anim === anim) {
            anim.ready = true;
          }
        });
      }
    }
    if (step.done) {
      this.finishMove();
    }
  }

  private finishMove(): void {
    const tr = this.pending;
    const tileStep = this.pendingTileStep;
    this.anim = null;
    this.pending = null;
    this.pendingTileStep = false;
    this.busy = false;
    if (tr) {
      this.pose = applyTransition(tr);
      this.host.currentScene = this.host.sceneNameForPose(this.graph, this.pose.x, this.pose.y);
      this.host.currentDir = this.pose.facing;
    }
    this.host.noticeCamera();
    // Dest HQ is the last plate of the strip (already on screen when
    // preloaded). Do not layout dest sprites before that still is up —
    // that was the end-of-move teleport.
    const gen = this.hqGen;
    void this.afterStillMove(tileStep, gen);
  }

  private async afterStillMove(tileStep: boolean, gen: number): Promise<void> {
    await this.showHold();
    if (tileStep) {
      await this.host.onArrive(this.vm);
    }
    if (this.hqGen !== gen) {
      return;
    }
    this.preloadNeighbors();
    this.continueWalk();
  }

  private continueWalk(): void {
    if (this.inputBlocked()) {
      return;
    }
    const next = queuedWalk(this.pendingWalk, this.heldKeys);
    this.pendingWalk = null;
    if (!next) {
      return;
    }
    this.dispatchWalkKey(walkInputKey(next.input), next.repeat);
  }

  private preloadNeighbors(): void {
    if (!this.graph) {
      return;
    }
    const urls = neighborStillUrls(this.graph, this.pose, this.stillsFolder(), 2);
    this.view.preload(urls, "low");
    this.preloadZ(urls, "low");
  }

  private async showHold(): Promise<void> {
    if (!this.graph) {
      return;
    }
    const gen = this.hqGen;
    const frame = hqFrame(this.graph, this.pose);
    if (!frame) {
      this.promptEl.textContent = "No still";
      return;
    }
    const folder = this.stillsFolder();
    const still = frameUrl(folder, frame.frame0, frame.offset);
    const z = zUrl(folder, frame.frame0, frame.offset);
    this.bindZ(z);
    await Promise.all([this.view.show(still), this.ensureZ(z, "high")]);
    if (gen !== this.hqGen) {
      return;
    }
    this.needsRender = true;
    this.layoutActors();
    this.syncHud();
  }

  private stillsFolder(): string {
    const file = this.host.currentSetFile;
    if (file === "nite.set") {
      return "_NITE";
    }
    if (file === "town.set") {
      return "_TOWN";
    }
    return framesFolder(this.world, this.isNight());
  }

  private stillNorm(event: MouseEvent): { nx: number; ny: number } | null {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return null;
    }
    return {
      nx: (event.clientX - bounds.left) / bounds.width,
      ny: (event.clientY - bounds.top) / bounds.height,
    };
  }

  private async enterDoor(): Promise<void> {
    const door = this.openDoor;
    if (!door) {
      return;
    }
    this.busy = true;
    this.view.hideOverlay();
    try {
      if (door.go.kind === "town") {
        const folder = this.isNight() ? "_NITE" : "_TOWN";
        const graph = await this.graphFor(folder, WORLD_TOWN);
        this.world = WORLD_TOWN;
        this.graph = graph;
        this.pose = exitTownPose(this.townPose);
      } else {
        const world = goWorld(door.go, this.isNight());
        if (!world) {
          return;
        }
        const folder = framesFolder(world, this.isNight());
        const graph = await this.graphFor(folder, world);
        const dest = sceneByName(graph, door.go.scene);
        if (dest) {
          if (this.world === WORLD_TOWN) {
            this.townPose = this.pose;
          }
          this.world = world;
          this.graph = graph;
          this.pose = { x: dest.x, y: dest.y, facing: door.go.facing };
        }
      }
      this.openDoor = null;
      this.host.currentSet = this.world;
      this.host.currentScene = this.host.sceneNameForPose(this.graph, this.pose.x, this.pose.y);
      await this.showHold();
      this.preloadNeighbors();
    } finally {
      this.busy = false;
    }
  }

  private layoutActors(): void {
    if (this.host.currentPuppet !== "none") {
      this.actorLayer.hidden = true;
      this.handEl.hidden = true;
      this.hudFace.hidden = true;
      return;
    }
    this.actorLayer.hidden = false;
    const frame = this.actorCtx.createImageData(STILL_WIDTH, STILL_HEIGHT);
    this.pick.fill(0);
    this.pickNames.length = 1;
    const cam = this.viewCamera();
    const camZ = cam.z ?? cameraZOf(this.world, this.graph);
    const zPlane = this.liveZPlane();
    const seen = new Set<string>();
    const draws: {
      forward: number;
      name: string;
      bits: SpriteBits;
      topLeft: { x: number; y: number };
      stillScale: number;
      z: number;
    }[] = [];
    for (const actor of this.host.nearbyActors()) {
      const still = this.projectWorld(actor);
      if (!still) {
        continue;
      }
      const place = actorSprite(actor, cam);
      if (!place || place.h <= 0) {
        continue;
      }
      const url = this.host.spriteUrl(actor, place);
      this.warmActorPlates(actor);
      const bits = this.spriteBits.get(url);
      const last = this.lastActorDraw.get(actor.name);
      if (!bits) {
        void this.loadSpriteBits(url, "high");
        if (!holdWhileLoading(false, Boolean(last)) || !last) {
          continue;
        }
        const holdScale = last.stillScale;
        draws.push({
          forward: still.forward,
          name: actor.name,
          bits: last.bits,
          topLeft: spriteStillTopLeft(still.x, still.y, last.place, holdScale),
          stillScale: holdScale,
          z: rangeGroundBlitZ(
            exeSpriteZ(still.lensForward, actor.zclip),
            zPlane,
            still.x,
            still.y,
            actor,
          ),
        });
        seen.add(actor.name);
        continue;
      }
      const stillScale = actor.screen
        ? 1
        : actorStillHeight(place.h, actor.scale, still.lensForward, CST_SCALE_FIELD) / place.h;
      const sized = sizedPlace(place, bits.w, bits.h);
      this.lastActorDraw.set(actor.name, { bits, place: sized, stillScale });
      seen.add(actor.name);
      draws.push({
        forward: still.forward,
        name: actor.name,
        bits,
        topLeft: spriteStillTopLeft(still.x, still.y, sized, stillScale),
        stillScale,
        z: actor.screen
          ? 1
          : rangeGroundBlitZ(
              exeSpriteZ(still.lensForward, actor.zclip),
              zPlane,
              still.x,
              still.y,
              actor,
            ),
      });
    }
    for (const prop of this.host.nearbyProps()) {
      if (prop.name === "avatar") {
        continue;
      }
      if (isInventoryHudView(prop.view)) {
        continue;
      }
      const strip = this.filmstrip();
      const look = strip ? strip.to : this.pose;
      const scene = this.host.sceneNameForPose(this.graph, look.x, look.y);
      if (!shouldBlitDoorOverlay(prop, scene, look.facing)) {
        continue;
      }
      const still = this.projectWorld(prop);
      if (!still) {
        continue;
      }
      const raw = propSprite(prop);
      if (!raw) {
        continue;
      }
      const url = extractUrl(`${prop.spriteRoot}/${raw.path}`);
      const bits = this.spriteBits.get(url);
      const key = `prop:${prop.name}`;
      const last = this.lastActorDraw.get(key);
      if (!bits) {
        void this.loadSpriteBits(url, "high");
        if (!holdWhileLoading(false, Boolean(last)) || !last) {
          continue;
        }
        draws.push({
          forward: still.forward,
          name: key,
          bits: last.bits,
          topLeft: spriteStillTopLeft(still.x, still.y, last.place, last.stillScale),
          stillScale: last.stillScale,
          z: this.propBlitZ(
            prop.name,
            exeSpriteZ(still.lensForward, prop.zclip),
            zPlane,
            still.x,
            still.y,
            prop.z,
            camZ,
          ),
        });
        seen.add(key);
        continue;
      }
      const place = sizedPlace(raw, bits.w, bits.h);
      const stillScale = prop.screen ? 1 : propStillScale(prop, still.lensForward);
      this.lastActorDraw.set(key, { bits, place, stillScale });
      seen.add(key);
      draws.push({
        forward: still.forward,
        name: key,
        bits,
        topLeft: spriteStillTopLeft(still.x, still.y, place, stillScale),
        stillScale,
        z: prop.screen
          ? 1
          : this.propBlitZ(
          prop.name,
          exeSpriteZ(still.lensForward, prop.zclip),
          zPlane,
          still.x,
          still.y,
          prop.z,
          camZ,
        ),
      });
    }
    for (const name of [...this.lastActorDraw.keys()]) {
      if (!seen.has(name)) {
        this.lastActorDraw.delete(name);
      }
    }
    let pickId = 1;
    for (const draw of paintFarToNear(draws)) {
      this.pickNames[pickId] = draw.name;
      blitSpriteZ(
        frame.data,
        this.pick,
        pickId,
        zPlane,
        draw.z,
        draw.bits,
        draw.topLeft.x,
        draw.topLeft.y,
        draw.stillScale,
      );
      pickId += 1;
    }
    this.actorCtx.putImageData(frame, 0, 0);
    this.layoutHand();
    this.layoutPortrait();
  }

  /**
   * Door overlays replace the still's door. Blit at Z=1 so the lower
   * leaf is not clipped by closer floor Z or a stale street plane.
   */
  private propBlitZ(
    name: string,
    computed: number,
    zPlane: Uint8Array | null,
    hx: number,
    hy: number,
    objZ: number,
    camZ: number,
  ): number {
    return isDoorOverlay(name) && isWallOverlay(objZ, camZ)
      ? wallOverlayBlitZ(computed, zPlane, hx, hy)
      : actorBlitZ(computed, zPlane, hx, hy);
  }

  /** HOUSE `noface` HUD portrait. `propdeg` picks nitefaces; timing tables play glances. */
  private layoutPortrait(): void {
    const prop = this.host.props.get("avatar");
    if (
      !prop?.visible ||
      this.flats.open ||
      this.host.currentPuppet !== "none" ||
      !this.ui.root.hidden ||
      this.onRange()
    ) {
      this.hudFace.hidden = true;
      return;
    }
    const view = (prop.view || "nitefaces").toLowerCase();
    const frames = prop.sprites[view] ?? prop.sprites.nitefaces ?? [];
    this.warmPropPlates(prop, frames);
    const raw = propViewFrame(frames, prop.deg, prop.poseTiming[view], prop.animTick);
    if (!raw) {
      if (!holdWhileLoading(false, Boolean(this.hudFaceSrc))) {
        this.hudFace.hidden = true;
      }
      return;
    }
    const url = extractUrl(`${prop.spriteRoot}/${raw.path}`);
    const bits = this.spriteBits.get(url);
    if (!bits) {
      void this.loadSpriteBits(url, "high");
      if (!holdWhileLoading(false, Boolean(this.hudFaceSrc))) {
        this.hudFace.hidden = true;
      }
      return;
    }
    const place = sizedPlace(raw, bits.w, bits.h);
    const scale = this.stageScale || 1;
    const hx = prop.x || AVATAR_SLOT.x;
    const hy = prop.y || AVATAR_SLOT.y;
    if (this.hudFaceSrc !== url) {
      this.hudFace.width = bits.w;
      this.hudFace.height = bits.h;
      const stamp = this.hudFaceCtx.createImageData(bits.w, bits.h);
      stamp.data.set(bits.data);
      this.hudFaceCtx.putImageData(stamp, 0, 0);
      this.hudFaceSrc = url;
    }
    this.hudFace.hidden = false;
    this.hudFace.style.left = `${(hx + place.x - SPRITE_HOTSPOT_X) * scale}px`;
    this.hudFace.style.top = `${(hy + place.y - SPRITE_HOTSPOT_Y) * scale}px`;
    this.hudFace.style.width = `${place.w * scale}px`;
    this.hudFace.style.height = `${place.h * scale}px`;
  }

  private restoreHandSlot(): void {
    const hand = String(this.vm.globals.get("handitem") ?? "").toLowerCase();
    if (!hand) {
      return;
    }
    const prop = this.host.props.get(hand);
    if (!prop) {
      return;
    }
    prop.view = "large";
    prop.x = HAND_SLOT.x;
    prop.y = HAND_SLOT.y;
  }

  private layoutHand(): void {
    const hand = String(this.vm.globals.get("handitem") ?? "");
    if (!hand) {
      this.handEl.hidden = true;
      return;
    }
    const prop = this.host.props.get(hand.toLowerCase());
    if (this.host.currentPuppet !== "none" || this.flats.open || this.onRange()) {
      this.handEl.hidden = true;
      return;
    }
    const frames = prop?.sprites[prop.view] ?? prop?.sprites.large ?? prop?.sprites.panel;
    const raw = frames?.[0];
    if (!raw || !prop) {
      this.handEl.hidden = true;
      return;
    }
    const url = extractUrl(`${prop.spriteRoot}/${raw.path}`);
    const bits = this.spriteBits.get(url);
    if (!bits) {
      void this.loadSpriteBits(url, "high");
      if (!holdWhileLoading(false, Boolean(this.handSrc))) {
        this.handEl.hidden = true;
      }
      return;
    }
    const place = sizedPlace(raw, bits.w, bits.h);
    const scale = this.stageScale || 1;
    const hx = prop.x || HAND_SLOT.x;
    const hy = prop.y || HAND_SLOT.y;
    if (this.handSrc !== url) {
      this.handEl.width = bits.w;
      this.handEl.height = bits.h;
      const stamp = this.handCtx.createImageData(bits.w, bits.h);
      stamp.data.set(bits.data);
      this.handCtx.putImageData(stamp, 0, 0);
      this.handSrc = url;
    }
    this.handEl.hidden = false;
    this.handEl.style.left = `${(hx + place.x - SPRITE_HOTSPOT_X) * scale}px`;
    this.handEl.style.top = `${(hy + place.y - SPRITE_HOTSPOT_Y) * scale}px`;
    this.handEl.style.width = `${place.w * scale}px`;
    this.handEl.style.height = `${place.h * scale}px`;
  }

  private loadSpriteBits(url: string, priority: MediaPriority = "low"): Promise<SpriteBits | null> {
    const hit = this.spriteBits.get(url);
    if (hit) {
      return Promise.resolve(hit);
    }
    const pending = this.spriteLoading.get(url);
    if (pending) {
      if (priority === "high") {
        mediaGate.prefer(`bits:${url}`);
      }
      return pending;
    }
    const job = decodeStillImage(url, priority)
      .then((image) => {
        const inven = /\/PRP\/_INVEN\//i.test(url);
        const bits = spriteBitsFromImageData(
          image,
          inven ? { unusedWhite: true, restoreShadow: false } : undefined,
        );
        this.spriteBits.set(url, bits);
        this.layoutActors();
        return bits;
      })
      .catch(() => null)
      .finally(() => {
        this.spriteLoading.delete(url);
      });
    this.spriteLoading.set(url, job);
    return job;
  }

  private liveZPlane(): Uint8Array | null {
    const plane = liveZPlaneForStill(this.zWant, this.zCache, this.zPlane);
    if (this.zCache.has(this.zWant)) {
      this.zPlane = plane;
    }
    return plane;
  }

  private warmActorPlates(actor: { standSprites: { path: string }[]; spriteRoot: string }): void {
    for (const plate of actor.standSprites) {
      const url = extractUrl(`${actor.spriteRoot}/${plate.path}`);
      if (!this.spriteBits.has(url) && !this.spriteLoading.has(url)) {
        void this.loadSpriteBits(url, "low");
      }
    }
  }

  private warmPropPlates(
    prop: { spriteRoot: string },
    frames: { path: string }[],
  ): void {
    for (const frame of frames) {
      const url = extractUrl(`${prop.spriteRoot}/${frame.path}`);
      if (!this.spriteBits.has(url) && !this.spriteLoading.has(url)) {
        void this.loadSpriteBits(url, "low");
      }
    }
  }

  private bindZ(url: string): void {
    this.zWant = url;
    if (this.zCache.has(url)) {
      this.zPlane = this.zCache.get(url) ?? null;
    }
    void this.ensureZ(url, "high");
  }

  private preloadZ(stillUrls: string[], priority: MediaPriority): void {
    for (const still of stillUrls) {
      void this.ensureZ(zUrlFromStill(still), priority);
    }
  }

  private trimZCache(stillUrls: string[]): void {
    const keep = new Set(stillUrls.map((still) => zUrlFromStill(still)));
    if (this.zWant) {
      keep.add(this.zWant);
    }
    for (const key of [...this.zCache.keys()]) {
      if (!keep.has(key)) {
        this.zCache.delete(key);
      }
    }
  }

  private ensureZ(url: string, priority: MediaPriority = "low"): Promise<void> {
    if (this.zCache.has(url)) {
      return Promise.resolve();
    }
    const inflight = this.zLoading.get(url);
    if (inflight) {
      if (priority === "high") {
        mediaGate.prefer(`bits:${url}`);
      }
      return inflight;
    }
    const job = decodeStillImage(url, priority)
      .then((image) => {
        this.zCache.set(url, zPlaneFromImageData(image));
        if (this.zWant === url) {
          this.zPlane = this.zCache.get(url) ?? null;
          this.layoutActors();
        }
      })
      .catch(() => {
        this.zCache.set(url, null);
        if (this.zWant === url) {
          this.zPlane = null;
          this.layoutActors();
        }
      })
      .finally(() => {
        this.zLoading.delete(url);
      });
    this.zLoading.set(url, job);
    return job;
  }

  private syncHud(): void {
    const range = this.onRange();
    this.stageEl.toggleAttribute("data-range", range);
    if (range) {
      this.handEl.hidden = true;
    }
    this.hudEl.style.backgroundImage = `url("${range ? RANGE_HUD_CHROME : PLAY_HUD_CHROME}")`;
    const day = numGlobal(this.vm, "day") || 1;
    const clock = numGlobal(this.vm, "clock") || 3;
    const cash = numGlobal(this.vm, "playercash");
    const label = this.graph ? poseLabel(this.graph, this.pose, this.world) : "Loading…";
    const clockName = clock === 1 ? "Morning" : clock === 2 ? "Afternoon" : "Night";
    const tag = this.kind === "sandbox" ? "UNLOCKED" : "PLAY";
    this.timeEl.textContent = `${tag} · Day ${day} · ${clockName} · $${cash}`;
    const names = this.host.nearbyActors().map((a) => titleCase(a.name));
    this.promptEl.textContent = names.length
      ? `${label} · ${names.join(", ")} — click to talk`
      : label;
    const extra = [...this.vm.unimplemented].slice(0, 4).join(", ");
    const caption = [
      this.kind === "sandbox"
        ? "←/→ turn · ↑ walk · N day/night · all doors open · saloon cards · store checkers · Leroy at the range"
        : "←/→ turn · ↑ walk · click people, signs, items · map/portrait on the bar",
      this.scriptsReady ? "" : "loading scripts…",
      this.logLine,
      extra ? `todo: ${extra}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    this.hintEl.textContent = caption;
    this.captionEl.textContent = caption;
    this.layoutActors();
  }
}

function sizedPlace(
  place: { path: string; x: number; y: number; w: number; h: number },
  bitW: number,
  bitH: number,
): { path: string; x: number; y: number; w: number; h: number } {
  const w = place.w > 0 ? place.w : bitW;
  const h = place.h > 0 ? place.h : bitH;
  const x = place.w > 0 ? place.x : SPRITE_HOTSPOT_X - Math.floor(w / 2);
  const y = place.h > 0 ? place.y : SPRITE_HOTSPOT_Y - h;
  return { path: place.path, x, y, w, h };
}

function propSprite(prop: PropState): { path: string; x: number; y: number; w: number; h: number } | undefined {
  const view = (prop.view || "base").toLowerCase();
  const frames =
    prop.sprites[view] ??
    prop.sprites.sit ??
    prop.sprites.stand ??
    prop.sprites.small ??
    prop.sprites.base ??
    Object.values(prop.sprites)[0];
  if (!frames?.length) {
    return undefined;
  }
  return propBlitFrame(frames, prop.deg, prop.poseTiming[view], prop.animTick, prop.screen);
}

function titleCase(name: string): string {
  return name.slice(0, 1).toUpperCase() + name.slice(1);
}

function preloadMovieImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  if (typeof img.decode === "function") {
    return img.decode().then(() => img);
  }
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(url));
  });
}

const stillImageLoads = new Map<string, Promise<ImageData>>();

function decodeStillImage(url: string, priority: MediaPriority = "low"): Promise<ImageData> {
  const hit = stillImageLoads.get(url);
  if (hit) {
    if (priority === "high") {
      mediaGate.prefer(`bits:${url}`);
    }
    return hit;
  }
  const promise = new Promise<ImageData>((resolve, reject) => {
    mediaGate.enqueue(`bits:${url}`, priority, async () => {
      try {
        resolve(await fetchStillImageData(url));
      } catch (err) {
        reject(err);
      }
    });
  }).finally(() => {
    stillImageLoads.delete(url);
  });
  stillImageLoads.set(url, promise);
  return promise;
}

async function fetchStillImageData(url: string): Promise<ImageData> {
  const { canvas, ctx } = await rasterizePng(url);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function keyToScriptArg(code: string): string | null {
  const input = walkInputFromCode(code);
  return input ? walkInputKey(input) : null;
}

function numGlobal(vm: VM, name: string): number {
  const value = vm.globals.get(name);
  return typeof value === "number" ? value : Number(value ?? 0) || 0;
}
