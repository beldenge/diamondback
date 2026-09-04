/**
 * Chicken Blaster.
 *
 * Walk the filmed streets of Diamondback. They are full of chickens. You
 * have a revolver and a finite belt. Shoot one bird and everything near
 * it goes too, tile by tile, down the street.
 *
 * The frame is composited by hand into a 512x264 buffer rather than drawn
 * with `drawImage`, because sprites have to be depth-tested against the
 * SET Z plane — otherwise chickens stand in front of buildings they are
 * behind. That buffer also carries a pick map, so a click resolves to the
 * exact sprite pixel under the crosshair and a bird hidden behind a wall
 * cannot be shot through it.
 *
 * No VM, no engine state — see `SIDESHOW.md` for why the wall exists and
 * `boundary.test.ts` for what enforces it.
 */

import {
  CST_SCALE_FIELD,
  PRP_SCALE_FIELD,
  SPRITE_HOTSPOT_X,
  SPRITE_HOTSPOT_Y,
  cameraFromPose,
  engineStillScale,
  filmstripT,
  lerpViewCamera,
  pickCstFrame,
  spriteStillTopLeft,
  type ViewCamera,
} from "../../play/facing";
import {
  blitSpriteZ,
  exeSpriteZ,
  paintFarToNear,
  stillZPairReady,
  type SpriteBits,
} from "../../play/occlude";
import { extractUrl } from "../../world/set/extract";
import { frameUrl, hqFrame, loadSetGraph, zUrlFromStill } from "../../world/set/graph";
import { TILE_SPAN, tileWorld } from "../../world/set/path";
import {
  FRAMES_PER_TRANSITION,
  STILL_FRAME_SEC,
  STILL_HEIGHT,
  STILL_WIDTH,
  type SetGraph,
  type SetTransition,
  type WalkerPose,
} from "../../world/set/types";
import {
  applyTransition,
  isSwipePointer,
  swipeWalkInput,
  transitionForInput,
  walkInputFromCode,
  type WalkInput,
} from "../../world/set/walker";
import { Sfx, TARGET_SOUNDS } from "./audio";
import { BOSSES, bossPoseAt, isWalkPose, type BossSpec } from "./bosses";
import { chainDepth, chainDetonations, type ChainTarget } from "./chain";
import {
  BIRD_SCALE,
  birdTile,
  spawnAt,
  stepFlock,
  walkableTiles,
  type Bird,
  type TileXY,
} from "./flock";
import { gunPose } from "./gun";
import { groundSpriteZ, projectSprite } from "./project";
import { drawMinimap, hitsRect, mapToggleRect, minimapRect } from "./minimap";
import { AMMO_PER_BOSS, Run, bossBonus, comboBanner, hopScore } from "./score";
import { SpriteBank, type PoseTable, type SheetFrame } from "./sprites";
import {
  birdsForWave,
  bossesForWave,
  bossHitsForWave,
  bossScaleFor,
  isBossWave,
} from "./waves";

const TOWN = "_TOWN";
const CAMERA_Z = 62;

/**
 * You hold Main Street at the **south end of the saloon**, looking down
 * toward the gate. The saloon's street door is `scene h7` (tile 6,7), so
 * this is the tile past it — close enough that a wave is on you quickly,
 * far enough that you can still see it coming and give ground.
 *
 * I8 facing S. The walk `S -> I9` is filmed, so the pose has an HQ still.
 * Standing at the mission (D7) put eleven tiles between you and the gate,
 * which was a long wait at the start of every wave.
 */
const PLAYER_SPAWN: WalkerPose = { x: 6, y: 8, facing: "S" };

/**
 * Everything enters at the south gate, under the hanging DIAMONDBACK
 * sign, and comes up the street at you: the flock and the boss both,
 * wherever you happen to be standing when the last bird drops. O7 is the
 * original's own spawn tile.
 */
const GATE_TILE = { x: 6, y: 14 };

/** Birds released per batch, and how often, while a wave is arriving. */
const SPAWN_BATCH = 3;
const SPAWN_INTERVAL_MS = 340;

/** Dust ran the world at 20 Hz (`framerate (3)`). Walk cycles follow. */
const GAME_FRAME_MS = 50;

const PRP_HOUSE = "PRP/_HOUSE";
const CST_EXTRA = "CST/_EXTRA";

/**
 * The powder keg's own 15-plate blast, not the 5-frame chicken puff.
 * `chickexplode` is a spray of feathers; this is the thing that goes off
 * when you shoot a keg, and it is what a chicken deserves.
 */
const EXPLODE_GROUP = "powderkeg1";
const EXPLODE_STATE = "explode";
const EXPLODE_FRAME_MS = 45;

/**
 * Skip plate 0. The keg's blast starts with the intact barrel still
 * standing (59x84, before anything happens to it), which is right when you
 * shoot a keg and wrong when the thing that just died was a chicken — you
 * see a barrel flash into existence where the bird was. The fireball
 * proper starts at plate 1.
 */
const EXPLODE_FIRST_PLATE = 1;

/**
 * Blast size relative to a bird. The keg plates run to 339x264 in sheet
 * space against a chicken's ~70, so drawing them at the bird's own scale
 * would white out the street for every single kill. This puts the
 * fireball at roughly two and a half chickens tall.
 */
const EXPLODE_SCALE = 620;

const GUN_GROUP = "gunhand";


/**
 * The town map, straight off the game's own dashboard: NEW.FLT frame 6 is
 * the plan that pops up when you click MAP. `minimap.ts` places tiles on it
 * with the engine's own grid origin.
 */
const MAP_FRAME_URL = "FLT/_NEW/frame_6.png";


/**
 * The death reel: `MOV/_DIEH3`, 19 plates of the stranger propped upright
 * in an open coffin in the undertaker's parlour, lanterns either side.
 *
 * Its frames are numbered 2..20 and are 512x264 — the same size as a SET
 * still, so they load through the same cache and draw with the same blit.
 * Its own `timeline.json` runs 5.53s over 19 plates, which is the ~291ms
 * hold used here rather than a made-up rate.
 *
 * (`_DIES3` is the knife, `_DIES1` the scorpion, `_DIEH1`/`_DIEH2` the
 * hanging. This is the only reel with a coffin in it.)
 */
const DEATH_REEL = { dir: "MOV/_DIEH3/FRAMES", first: 2, count: 19, frameMs: 291 };

/**
 * How long the death card ignores clicks.
 *
 * You die *while shooting*, so the click that killed the run is usually
 * followed by two or three more already on their way. Without a guard the
 * card is dismissed before it has been read and the next run has begun.
 */
const DEATH_CARD_GRACE_MS = 2000;

/** Plates the background preloader decodes at once. */
const PRELOAD_WIDTH = 4;

/** Shortest gap between two of a boss's hit cries. */
const HIT_CRY_COOLDOWN_MS = 420;

/** Pick-map ids. Birds take 1..n; these sit above anything a wave can hold. */
const PICK_BOSS_BASE = 60000;
/** Anything that draws without becoming a target. Goes to a scratch buffer. */
const PICK_OVERLAY = 65535;

interface Explosion {
  x: number;
  y: number;
  scale: number;
  startedAt: number;
}

interface Walking {
  tr: SetTransition;
  from: WalkerPose;
  to: WalkerPose;
  startedAt: number;
  urls: string[];
}

interface BossState {
  spec: BossSpec;
  x: number;
  y: number;
  deg: number;
  scale: number;
  hits: number;
  maxHits: number;
  frames: number;
  table: PoseTable;
  /** Last time its hit cry played, so repeated shots do not stack it. */
  lastCryAt: number;
}

interface Banner {
  text: string;
  until: number;
  big: boolean;
}

interface DrawItem {
  forward: number;
  bits: SpriteBits;
  dx: number;
  dy: number;
  scale: number;
  /** Sprite depth in the SET's 24-level Z. */
  z: number;
  pickId: number;
  /** False for scenery: it draws, but never becomes a click target. */
  claims: boolean;
}

export class BlasterGame {
  private readonly root: HTMLElement;

  private readonly canvas: HTMLCanvasElement;

  private readonly ctx: CanvasRenderingContext2D;

  private readonly stage: HTMLCanvasElement;

  private readonly sctx: CanvasRenderingContext2D;

  /** 512x264 composite buffer. Sprites are blitted into this by hand. */
  private readonly frame: ImageData;

  /** Which sprite owns each pixel of the last rendered frame. */
  private readonly pick: Uint16Array;

  /** Scratch for overlays that draw but must not claim click targets. */
  private readonly overlayPick: Uint16Array;

  /** Pick id -> bird, rebuilt every render. */
  private pickBirds: Bird[] = [];

  private readonly sprites = new SpriteBank();

  private readonly sfx = new Sfx();

  private readonly run = new Run();

  private graph: SetGraph | null = null;

  private walkable: TileXY[] = [];

  private pose: WalkerPose = { ...PLAYER_SPAWN };

  private walking: Walking | null = null;

  private birds: Bird[] = [];

  private nextBirdId = 1;

  /** Birds of this wave still waiting to walk in through the gate. */
  private pendingBirds = 0;

  private nextSpawnAt = 0;

  private explosions: Explosion[] = [];

  private fuses: { id: number; at: number; hop: number }[] = [];

  private bosses: BossState[] = [];

  /**
   * A wave runs in two beats: clear the flock, *then* the boss walks in.
   * Overlapping them buried the boss in poultry and meant a lucky cascade
   * could end the wave before you ever saw it.
   */
  private phase: "flock" | "boss" = "flock";

  /** Boss sprites are still loading. Not yet dead — just not here yet. */
  private bossPending = false;

  private chickenPoses: PoseTable | null = null;

  private explodeFrames: SheetFrame[] = [];

  private gunFrames: PoseTable = {};

  /** Aged paper for the minimap. A HUD image, so a plain element is fine. */
  private mapPaper: HTMLImageElement | null = null;

  /** Still that is actually painted — only swaps once its Z plane is known. */
  private shownStill: string | null = null;

  private banner: Banner | null = null;

  private raf = 0;

  private lastTick = 0;

  private frameAccum = 0;

  private gameFrames = 0;

  /** Game frame the last shot went off, or -1. Drives fire/recoil. */
  private shotFrame = -1;

  private crosshair = { x: STILL_WIDTH / 2, y: STILL_HEIGHT * 0.62 };

  private disposed = false;

  private ready = false;

  private status = "Loading Diamondback…";

  private pointerDown: { x: number; y: number; id: number; type: string } | null = null;

  private waveIntroAt = 0;

  /** Bumped on every landing so a stale preload queue abandons itself. */
  private preloadGen = 0;

  private soundsWarmed = false;

  /** Minimap on by default; `M` or the corner box hides it. */
  private mapOpen = true;


  /** When the run ended, so the death reel can play from the top. */
  private diedAt = 0;

  onQuit: (() => void) | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.id = "blaster";
    this.canvas = document.createElement("canvas");
    this.root.append(this.canvas);
    document.body.append(this.root);

    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("blaster: no 2d context");
    }
    this.ctx = ctx;

    this.stage = document.createElement("canvas");
    this.stage.width = STILL_WIDTH;
    this.stage.height = STILL_HEIGHT;
    const sctx = this.stage.getContext("2d", { alpha: false });
    if (!sctx) {
      throw new Error("blaster: no stage context");
    }
    this.sctx = sctx;
    this.frame = sctx.createImageData(STILL_WIDTH, STILL_HEIGHT);
    this.pick = new Uint16Array(STILL_WIDTH * STILL_HEIGHT);
    this.overlayPick = new Uint16Array(STILL_WIDTH * STILL_HEIGHT);

    this.bind();
    this.resize();
    // Dev handle, same convention as `window.reimagined`.
    (window as unknown as { blaster?: BlasterGame }).blaster = this;
  }

  /** Fresh belt, wave one, back at the saloon. */
  private restart(): void {
    this.run.reset();
    this.pose = { ...PLAYER_SPAWN };
    this.walking = null;
    this.birds = [];
    this.fuses = [];
    this.bosses = [];
    this.bossPending = false;
    this.explosions = [];
    this.banner = null;
    this.diedAt = 0;
    this.shotFrame = -1;
    void this.showPose(this.pose).then(() => this.preloadAround(this.pose));
    this.beginWave();
  }


  /** Dev: restart at a given wave. Not reachable from the UI. */
  jumpTo(wave: number): void {
    this.run.wave = Math.max(1, Math.trunc(wave));
    this.run.over = false;
    this.run.ammo = Math.max(this.run.ammo, 24);
    this.explosions = [];
    this.beginWave();
  }

  // ── lifecycle ─────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.loop();
    try {
      const graph = await loadSetGraph(TOWN);
      if (this.disposed) {
        return;
      }
      this.graph = graph;
      this.walkable = walkableTiles(graph.cameraTiles);
      this.pose = { ...PLAYER_SPAWN };

      const [chicken, keg, gun] = await Promise.all([
        this.sprites.poses("_EXTRA", "chicken1"),
        this.sprites.propGroup(PRP_HOUSE, EXPLODE_GROUP),
        this.sprites.propGroup(PRP_HOUSE, GUN_GROUP),
      ]);
      if (this.disposed) {
        return;
      }
      this.chickenPoses = chicken;
      this.explodeFrames = keg[EXPLODE_STATE] ?? [];
      this.gunFrames = gun;
      void this.loadMapPaper();

      await Promise.all([
        chicken ? this.sprites.preload(CST_EXTRA, chicken, ["walk", "stand", "peck"]) : null,
        this.sprites.preload(PRP_HOUSE, keg, [EXPLODE_STATE]),
        this.sprites.preload(PRP_HOUSE, gun, Object.keys(gun)),
        this.showPose(this.pose),
      ]);
      if (this.disposed) {
        return;
      }
      this.ready = true;
      this.status = "";
      this.preloadAround(this.pose);
      this.beginWave();
    } catch (err) {
      this.status = `Extract missing — ${String(err)}`;
    }
  }

  private deathReelUrl(index: number): string {
    return extractUrl(`${DEATH_REEL.dir}/frame_${DEATH_REEL.first + index}.png`);
  }

  /**
   * Warm the death reel while the player is still alive. It is 27 plates,
   * and decoding them at the moment the belt runs dry would stall the one
   * frame the player is guaranteed to be looking at.
   */
  private async loadDeathReel(): Promise<void> {
    for (let i = 0; i < DEATH_REEL.count; i += 1) {
      if (this.disposed) {
        return;
      }
      await this.sprites.loadStill(this.deathReelUrl(i));
    }
  }

  /** HUD paper for the minimap. Never depth-tested, so a plain img is fine. */
  private async loadMapPaper(): Promise<void> {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.decoding = "async";
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error(MAP_FRAME_URL));
        el.src = extractUrl(MAP_FRAME_URL);
      });
      if (!this.disposed) {
        this.mapPaper = img;
      }
    } catch {
      // The panel falls back to a plain aged-paper fill.
    }
  }

  hide(): void {
    this.root.hidden = true;
  }

  show(): void {
    this.root.hidden = false;
    this.resize();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unbind();
    this.sfx.dispose();
    this.root.remove();
  }

  // ── input ─────────────────────────────────────────────────────────

  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    // Movement first, and it **accepts auto-repeat**: holding a direction
    // should keep walking. `tryWalk` no-ops while a strip is already
    // running, so a repeat that arrives mid-move is simply dropped.
    const input = walkInputFromCode(ev.code);
    if (input) {
      ev.preventDefault();
      this.tryWalk(input);
      return;
    }
    if (ev.repeat) {
      return;
    }
    if (ev.code === "Escape") {
      this.onQuit?.();
      return;
    }
    if (ev.code === "KeyM") {
      this.mapOpen = !this.mapOpen;
      return;
    }
    // `M` is the map, so sound moved to `S`.
    if (ev.code === "KeyS") {
      this.sfx.setMuted(!this.sfx.isMuted);
      this.flash(this.sfx.isMuted ? "Sound off" : "Sound on", false);
    }
  };

  private readonly onPointerMove = (ev: PointerEvent): void => {
    const point = this.toStagePoint(ev.clientX, ev.clientY);
    if (point) {
      this.crosshair = point;
    }
  };

  private readonly onPointerDown = (ev: PointerEvent): void => {
    // A browser only grants an AudioContext after a gesture.
    this.sfx.unlock();
    if (!this.soundsWarmed) {
      this.soundsWarmed = true;
      this.sfx.preload("_TARGET", TARGET_SOUNDS);
      this.sfx.preload("_BOUNTY", ["shotgun"]);
      void this.loadDeathReel();
    }
    const point = this.toStagePoint(ev.clientX, ev.clientY);
    if (point) {
      this.crosshair = point;
    }
    this.pointerDown = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, type: ev.pointerType };
  };

  private readonly onPointerUp = (ev: PointerEvent): void => {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || down.id !== ev.pointerId) {
      return;
    }
    if (isSwipePointer(ev.pointerType)) {
      const input = swipeWalkInput(ev.clientX - down.x, ev.clientY - down.y);
      if (input) {
        this.tryWalk(input);
        return;
      }
    }
    this.shootAt(ev.clientX, ev.clientY);
  };

  private readonly onResize = (): void => {
    this.resize();
  };

  private bind(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("resize", this.onResize);
    this.root.addEventListener("pointermove", this.onPointerMove);
    this.root.addEventListener("pointerdown", this.onPointerDown);
    this.root.addEventListener("pointerup", this.onPointerUp);
    this.root.addEventListener("contextmenu", preventDefault);
  }

  private unbind(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("resize", this.onResize);
    this.root.removeEventListener("pointermove", this.onPointerMove);
    this.root.removeEventListener("pointerdown", this.onPointerDown);
    this.root.removeEventListener("pointerup", this.onPointerUp);
    this.root.removeEventListener("contextmenu", preventDefault);
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
  }

  // ── walking the film ──────────────────────────────────────────────

  private poseStillUrl(pose: WalkerPose): string | null {
    if (!this.graph) {
      return null;
    }
    const ref = hqFrame(this.graph, pose);
    return ref ? frameUrl(TOWN, ref.frame0, ref.offset) : null;
  }

  /**
   * Decode a still and its Z plane together. Painting the colour before
   * the plane lands is what draws chickens through facades, so both are
   * awaited and `shownStill` only advances when the pair is ready.
   */
  private async loadPlate(url: string): Promise<void> {
    await Promise.all([this.sprites.loadStill(url), this.sprites.loadZPlane(zUrlFromStill(url))]);
  }

  private plateReady(url: string): boolean {
    return stillZPairReady(
      this.sprites.still(url) !== undefined,
      this.sprites.zSettled(zUrlFromStill(url)),
    );
  }

  private wantedStillUrl(): string | null {
    if (this.walking) {
      const index = this.stripIndex(this.walking);
      return this.walking.urls[Math.min(index, this.walking.urls.length - 1)] ?? null;
    }
    return this.poseStillUrl(this.pose);
  }

  private stripIndex(walking: Walking): number {
    return Math.floor((performance.now() - walking.startedAt) / (STILL_FRAME_SEC * 1000));
  }

  private async showPose(pose: WalkerPose): Promise<void> {
    const url = this.poseStillUrl(pose);
    if (url) {
      await this.loadPlate(url);
    }
  }

  private stripUrls(tr: SetTransition): string[] {
    const motion = FRAMES_PER_TRANSITION - 1;
    const urls: string[] = [];
    for (let i = 0; i < motion; i += 1) {
      urls.push(frameUrl(TOWN, tr.frame0, tr.reverse ? motion - 1 - i : i));
    }
    return urls;
  }

  /**
   * Start a move **now**, and let the film catch up.
   *
   * This used to `await` the whole strip before the camera would budge:
   * five motion plates plus the landing plate, each with its own `FRAMES/z`
   * — twelve fetches and twelve main-thread `getImageData` decodes per
   * keypress. On anything but a warm cache that is a visible stall on every
   * single turn, which read as the controls being broken.
   *
   * Nothing needs the wait. `render` only swaps `shownStill` once a plate
   * and its Z are both ready (`plateReady`) and otherwise holds the one
   * already on screen, so a plate that has not landed yet costs a repeated
   * frame, never a black one. The walk itself is driven by the clock, so it
   * still finishes on time. Combined with `preloadAround`, the plates are
   * usually already decoded before the key is pressed.
   */
  private tryWalk(input: WalkInput): void {
    if (!this.graph || !this.ready || this.walking || this.run.over) {
      return;
    }
    const tr = transitionForInput(this.graph, this.pose, input);
    if (!tr) {
      return;
    }
    const to = applyTransition(tr);
    const urls = this.stripUrls(tr);
    this.walking = { tr, from: this.pose, to, startedAt: performance.now(), urls };
    // Abandon the background queue. Its plates are speculative; these are
    // needed in the next 250 ms, and letting thirty-six speculative decodes
    // stay in front of twelve real ones is how the film falls behind the
    // camera even though everything is fast enough on paper.
    this.preloadGen += 1;
    for (const url of urls) {
      void this.loadPlate(url);
    }
    void this.showPose(to);
  }

  /**
   * Warm every plate the player could reach from here — the three strips
   * out of this pose and the three landing stills — so the next move has
   * nothing to wait for.
   *
   * A few at a time, not all at once and not one at a time. Fully
   * sequential could not keep up: a landing queues ~36 plates, and with
   * key auto-repeat the player starts the next move long before that
   * drains, so every move after the first was partly cold. All at once
   * would jank the frame being looked at, since these decodes read pixels
   * back on the main thread. `PRELOAD_WIDTH` is the compromise.
   *
   * Starting a move bumps the generation, so the speculative work gets out
   * of the way of plates that are actually needed.
   */
  private preloadAround(pose: WalkerPose): void {
    const graph = this.graph;
    if (!graph) {
      return;
    }
    const gen = (this.preloadGen += 1);
    const urls: string[] = [];
    for (const input of ["left", "right", "forward"] as const) {
      const tr = transitionForInput(graph, pose, input);
      if (!tr) {
        continue;
      }
      urls.push(...this.stripUrls(tr));
      const landing = this.poseStillUrl(applyTransition(tr));
      if (landing) {
        urls.push(landing);
      }
    }
    void (async () => {
      for (let i = 0; i < urls.length; i += PRELOAD_WIDTH) {
        if (this.disposed || this.preloadGen !== gen) {
          return;
        }
        await Promise.all(urls.slice(i, i + PRELOAD_WIDTH).map((url) => this.loadPlate(url)));
      }
    })();
  }

  private camera(): ViewCamera {
    if (this.walking) {
      const t = filmstripT(this.stripIndex(this.walking), FRAMES_PER_TRANSITION);
      return lerpViewCamera(this.walking.from, this.walking.to, t, CAMERA_Z);
    }
    return cameraFromPose(this.pose, CAMERA_Z);
  }

  // ── waves ─────────────────────────────────────────────────────────

  private beginWave(): void {
    const wave = this.run.wave;
    // Nothing is on the map yet: the wave walks in through the gate.
    this.birds = [];
    this.pendingBirds = birdsForWave(wave);
    this.nextSpawnAt = performance.now();
    this.fuses = [];
    this.bosses = [];
    this.bossPending = false;
    this.phase = "flock";
    // No "Wave N" banner: the HUD bar already reads WAVE N, and a card
    // over the street at the exact moment the first birds come through the
    // gate hides the thing it is announcing.
    this.waveIntroAt = performance.now();
  }

  /** The flock is down. Bring on whatever is waiting for you. */
  private beginBossPhase(): void {
    this.phase = "boss";
    if (!isBossWave(this.run.wave)) {
      return;
    }
    this.bossPending = true;
    void this.spawnBosses(this.run.wave);
  }

  private async spawnBosses(wave: number): Promise<void> {
    const ids = bossesForWave(wave);
    if (ids.length === 0) {
      this.bossPending = false;
      return;
    }
    const spot = tileWorld(GATE_TILE.x, GATE_TILE.y);
    const built: BossState[] = [];

    for (let i = 0; i < ids.length; i += 1) {
      const spec = BOSSES[ids[i]!];
      const root = `CST/${spec.cast}`;
      const table = await this.sprites.poses(spec.cast, spec.actor);
      if (!table || this.disposed || this.run.wave !== wave) {
        continue;
      }
      await this.sprites.preload(root, table, spec.poses);
      if (this.disposed || this.run.wave !== wave) {
        this.bossPending = false;
        return;
      }
      // One fixed size for every boss, from this sprite's own sheet height
      // so a horse (301px frames) and a chicken (71px) draw the same.
      const tallest = spec.poses.reduce(
        (max, pose) => Math.max(max, ...(table[pose] ?? []).map((f) => f.h)),
        1,
      );
      const hits = bossHitsForWave(wave);
      // Fan a doubled-up wave across the gate so they do not overlap into
      // one unreadable mass on the way up the street.
      const spread = (i - (ids.length - 1) / 2) * TILE_SPAN * 0.7;
      built.push({
        spec,
        x: spot.x + spread,
        y: spot.y,
        deg: 0,
        scale: bossScaleFor(tallest),
        hits,
        maxHits: hits,
        frames: 0,
        table,
        lastCryAt: 0,
      });
    }

    this.bossPending = false;
    if (built.length === 0) {
      return;
    }
    this.bosses = built;

    const lead = built[0]!.spec;
    this.flash(
      built.length > 1
        ? `${built.length} OF THEM — ${lead.taunt}`
        : `${lead.label.toUpperCase()} — ${lead.taunt}`,
      true,
    );
    // `thistown.wav` is a 2.6-second voice line. Bosses do not talk; the
    // arrival cue is the gallery's own target-up clack (0.14s).
    this.sfx.play("_TARGET", "targetup", 0.9);
    // One line, once, for the bosses that have one.
    for (const boss of built) {
      const line = boss.spec.arrivalLine;
      if (!line) {
        continue;
      }
      void this.sfx.load(line.folder, line.name).then((buffer) => {
        if (buffer && !this.disposed && this.bosses.includes(boss)) {
          this.sfx.play(line.folder, line.name, 1, 0, true);
        }
      });
      break;
    }
  }

  private flockCleared(): boolean {
    return this.birds.length === 0 && this.fuses.length === 0 && this.pendingBirds <= 0;
  }

  /** Let the next batch through the gate. */
  private releaseBirds(now: number): void {
    if (this.pendingBirds <= 0 || now < this.nextSpawnAt) {
      return;
    }
    const batch = Math.min(SPAWN_BATCH, this.pendingBirds);
    this.birds.push(...spawnAt(batch, GATE_TILE, this.walkable, Math.random, this.nextBirdId));
    this.nextBirdId += batch + 1;
    this.pendingBirds -= batch;
    this.nextSpawnAt = now + SPAWN_INTERVAL_MS;
  }

  // ── shooting ──────────────────────────────────────────────────────

  private shootAt(clientX: number, clientY: number): void {
    if (!this.ready) {
      return;
    }
    const point = this.toStagePoint(clientX, clientY);
    if (!point) {
      return;
    }
    // On the death card a click is "again", not a shot — but not for the
    // first couple of seconds, or the shots already in flight when the
    // belt ran dry dismiss the card before it can be read.
    if (this.run.over) {
      if (this.diedAt > 0 && performance.now() - this.diedAt >= DEATH_CARD_GRACE_MS) {
        this.restart();
      }
      return;
    }
    // The map control is a HUD button, not a target. Check it before the
    // belt is touched, or opening the map would cost a shell.
    if (hitsRect(point, mapToggleRect(minimapRect(STILL_HEIGHT), this.mapOpen))) {
      this.mapOpen = !this.mapOpen;
      return;
    }
    if (!this.run.spend()) {
      this.flash("Empty", false);
      return;
    }
    this.crosshair = point;
    this.shotFrame = this.gameFrames;
    // A real gunshot. `SND/_TARGET/draw.wav` is a 2.8-second *voice* line,
    // which is unbearable once a shot lands every half second.
    this.sfx.play("_BOUNTY", "shotgun", 0.55, (Math.random() - 0.5) * 120);

    // The pick map already answers "what is under the crosshair", with
    // occlusion and sprite overlap both handled — a bird behind a facade
    // was never drawn, so it cannot be shot through the wall.
    const hit = this.pick[Math.floor(point.y) * STILL_WIDTH + Math.floor(point.x)] ?? 0;
    if (hit >= PICK_BOSS_BASE) {
      const boss = this.bosses[hit - PICK_BOSS_BASE];
      if (boss) {
        this.hitBoss(boss);
        return;
      }
    }
    const bird = hit > 0 && hit < PICK_BOSS_BASE ? this.pickBirds[hit - 1] : undefined;
    if (!bird || bird.doomed) {
      this.sfx.play("_TARGET", Math.random() < 0.5 ? "rico1" : "rico2", 0.35);
      return;
    }
    this.detonate(bird.id);
  }

  /** Client pixels to 512x264 still pixels, or null outside the letterbox. */
  private toStagePoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const fit = Math.min(rect.width / STILL_WIDTH, rect.height / STILL_HEIGHT);
    const w = STILL_WIDTH * fit;
    const h = STILL_HEIGHT * fit;
    const x = (clientX - rect.left - (rect.width - w) / 2) / fit;
    const y = (clientY - rect.top - (rect.height - h) / 2) / fit;
    if (x < 0 || y < 0 || x >= STILL_WIDTH || y >= STILL_HEIGHT) {
      return null;
    }
    return { x, y };
  }

  private birdFrame(bird: Bird, cam: ViewCamera): SheetFrame | undefined {
    const table = this.chickenPoses;
    if (!table) {
      return undefined;
    }
    const frames = table.walk?.length ? table.walk : table.stand;
    if (!frames?.length) {
      return undefined;
    }
    return pickCstFrame(frames, bird.deg, bird, cam, bird.step);
  }

  private bossFrame(boss: BossState, cam: ViewCamera): SheetFrame | undefined {
    const pose = bossPoseAt(boss.spec, boss.frames);
    const frames = boss.table[pose] ?? boss.table[boss.spec.poses[0]!] ?? [];
    if (!frames.length) {
      return undefined;
    }
    return pickCstFrame(frames, boss.deg, boss, cam, Math.floor(boss.frames / 3));
  }

  private hitBoss(boss: BossState): void {
    boss.hits -= 1;
    const cry = boss.spec.hitSound;
    // A voice cry is a second long; firing it on every trigger pull stacks
    // into mush. Impacts are short and can overlap freely.
    const now = performance.now();
    if (now - boss.lastCryAt >= HIT_CRY_COOLDOWN_MS) {
      boss.lastCryAt = now;
      this.sfx.play(cry.folder, cry.name, 0.9, (Math.random() - 0.5) * 200, true);
    }
    if (boss.hits > 0) {
      return;
    }
    // The flock is already down by the time a boss arrives, so there is
    // nothing left to chain into. It goes up on its own, enormously.
    this.run.add(bossBonus(this.run.wave));
    // Per boss, so a doubled-up wave pays for the shells it costs.
    this.run.awardAmmo(AMMO_PER_BOSS);
    this.explode(boss.x, boss.y, EXPLODE_SCALE * 4);
    this.sfx.play("_TARGET", "hit3", 1);
    // No "X DOWN" card. A boss the size of a building going up in a
    // four-times-scale fireball is not something the player needs told.
    this.bosses = this.bosses.filter((b) => b !== boss);
  }

  /** Seed a cascade. Every bird it reaches is fused now, popped later. */
  private detonate(seedId: number): void {
    const targets: ChainTarget[] = [];
    for (const bird of this.birds) {
      if (bird.doomed) {
        continue;
      }
      const tile = birdTile(bird);
      targets.push({ id: bird.id, tx: tile.x, ty: tile.y });
    }
    const chain = chainDetonations(seedId, targets);
    if (chain.length === 0) {
      return;
    }
    const now = performance.now();
    const byId = new Map(this.birds.map((b) => [b.id, b] as const));
    for (const det of chain) {
      const bird = byId.get(det.id);
      if (bird) {
        bird.doomed = true;
      }
      this.fuses.push({ id: det.id, at: now + det.delayMs, hop: det.hop });
    }
    const banner = comboBanner(chain.length, chainDepth(chain));
    if (banner) {
      this.flash(banner, chain.length >= 8);
    }
    this.run.noteChain(chain.length);
  }

  private explode(x: number, y: number, scale: number): void {
    this.explosions.push({ x, y, scale, startedAt: performance.now() });
  }

  private flash(text: string, big: boolean): void {
    this.banner = { text, until: performance.now() + (big ? 2200 : 1200), big };
  }

  // ── tick ──────────────────────────────────────────────────────────

  private readonly loop = (): void => {
    if (this.disposed) {
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 0;
    this.lastTick = now;
    this.update(now, dt);
    this.render(now);
  };

  private update(now: number, dt: number): void {
    if (this.walking && this.stripIndex(this.walking) >= this.walking.urls.length) {
      this.pose = this.walking.to;
      this.walking = null;
      this.preloadAround(this.pose);
    }

    if (!this.ready) {
      return;
    }

    this.frameAccum += dt * 1000;
    const frames = Math.floor(this.frameAccum / GAME_FRAME_MS);
    this.frameAccum -= frames * GAME_FRAME_MS;
    this.gameFrames += frames;

    this.releaseBirds(now);
    if (this.birds.length > 0) {
      // Birds drift toward you as they wander, so a wave arrives instead
      // of having to be hunted across 52 tiles. `BIRD_DRIFT` tunes it.
      stepFlock(this.birds, dt, this.walkable, Math.random, frames, this.pose);
    }
    this.updateBoss(dt, frames);

    if (this.fuses.length > 0) {
      const due = this.fuses.filter((f) => f.at <= now);
      if (due.length > 0) {
        this.fuses = this.fuses.filter((f) => f.at > now);
        const byId = new Map(this.birds.map((b) => [b.id, b] as const));
        for (const fuse of due) {
          const bird = byId.get(fuse.id);
          if (!bird) {
            continue;
          }
          this.explode(bird.x, bird.y, EXPLODE_SCALE);
          this.run.add(hopScore(fuse.hop));
          this.sfx.play(
            "_TARGET",
            "chickenhit",
            Math.max(0.25, 0.8 - fuse.hop * 0.04),
            (Math.random() - 0.5) * 300,
          );
        }
        const gone = new Set(due.map((f) => f.id));
        this.birds = this.birds.filter((b) => !gone.has(b.id));
      }
    }

    const explodeMs =
      Math.max(1, this.explodeFrames.length - EXPLODE_FIRST_PLATE) * EXPLODE_FRAME_MS;
    this.explosions = this.explosions.filter((ex) => now - ex.startedAt < explodeMs);

    if (this.run.over || now - this.waveIntroAt < 800) {
      return;
    }
    if (this.phase === "flock" && this.flockCleared()) {
      this.beginBossPhase();
      return;
    }
    // The wave is only over once whatever walked in is down.
    if (this.phase === "boss" && !this.bossPending && this.bosses.length === 0) {
      this.run.clearWave();
      this.sfx.play("_TARGET", "newgun", 0.8);
      if (!this.run.over) {
        this.beginWave();
      }
    }
  }

  private updateBoss(dt: number, frames: number): void {
    for (const boss of this.bosses) {
      this.stepBoss(boss, dt, frames);
    }
  }

  private stepBoss(boss: BossState, dt: number, frames: number): void {
    boss.frames += frames;
    const cam = cameraFromPose(this.pose, CAMERA_Z);
    boss.deg = ((Math.atan2(cam.y - boss.y, cam.x - boss.x) / (2 * Math.PI)) * 256 + 256) % 256;

    if (boss.spec.speed > 0 && isWalkPose(bossPoseAt(boss.spec, boss.frames))) {
      const dx = cam.x - boss.x;
      const dy = cam.y - boss.y;
      const dist = Math.hypot(dx, dy);
      // Stop short of the lens; walking through the camera looks broken.
      if (dist > 300) {
        const move = boss.spec.speed * dt;
        boss.x += (dx / dist) * move;
        boss.y += (dy / dist) * move;
      }
    }
  }

  // ── render ────────────────────────────────────────────────────────

  /**
   * Plate of the death reel to show, or null once it has run out.
   * `MOV/_DIES3` plays once and holds on its last frame under the score.
   */
  private deathPlate(now: number): ImageData | undefined {
    if (this.diedAt === 0) {
      this.diedAt = now;
    }
    const index = Math.min(
      DEATH_REEL.count - 1,
      Math.floor((now - this.diedAt) / DEATH_REEL.frameMs),
    );
    return this.sprites.still(this.deathReelUrl(index));
  }

  private render(now: number): void {
    if (this.run.over) {
      const plate = this.deathPlate(now);
      if (plate) {
        this.frame.data.set(plate.data);
      } else {
        this.frame.data.fill(0);
      }
      this.sctx.putImageData(this.frame, 0, 0);
      this.present();
      this.drawOverlay();
      return;
    }
    this.diedAt = 0;
    const want = this.wantedStillUrl();
    if (want && this.plateReady(want)) {
      this.shownStill = want;
    } else if (want) {
      void this.loadPlate(want);
    }

    const still = this.shownStill ? this.sprites.still(this.shownStill) : undefined;
    const zPlane = this.shownStill
      ? (this.sprites.zPlane(zUrlFromStill(this.shownStill)) ?? null)
      : null;

    if (still) {
      this.frame.data.set(still.data);
    } else {
      this.frame.data.fill(0);
    }
    this.pick.fill(0);
    this.overlayPick.fill(0);

    if (this.ready && still) {
      this.compose(now, zPlane);
      this.blendContactShadows(still);
    }
    this.sctx.putImageData(this.frame, 0, 0);
    this.present();
    this.drawOverlay();
  }

  /**
   * Composite the contact shadows the sprite blit left translucent.
   *
   * The extract writes a CST foot pancake as `(0, 0, 0, ~120)`, and
   * `blitSpriteZ` deliberately preserves that alpha — the play modes hand
   * the buffer to a texture, where it blends. This stage canvas is
   * `alpha: false`, which forces every pixel opaque, so an untouched
   * shadow lands as a **solid black blob** under the sprite. Harmless at
   * chicken size; a boss-sized one is a hole in the street.
   *
   * The film plate is still intact in its own buffer, so the fix is to
   * blend those pixels back over the original ground and re-opaque them.
   * Only shadow pixels are ever below 255, so this is a cheap pass.
   */
  private blendContactShadows(still: ImageData): void {
    const dst = this.frame.data;
    const src = still.data;
    for (let i = 3; i < dst.length; i += 4) {
      const a = dst[i]!;
      if (a === 255) {
        continue;
      }
      const t = a / 255;
      const inv = 1 - t;
      dst[i - 3] = dst[i - 3]! * t + src[i - 3]! * inv;
      dst[i - 2] = dst[i - 2]! * t + src[i - 2]! * inv;
      dst[i - 1] = dst[i - 1]! * t + src[i - 1]! * inv;
      dst[i] = 255;
    }
  }

  /** Blit every sprite into the frame buffer, depth-tested and far-to-near. */
  private compose(now: number, zPlane: Uint8Array | null): void {
    const cam = this.camera();
    const items: DrawItem[] = [];
    this.pickBirds = [];

    for (const bird of this.birds) {
      const hit = projectSprite({ x: bird.x, y: bird.y, z: 0 }, cam);
      if (!hit) {
        continue;
      }
      const frame = this.birdFrame(bird, cam);
      if (!frame) {
        continue;
      }
      const bits = this.sprites.frameBits(CST_EXTRA, frame);
      if (!bits) {
        continue;
      }
      const scale = engineStillScale(BIRD_SCALE, hit.lensForward, CST_SCALE_FIELD);
      const tl = spriteStillTopLeft(hit.x, hit.y, frame, scale);
      this.pickBirds.push(bird);
      items.push({
        forward: hit.forward,
        bits,
        dx: tl.x,
        dy: tl.y,
        scale,
        // Pin the billboard to the ground it stands on, but let a facade
        // that is genuinely nearer keep the pixels.
        z: groundSpriteZ(exeSpriteZ(hit.lensForward), zPlane, hit.x, hit.y),
        pickId: this.pickBirds.length,
        claims: true,
      });
    }

    for (let i = 0; i < this.bosses.length; i += 1) {
      const boss = this.bosses[i]!;
      const hit = projectSprite({ x: boss.x, y: boss.y, z: 0 }, cam);
      const frame = hit ? this.bossFrame(boss, cam) : undefined;
      const bits = frame ? this.sprites.frameBits(`CST/${boss.spec.cast}`, frame) : undefined;
      if (hit && frame && bits) {
        const scale = engineStillScale(boss.scale, hit.lensForward, CST_SCALE_FIELD);
        const tl = spriteStillTopLeft(hit.x, hit.y, frame, scale);
        // A sprite the sheet hangs *below* its hotspot has to be lifted so
        // its base lands on the ground point — see `BossSpec.anchor`.
        const lift =
          boss.spec.anchor === "bottom"
            ? (frame.y + frame.h - SPRITE_HOTSPOT_Y) * scale
            : 0;
        items.push({
          forward: hit.forward,
          bits,
          dx: tl.x,
          dy: tl.y - lift,
          scale,
          z: groundSpriteZ(exeSpriteZ(hit.lensForward), zPlane, hit.x, hit.y),
          pickId: PICK_BOSS_BASE + i,
          claims: true,
        });
      }
    }

    for (const ex of this.explosions) {
      const hit = projectSprite({ x: ex.x, y: ex.y, z: 0 }, cam);
      if (!hit) {
        continue;
      }
      const index = EXPLODE_FIRST_PLATE + Math.floor((now - ex.startedAt) / EXPLODE_FRAME_MS);
      const frame = this.explodeFrames[index];
      if (!frame) {
        continue;
      }
      const bits = this.sprites.frameBits(PRP_HOUSE, frame);
      if (!bits) {
        continue;
      }
      const scale = engineStillScale(ex.scale, hit.lensForward, PRP_SCALE_FIELD);
      const tl = spriteStillTopLeft(hit.x, hit.y, frame, scale);
      items.push({
        // A fireball paints over the bird it replaced.
        forward: hit.forward - 0.5,
        bits,
        dx: tl.x,
        dy: tl.y,
        scale,
        z: groundSpriteZ(exeSpriteZ(hit.lensForward), zPlane, hit.x, hit.y),
        // A fireball is scenery. If it claimed pixels, the bird standing
        // behind one would be unshootable for the blast's whole 675 ms.
        pickId: PICK_OVERLAY,
        claims: false,
      });
    }

    for (const item of paintFarToNear(items)) {
      blitSpriteZ(
        this.frame.data,
        item.claims ? this.pick : this.overlayPick,
        item.pickId,
        zPlane,
        item.z,
        item.bits,
        item.dx,
        item.dy,
        item.scale,
      );
    }

    this.composeGun();
  }

  /**
   * The hand sits on the lens, so it takes no depth test and no Z plane —
   * it is in front of the whole town by definition.
   *
   * It also takes no part in **picking**. The hand covers the lower middle
   * of the frame, and letting it own those pixels made the birds closest
   * to you unshootable: the click landed on the gun and read as a miss.
   * Its blit goes to a throwaway pick buffer so the real one keeps the
   * bird ids underneath, and you can shoot straight through your own hand.
   */
  private composeGun(): void {
    const pose = gunPose(
      this.crosshair.x,
      this.crosshair.y,
      STILL_WIDTH,
      STILL_HEIGHT,
      this.shotFrame < 0 ? -1 : this.gameFrames - this.shotFrame,
    );
    const frames = this.gunFrames[pose.state] ?? this.gunFrames[pose.state.toLowerCase()];
    const frame = frames?.[Math.min(pose.step, frames.length - 1)];
    if (!frame) {
      return;
    }
    const bits = this.sprites.frameBits(PRP_HOUSE, frame);
    if (!bits) {
      return;
    }
    // Screen overlay, 1:1: the sheet's own coordinates *are* the screen
    // coordinates, which is what `projectWorld` does for a `screen` prop —
    // it returns the prop's x/y untouched. So the hotspot maps to itself
    // and the frame lands at (frame.x, frame.y).
    //
    // Do not re-centre this on the still's midline. Every gunhand band is
    // anchored to bottom = 291, i.e. it hangs off the bottom edge of the
    // 264-tall window; shifting it up by the 60px difference leaves the
    // hand floating in mid-air with a gap beneath it.
    const tl = spriteStillTopLeft(SPRITE_HOTSPOT_X, SPRITE_HOTSPOT_Y, frame, 1);
    blitSpriteZ(this.frame.data, this.overlayPick, PICK_OVERLAY, null, 0, bits, tl.x, tl.y, 1);
  }

  /**
   * HUD and minimap, drawn on the **display** canvas at device resolution
   * rather than into the 512x264 film buffer.
   *
   * The buffer is the film, and the film is 512x264 — blowing it up with
   * nearest-neighbour is the whole look. But chrome drawn into it inherits
   * that: at a typical window the stage is scaled about 7x, so a 104px map
   * panel had 104 real pixels of the town plan in it and read as mush.
   *
   * Drawing under the same letterbox transform keeps every coordinate in
   * still space — so hit-testing is unchanged — while the map plate, the
   * blips and the text all render at whatever the monitor actually has.
   */
  private drawOverlay(): void {
    const s = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const fit = Math.min(cw / STILL_WIDTH, ch / STILL_HEIGHT);
    s.save();
    s.translate((cw - STILL_WIDTH * fit) / 2, (ch - STILL_HEIGHT * fit) / 2);
    s.scale(fit, fit);
    // The film stays nearest-neighbour; the chrome does not have to be.
    s.imageSmoothingEnabled = true;
    this.paintOverlay(s);
    s.restore();
    s.imageSmoothingEnabled = false;
  }

  private paintOverlay(s: CanvasRenderingContext2D): void {
    s.save();
    s.textBaseline = "top";

    if (this.status) {
      s.fillStyle = "rgba(0,0,0,0.7)";
      s.fillRect(0, STILL_HEIGHT / 2 - 14, STILL_WIDTH, 28);
      s.fillStyle = "#f3e6c8";
      s.font = "12px Palatino, serif";
      s.textAlign = "center";
      s.fillText(this.status, STILL_WIDTH / 2, STILL_HEIGHT / 2 - 8);
      s.restore();
      return;
    }

    s.fillStyle = "rgba(10,6,4,0.72)";
    s.fillRect(0, 0, STILL_WIDTH, 18);
    s.fillStyle = "#f3e6c8";
    s.font = "11px Palatino, serif";
    s.textAlign = "left";
    s.fillText(`SCORE ${this.run.score}`, 6, 4);
    s.textAlign = "center";
    s.fillText(`WAVE ${this.run.wave}`, STILL_WIDTH / 2, 4);
    s.textAlign = "right";
    s.fillStyle = this.run.ammo <= 4 ? "#ff8b6a" : "#f3e6c8";
    s.fillText(`SHELLS ${this.run.ammo}`, STILL_WIDTH - 6, 4);

    if (this.bosses.length > 0) {
      const left = this.bosses.reduce((sum, b) => sum + b.hits, 0);
      const full = this.bosses.reduce((sum, b) => sum + b.maxHits, 0);
      const w = 120;
      const x = (STILL_WIDTH - w) / 2;
      s.fillStyle = "rgba(10,6,4,0.7)";
      s.fillRect(x - 1, 21, w + 2, 6);
      s.fillStyle = "#e23a2b";
      s.fillRect(x, 22, Math.max(0, (left / Math.max(1, full)) * w), 4);
      if (this.bosses.length > 1) {
        s.fillStyle = "#ffd9a8";
        s.font = "9px Palatino, serif";
        s.textAlign = "left";
        s.fillText(`x${this.bosses.length}`, x + w + 5, 20);
      }
    }


    const banner = this.banner;
    if (banner && performance.now() < banner.until) {
      s.textAlign = "center";
      s.font = banner.big ? "16px Palatino, serif" : "12px Palatino, serif";
      s.fillStyle = "rgba(10,6,4,0.6)";
      const width = s.measureText(banner.text).width + 16;
      s.fillRect((STILL_WIDTH - width) / 2, 34, width, banner.big ? 24 : 18);
      s.fillStyle = banner.big ? "#ffd9a8" : "#f3e6c8";
      s.fillText(banner.text, STILL_WIDTH / 2, banner.big ? 38 : 36);
    }

    // No minimap over the death card — nothing on it is live any more.
    if (this.run.over) {
      this.paintDeathCard(s);
      s.restore();
      return;
    }

    drawMinimap(s, {
      rect: minimapRect(STILL_HEIGHT),
      open: this.mapOpen,
      paper: this.mapPaper,
      birds: this.birds,
      bosses: this.bosses.map((b) => ({ x: b.x, y: b.y })),
      player: { x: this.pose.x, y: this.pose.y, facing: this.pose.facing },
    });

    s.restore();
  }

  /** The card you get when the belt runs dry, over the coffin reel. */
  private paintDeathCard(s: CanvasRenderingContext2D): void {
      // The reel itself is painted into the frame buffer by `render`, so
      // it scales with the film. Only the wash and the score go here.
      //
      // Light on the wash: the parlour is a dark plate to begin with, and
      // burying it under another 55% of black left the coffin invisible.
      // The text carries its own shadow instead, so it stays readable
      // without hiding the thing it is sitting on.
      s.fillStyle = "rgba(10,6,4,0.3)";
      s.fillRect(0, 0, STILL_WIDTH, STILL_HEIGHT);
      s.shadowColor = "rgba(0,0,0,0.95)";
      s.shadowBlur = 6;
      s.textAlign = "center";
      s.fillStyle = "#f3e6c8";
      s.font = "22px Palatino, serif";
      s.fillText("OUT OF SHELLS", STILL_WIDTH / 2, 88);
      s.font = "13px Palatino, serif";
      s.fillText(`Score ${this.run.score}`, STILL_WIDTH / 2, 124);
      s.fillText(`Reached wave ${this.run.wave}`, STILL_WIDTH / 2, 142);
      s.fillText(`Longest chain ${this.run.bestChain}`, STILL_WIDTH / 2, 160);
      if (this.diedAt > 0 && performance.now() - this.diedAt >= DEATH_CARD_GRACE_MS) {
        s.fillStyle = "#ffd9a8";
        s.font = "14px Palatino, serif";
        s.fillText("Click to go again", STILL_WIDTH / 2, 186);
      }
      s.fillStyle = "#c4a15a";
      s.font = "12px Palatino, serif";
      s.fillText("Esc for the Sideshow", STILL_WIDTH / 2, 208);
      s.shadowBlur = 0;
    }

  private present(): void {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cw, ch);
    const fit = Math.min(cw / STILL_WIDTH, ch / STILL_HEIGHT);
    const w = STILL_WIDTH * fit;
    const h = STILL_HEIGHT * fit;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.stage, (cw - w) / 2, (ch - h) / 2, w, h);
  }
}

function preventDefault(ev: Event): void {
  ev.preventDefault();
}
