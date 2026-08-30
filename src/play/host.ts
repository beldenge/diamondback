import type { Proc } from "../vm/ast";
import { num, str, VM, type OpcodeHost, type Point, type Value } from "../vm/runtime";
import { extractUrl } from "../world/set/extract";
import type { Dir, SetGraph, WalkerPose } from "../world/set/types";
import {
  cameraZOf,
  lightingFamily,
  loadSetGraph,
  parseDir,
  sceneByName,
  setNamesEqual,
  tileKey,
  WORLD_TOWN,
} from "../world/set/graph";
import { routeToStar, TILE_SPAN, type RoutePoint, type StarPath } from "../world/set/path";
import {
  actorSprite,
  calcDeg,
  calcVect,
  cameraFromPose,
  cameraWorldPoint,
  CST_SCALE_FIELD,
  degDelta,
  dirToDeg,
  DRINK_HOLD_FRAMES,
  dustTicksToMs,
  actorFeetInFront,
  gameFrameSec,
  remainingGameFrameMs,
  playerWorldPoint,
  PRP_SCALE_FIELD,
  pointInSpriteDest,
  spriteDestRect,
  timingForPose,
  worldSpriteHitsPoint,
  worldToStill,
  wrapDeg,
  type StillHit,
} from "./facing";
import type { ViewCamera } from "./facing";
import {
  doorOpenedStillMatches,
  doorOverlayDestRect,
  isDoorOverlay,
  propStillScale,
} from "./occlude";
import { ScriptIndex, loadScriptJson } from "./scripts";
import {
  dustIdleInterval,
  dustTick,
  PUPPET_IDLE_CLIPS,
  PUPPET_IDLE_SPEAK_MIN_TICKS,
  puppetIdleCaption,
  puppetIdleDurationUnits,
  puppetIdleKind,
  puppetTicksToMs,
  mergePuppetRest,
  scrambleInPlace,
  type PuppetSheet,
  type PuppetUi,
  type SpritePlace,
  type VisemeLine,
} from "./ui";
import { voices } from "./speech";
import { gunhandWantsSight, isInventoryHudView, propViewFrame } from "./hud";
import {
  HOUSE_GROUPS,
  INVEN_GROUPS,
  propScriptRels,
  puzzlePropScriptRels,
  puzzleShopScriptRels,
  shopScriptRels,
  stageScriptRels,
} from "./propCatalog";
import { checkMove } from "./checkers";
import {
  findWord,
  flatPropItem,
  hitFlatButton,
  isPuzzleStage,
  isReaderBorderProp,
  isReaderStage,
  pointHitsFlatItem,
  pointHitsReaderBorder,
  pointInMacRect,
  putWord,
  shopFileOf,
  substringIndex,
  upsertPuzzleLabel,
  type FlatHit,
  type PuzzleBoard,
  type PuzzleLabel,
} from "./puzzle";
import {
  actionFrameAfterPlay,
  clipUrl,
  fallbackTimeline,
  frameUrl,
  isIntroMovie,
  movieChainName,
  movieFolder,
  type MovieHotspot,
  type MovieTimeline,
} from "./movies";
import {
  countSounds,
  indexToSound,
  isGossipTrack,
  sndFolderFromFile,
  trackClipNames,
} from "./sndTracks";
import {
  isTownGridSize,
  openSetShouldStand,
  parseScriptScene,
  poseForOpenedSet,
  scriptSceneName,
} from "./sceneName";
import {
  applySandboxStoryFlags,
  hideRangeCastOffSet,
  hideSandboxGroundPickups,
  hideSandboxStoryActors,
  sandboxEquipMineMask,
  sandboxFountainOpensHub,
  sandboxFountainProc,
  sandboxHubSundialMousedown,
  sandboxHubSundialScene,
  sandboxHubSundialSetcursor,
  sandboxShowMineMask,
  sandboxLeroyRangeRunyoself,
  sandboxLeroyRangeTalk,
  sandboxInventoryToSeed,
  sandboxIsApoth,
  sandboxApothBottlesClick,
  sandboxBankCrackClick,
  sandboxBankSignMousedown,
  sandboxBindApothBottles,
  sandboxBottlesMousedown,
  sandboxBottlesSetcursor,
  sandboxDellMousedown,
  sandboxDellTownClick,
  sandboxFightActor,
  sandboxFightKind,
  sandboxFightKindOf,
  sandboxFightOn,
  sandboxFightPutdown,
  sandboxFightScout,
  sandboxFightScoutClick,
  sandboxFightScoutHit,
  sandboxFightIdleHitProc,
  sandboxFightHotdist,
  sandboxFightScoutMousedown,
  hideSandboxIdleFighters,
  SANDBOX_TOYS,
  sandboxToyKind,
  sandboxToyLookPose,
  type SandboxToyKind,
  sandboxKidMousedown,
  sandboxKidTownClick,
  sandboxOpenKidProc,
  sandboxPuzzletime,
  sandboxRangeAnimalsToSeed,
  sandboxSkipRangeWalkWait,
  sandboxTownFightHitProc,
  sandboxTownAnimalsToSeed,
  sandboxTownSetFile,
} from "./sandbox";
import { isClockSlot, type ClockSlot } from "../core/time";

type PuppetLine = { text: string; wav: string; viseme?: VisemeLine };

export interface Waypoint {
  x: number;
  y: number;
  name: string;
}

export interface ActorState {
  name: string;
  cast: string;
  visible: boolean;
  set: string;
  star: string;
  x: number;
  y: number;
  z: number;
  deg: number;
  scale: number;
  pose: string;
  owner: string;
  value: number;
  /** Dust `variable (me)` — bounty/kidgang walkloop state. */
  variable: number;
  /** Dust `actorhitbox` / printed `currentcd`. */
  hitboxW: number;
  hitboxH: number;
  speed: number;
  turnSpeed: number;
  walking: boolean;
  turning: boolean;
  destX: number;
  destY: number;
  destZ: number;
  /**
   * Named `walktostar` dest (or `"x,y,z"`). `walkdest` returns this while
   * walking so Cast `walktopuppet` can resume a star, not `"0,0,0"`.
   */
  destStar: string;
  /** Remaining SET polyline hops after the current `dest*` (named `walktostar`). */
  route: RoutePoint[];
  degTarget: number;
  walkStep: number;
  walkAcc: number;
  /** CST setInfo +0x2e tables keyed by pose name (`walk`, `drink`, …). */
  poseTiming: Record<string, number[]>;
  /** Active +0x2e table for `actor.pose` (1-based pose ids). */
  walkTiming: number[];
  zclip: number;
  standSprites: SpritePlace[];
  walkSprites: SpritePlace[];
  drinkSprites: SpritePlace[];
  sprites: Record<string, SpritePlace[]>;
  spriteRoot: string;
  standUrl?: string;
  /** `actorxy` still placement (TARGET bottles/cans/plates). */
  screen: boolean;
  /** Dust `actoris3d` — world `actorxyz` even on the range SET. */
  is3d: boolean;
}

export interface PropState {
  name: string;
  shop: string;
  visible: boolean;
  owner: string;
  view: string;
  set: string;
  star: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  deg: number;
  value: number;
  speed: number;
  zclip: number;
  sprites: Record<string, SpritePlace[]>;
  spriteRoot: string;
  /** `propxy` still/HUD placement (gunhand on TARGET). */
  screen: boolean;
  /** PRP setInfo +0x2e tables keyed by `propview` (avatar nitehattip, …). */
  poseTiming: Record<string, number[]>;
  /** Game frames since the current view; used with `poseTiming`. */
  animTick: number;
  /** Dust `propdist` — 2D z-order on puzzle flats (more negative draws later). */
  dist: number;
  /** Scene + facing when `setupprop` showed this HOUSE door overlay. */
  openedAt?: { scene: string; facing: string };
  ball?: { vx: number; vy: number; vz: number; remaining: number };
}

interface ScriptLoop {
  kind: string;
  who: string;
  proc: string;
  delay: number;
  remaining: number;
  paused: boolean;
}

export interface WorldView {
  pose: WalkerPose;
  world: string;
  graph: SetGraph;
  walk(kind: "strait" | "left" | "right"): void;
  setPose(world: string, pose: WalkerPose): Promise<void>;
  /** Unlocked N: swap court/school day↔night stills; keep pose. */
  swapLighting?(): Promise<void>;
  log(message: string): void;
  refreshActors(): void;
  /** Camera during a SET filmstrip; defaults to the standing pose. */
  viewCamera?(): ViewCamera;
  /** Sprite still-position; filmstrips reproject with the SET camera. */
  projectWorld?(obj: { x: number; y: number; z?: number; screen?: boolean }): StillHit | null;
  playMovie?(
    frames: {
      url: string;
      holdSec: number;
      action?: number;
      wait?: boolean;
      hotspots?: MovieHotspot[];
      timeoutMovie?: string;
    }[],
    clips: { url: string; startSec: number; channel?: string }[],
    opts?: { keepLayer?: boolean },
  ): Promise<boolean | void>;
  /** Hide the movie layer after a `keepLayer` chain (towerup → towertop → towerdn). */
  endMovie?(): void;
  /** Dust `screentoblack` / `blacktoscreen` ticks (60 Hz). */
  fadeToBlack?(ticks: number): Promise<void>;
  fadeFromBlack?(ticks: number): Promise<void>;
  cutToBlack?(): void;
  /** Dust `mixclut` amount 0–255 as a full-stage fade (hub darkness). */
  setFadeOpacity?(opacity: number): void;
  /** SALGAMES / other FLT boards covering the 512×384 stage. */
  showPuzzle?(board: PuzzleBoard | null): void;
  /** TARGET.FLT `drawstring` scores on the range HUD (not a puzzle flat). */
  showHudLabels?(labels: PuzzleLabel[]): void;
  /** NEW.FLT `gotoflat ("avatar")` after a reader closes. */
  showHudFlat?(name: string): void;
  setWorldVisible?(on: boolean): void;
}

/** Scene dumps that actually contain scripts (not every cell in the 225 table). */
const TOWN_SCENE_FILES = [
  "Scene A7", "Scene B11", "Scene C5", "Scene C12", "Scene D7", "Scene D8",
  "Scene D10", "Scene E4", "Scene E12", "Scene F11", "Scene G4", "Scene G5",
  "Scene G6", "Scene G8", "Scene G9", "Scene G10", "Scene G12", "Scene G14",
  "Scene H11", "Scene J6", "Scene J9", "Scene K11",
];

const SET_FILE: Record<string, string> = {
  "town.set": "_TOWN",
  "nite.set": "_NITE",
  "hotlower.set": "_HOTLOWER",
  "hotupper.set": "_HOTUPPER",
  "hotroom.set": "_HOTROOM",
  "sallower.set": "_SALLOWER",
  "salupper.set": "_SALUPPER",
  "salroom.set": "_SALROOM",
  "jail.set": "_JAIL",
  "bank.set": "_BANK",
  "store.set": "_STORE",
  "apoth.set": "_APOTH",
  "chin.set": "_CHIN",
  "court.set": "_COURT",
  "nitecour.set": "_NITECOUR",
  "school.set": "_SCHOOL",
  "nitescho.set": "_NITESCHO",
  "padre.set": "_PADRE",
  "paper.set": "_PAPER",
  "livery.set": "_LIVERY",
  "stage.set": "_STAGE",
  "doctor1.set": "_DOCTOR1",
  "doctor2.set": "_DOCTOR2",
  "mayhall.set": "_MAYHALL",
  "maydine.set": "_MAYDINE",
  "mayroom.set": "_MAYROOM",
  "maystudy.set": "_MAYSTUDY",
  "mayupper.set": "_MAYUPPER",
  "undertak.set": "_UNDERTAK",
  "hub.set": "_HUB",
  "mine.set": "_MINE",
  "snake.set": "_SNAKE",
  "flute.set": "_FLUTE",
  "tbird.set": "_TBIRD",
  "target.set": "_TARGET",
};

/**
 * `horse2` / `chicken3` share `horse1` / `chicken1` scripts. `birdtarg2`
 * shares `birdtarg`. Exact folder names win.
 */
export function actorTemplateFolder(
  name: string,
  folders: readonly string[],
): string | undefined {
  const key = name.toLowerCase();
  const exact = folders.find((folder) => folder.toLowerCase() === key);
  if (exact) {
    return exact;
  }
  const m = /^(.+?)(\d+)$/.exec(key);
  if (!m || m[2] === "1") {
    return undefined;
  }
  const base = m[1];
  return (
    folders.find((folder) => folder.toLowerCase() === `${base}1`) ??
    folders.find((folder) => folder.toLowerCase() === base)
  );
}

export class DustHost implements OpcodeHost {
  readonly index = new ScriptIndex();
  readonly actors = new Map<string, ActorState>();
  readonly props = new Map<string, PropState>();
  waypoints = new Map<string, Waypoint>();
  paths: StarPath[] = [];
  currentSet = "none";
  currentSetFile = "";
  currentScene = "";
  currentDir: Dir | string = "N";
  currentPuppet = "none";
  readonly puppetNames: string[] = [];
  /** `texts.csv` rows per PUP folder. `puppetLines` is the open file’s bag. */
  private puppetLineBags = new Map<string, Map<string, PuppetLine>>();
  private loosePuppetLines = new Map<string, PuppetLine>();
  private visemeLines = new Map<string, VisemeLine>();
  private visemeLoads = new Map<string, Promise<VisemeLine | undefined>>();
  private currentPuppetFolder = "";
  private loadedPuppets = new Set<string>();
  private puppetSheets = new Map<string, PuppetSheet>();
  private puppetWavs = new Map<string, string[]>();
  private puppetIdents = new Map<string, string[]>();
  private puppetScriptBag = new Map<
    string,
    { label: string; rel: string; procs: Proc[] }[]
  >();
  private bevels: { id: number; label: string }[] = [];
  framerateValue = 3;
  /** `random (n)` → `1..n`. Dust switches and `town.extra` @ numtostring use 1-based
   * (`scream1..3`, `extra1..3`, pig `findscene` 1..6). */
  rng = Math.random;
  nowMs = (): number => performance.now();
  frameCounter = 0;
  /** Nested `forceupdate` count. Game tick must not also step actors. */
  scriptPump = 0;
  /**
   * Outer `runQueued` is in flight (idle `hasattention` → `walktopuppet`).
   * Nested `forceupdate` runQueued still runs (`scriptPump > 0`).
   */
  scriptBusy = false;
  private walksPaused = false;
  private ballsPaused = false;
  private readonly loops = new Map<string, ScriptLoop>();
  private readonly dueLoops: ScriptLoop[] = [];
  private readonly walkEnds: string[] = [];
  private readonly turnEnds: string[] = [];
  private loopAcc = 0;
  view: WorldView | null = null;
  skipMovies = true;
  /**
   * Dust: Unlocked. Same PlayGame / VM as Resurrected; skip story
   * `advanceday`, force `debugging` so lock* procs open, keep
   * minigame NPCs (Leroy, Bolivar, TARGET) and farm animals (not the dog).
   */
  sandbox = false;
  /** Unlocked `?clock=` (default afternoon). Story ignores this. */
  sandboxClock: ClockSlot | undefined;
  /** Top-bar spawns. Re-placed after `initall` / N; fight scouts drop on `closefight`. */
  private readonly sandboxToyPlacements = new Map<string, { scene: string; deg: number }>();
  /**
   * Boot starts with `blackscreen()` for the intro movies. When those
   * movies are skipped, keep the spawn still up instead of wiping it.
   */
  skipBootBlack = false;
  /**
   * Last `mixclut` fade 0–1. Hub `mixclut ("set", "black", …, count)` is
   * an absolute plate. Fight `fadetoblack` is `("current", "black", …, 20)`
   * stepped from this value; treating 20/255 as the whole plate never KO'd.
   */
  private fadeMix = 0;
  /** Escape during `puppetspeak` skips remaining lines until choices. */
  skipSpeech = false;
  currentVoice = "none";
  currentTheme = "none";
  cursorName = "arrow";
  pointer: Point = { kind: "point", x: 256, y: 132, z: 0 };
  /** Last `hittest` kind (`actor` / `prop` / `scene` / `flat` / `none`). */
  hitKind = "none";
  /** True when the last click was consumed (actor/prop/handled scene). */
  clickAbsorbed = false;
  stillDown = false;
  /** Town play is the NEW.FLT `mainpanel` under the still. */
  currentFlatName = "mainpanel";
  /** Last finished `playmovie`. Scripts read `actionframe (1)`. */
  lastActionFrame = 0;
  private puppetShown = false;
  private trackFolder = "_UNILIB";
  private readonly trackStack: string[] = [];
  private bedStop: (() => void) | null = null;
  private bedGen = 0;
  private pendingBed: string | null = null;
  private loopSounds = new Map<string, () => void>();
  private loopGen = 0;
  private soundVolumes = new Map<string, number>();
  private shopSprites = new Map<string, Record<string, Record<string, SpritePlace[]>>>();
  private readonly missingScripts = new Set<string>();
  private readonly scriptProcs = new Map<string, Proc[]>();
  private readonly loadedCasts = new Set<string>();
  private readonly loadedShops = new Set<string>();
  private readonly loadedActorScripts = new Set<string>();
  private readonly actorScriptLoads = new Map<string, Promise<void>>();
  private readonly castBags = new Map<
    string,
    {
      dir: string;
      folders: string[];
      sprites: Record<string, Record<string, SpritePlace[]>>;
      timing: Record<string, Record<string, number[]>>;
    }
  >();
  private readonly setGraphs = new Map<string, SetGraph>();
  private readonly waypointBags = new Map<string, { points: Waypoint[]; paths: StarPath[] }>();
  /** FLT `flats.json` names, 1-based for `gotoflat (2)`. */
  private stageFlatNames: string[] = ["mainpanel"];
  currentStageName = "new";
  private worldVisible = true;
  private puzzleShop = "";
  /** `shopwarm ("puzzle")` after `openshopfile ("snake.prp")`. */
  private readonly shopAliases = new Map<string, string>();
  /** Group names created by `openshopfile` (not `propinstance` clones). */
  private readonly puzzleGroups = new Map<string, Set<string>>();
  private readonly stageStills = new Map<string, string>();
  private readonly stageHits = new Map<string, FlatHit[]>();
  private puzzleLabels: PuzzleLabel[] = [];
  private currentSoundName = "none";
  private soundGen = 0;
  private puppetSheet: PuppetSheet | null = null;
  private gangSprites: Record<string, Record<string, SpritePlace[]>> = {};
  private playerHitW = 0;
  private playerHitH = 0;

  constructor(readonly ui: PuppetUi) {}

  lookup(name: string, ctx: VM): Proc | undefined {
    if (this.sandboxSuppress(name)) {
      return undefined;
    }
    const range = this.sandboxLeroyRange(name, ctx);
    if (range) {
      return range;
    }
    const fountain = this.sandboxFountain(name);
    if (fountain) {
      return fountain;
    }
    const sundial = this.sandboxHubSundial(name);
    if (sundial) {
      return sundial;
    }
    const toy = this.sandboxPlaceToy(name, ctx);
    if (toy) {
      return toy;
    }
    return this.index.lookup(this.lookupKeys(ctx), name);
  }

  lookupChain(name: string, ctx: VM): Proc[] {
    if (this.sandboxSuppress(name)) {
      return [];
    }
    const range = this.sandboxLeroyRange(name, ctx);
    if (range) {
      return [range];
    }
    const fountain = this.sandboxFountain(name);
    if (fountain) {
      return [fountain];
    }
    const sundial = this.sandboxHubSundial(name);
    if (sundial) {
      return [sundial, ...this.index.lookupAll(this.lookupKeys(ctx), name)];
    }
    const toy = this.sandboxPlaceToy(name, ctx);
    if (toy) {
      if (name.toLowerCase() === "mousedown" && sandboxBankCrackClick(this.currentSet, ctx.object, ctx.me)) {
        return [toy, ...this.index.lookupAll(this.lookupKeys(ctx), name)];
      }
      return [toy];
    }
    return this.index.lookupAll(this.lookupKeys(ctx), name);
  }

  /** Unlocked replaces extracted `advanceday` (Day 1 night + story casts). */
  private sandboxSuppress(name: string): boolean {
    if (!this.sandbox) {
      return false;
    }
    const op = name.toLowerCase();
    return op === "advanceday" || op === "openfight" || op === "closefight";
  }

  private sandboxLeroyRange(name: string, ctx: VM): Proc | undefined {
    if (
      !this.sandbox ||
      name.toLowerCase() !== "runyoself" ||
      !sandboxLeroyRangeTalk(this.currentPuppet, ctx.object, ctx.me)
    ) {
      return undefined;
    }
    return sandboxLeroyRangeRunyoself();
  }

  private sandboxFountain(name: string): Proc | undefined {
    if (
      !this.sandbox ||
      name.toLowerCase() !== "fountain" ||
      !sandboxFountainOpensHub(this.currentSet)
    ) {
      return undefined;
    }
    return sandboxFountainProc();
  }

  private sandboxHubSundial(name: string): Proc | undefined {
    if (!this.sandbox || this.currentSet !== "hub" || !sandboxHubSundialScene(this.currentScene)) {
      return undefined;
    }
    const op = name.toLowerCase();
    if (op === "setcursor") {
      return sandboxHubSundialSetcursor();
    }
    if (op === "mousedown") {
      return sandboxHubSundialMousedown();
    }
    return undefined;
  }

  /**
   * Unlocked place-toys: bank crack, apoth compounding, Dell fight, Kid
   * duel. Fake only the story gate; extracted FLT/SET procs still run.
   */
  private sandboxPlaceToy(name: string, ctx: VM): Proc | undefined {
    if (!this.sandbox) {
      return undefined;
    }
    const op = name.toLowerCase();
    if (op === "puzzletime" && sandboxIsApoth(this.currentSet)) {
      return sandboxPuzzletime();
    }
    if (op === "openkid") {
      return sandboxOpenKidProc();
    }
    if (op === "hit" && ctx.object === "set") {
      return sandboxTownFightHitProc();
    }
    if (
      op === "hit" &&
      ctx.object === "actor" &&
      sandboxFightActor(ctx.me) &&
      !sandboxFightOn(ctx.globals.get("fighton"))
    ) {
      const kind = sandboxFightKindOf(ctx.me);
      return kind ? sandboxFightScoutHit(kind) : sandboxFightIdleHitProc();
    }
    if (op === "hotdist" && ctx.object === "actor" && sandboxFightActor(ctx.me)) {
      return sandboxFightHotdist();
    }
    if (
      sandboxApothBottlesClick(this.currentSet, ctx.object, ctx.me) &&
      (op === "mousedown" || op === "setcursor")
    ) {
      return op === "setcursor" ? sandboxBottlesSetcursor() : sandboxBottlesMousedown();
    }
    if (op !== "mousedown") {
      return undefined;
    }
    if (sandboxBankCrackClick(this.currentSet, ctx.object, ctx.me)) {
      return sandboxBankSignMousedown();
    }
    if (
      sandboxDellTownClick(this.currentSet, ctx.object, ctx.me) &&
      !this.currentStageName.toLowerCase().includes("fight")
    ) {
      return sandboxDellMousedown();
    }
    if (sandboxKidTownClick(this.currentSet, ctx.object, ctx.me)) {
      return sandboxKidMousedown();
    }
    if (
      sandboxFightScoutClick(
        this.currentSet,
        ctx.object,
        ctx.me,
        ctx.globals.get("fighton"),
      )
    ) {
      const kind = sandboxFightKindOf(ctx.me);
      if (kind) {
        return sandboxFightScoutMousedown(kind);
      }
    }
    return undefined;
  }

  async ensureObject(object: string, name: string): Promise<void> {
    if (object !== "actor" || !name) {
      return;
    }
    await this.ensureActor(name);
  }

  lookupKeys(ctx: VM): string[] {
    const keys: string[] = [];
    const me = (ctx.me || "").toLowerCase();
    if (ctx.object === "actor" && me) {
      keys.push(`actor:${me}`);
      const actor = this.actors.get(me);
      keys.push(`cast:${actor?.cast || "gang"}`);
    } else if (ctx.object === "cast" && me) {
      keys.push(`cast:${libraryStem(me)}`);
    } else if (ctx.object === "shop" && me) {
      keys.push(`shop:${libraryStem(me)}`);
    } else if (ctx.object === "prop" && me) {
      keys.push(`prop:${me}`);
      const prop = this.props.get(me);
      if (prop?.shop) {
        keys.push(`shop:${prop.shop}`);
      }
    } else if (ctx.object === "puppet") {
      if (me) {
        keys.push(`puppet:${me}`);
      }
      keys.push("puppet:boot script");
    } else if (ctx.object === "scene" && me) {
      keys.push(`scene:${me.toLowerCase()}`);
      keys.push("set");
    } else if (ctx.object === "set") {
      keys.push("set");
    } else if (ctx.object === "stage") {
      keys.push("stage");
    } else if (ctx.object === "boot") {
      keys.push("boot");
    } else if (ctx.object === "flat" && me) {
      keys.push(`flat:${me}`);
      keys.push("stage");
    } else if (ctx.object === "button" && me) {
      keys.push(`button:${me}`);
      const parts = me.split(":");
      const flat = parts.length > 1 ? parts[0] : this.currentFlatName;
      const button = parts.length > 1 ? parts.slice(1).join(":") : me;
      if (flat) {
        keys.push(`button:${flat}:${button}`);
        keys.push(`flat:${flat}`);
      }
      keys.push("stage");
    }
    return keys;
  }

  async call(name: string, args: Value[], ctx: VM): Promise<Value> {
    const op = name.toLowerCase();
    switch (op) {
      case "framerate":
        if (args.length) {
          this.framerateValue = num(args[0]);
        }
        return this.framerateValue;
      case "puppetgrab":
      case "keyaborts":
      case "menuvisible":
      case "visualeffect":
        if (isPuzzleStage(this.currentStageName)) {
          this.syncPuzzleView();
        }
        return 0;
      case "clut": {
        const which = str(args[0]).toLowerCase();
        if (which === "black") {
          // Boot `clut ("black")` around skipped intros. Same skip as
          // `blackscreen`. Unlocked never runs extracted `postmovie`
          // (`blacktoscreen`) so a real cut here stuck on a black plate.
          if (!this.skipBootBlack) {
            this.fadeMix = 1;
            this.view?.cutToBlack?.();
          }
        } else if (which === "set" || which === "current" || which === "stage") {
          this.fadeMix = 0;
          this.view?.setFadeOpacity?.(0);
        }
        if (isPuzzleStage(this.currentStageName)) {
          this.syncPuzzleView();
        }
        return 0;
      }
      case "plain":
      case "showcursor":
      case "flushevents":
      case "puppetbase":
        return 0;
      case "blackscreen":
        if (!this.skipBootBlack) {
          this.fadeMix = 1;
          this.view?.cutToBlack?.();
        }
        return 0;
      case "screentoblack": {
        if (this.skipBootBlack) {
          return 0;
        }
        const ticks = fadeTicks(args);
        if (this.view?.fadeToBlack) {
          await this.view.fadeToBlack(ticks);
        }
        this.fadeMix = 1;
        return 0;
      }
      case "blacktoscreen": {
        const ticks = fadeTicks(args);
        if (this.view?.fadeFromBlack) {
          await this.view.fadeFromBlack(ticks);
        }
        this.fadeMix = 0;
        return 0;
      }
      case "halttheme":
        this.stopBed();
        this.currentTheme = "none";
        return 0;
      case "closetrackfile":
        this.closeTrack(str(args[0]));
        return 0;
      case "haltsound":
        this.stopLoopSounds();
        return 0;
      case "haltvoice":
        this.currentVoice = "none";
        voices.stop();
        return 0;
      case "stopball":
        for (const prop of this.props.values()) {
          prop.ball = undefined;
        }
        return 0;
      case "pausewalk": {
        const who = str(args[0] ?? "all").toLowerCase();
        const paused = args.length < 2 ? true : truthyArg(args[1]);
        if (who === "all") {
          this.walksPaused = paused;
          if (paused) {
            this.walkEnds.length = 0;
          }
        }
        return 0;
      }
      case "pausecricket":
      case "pauseball": {
        const who = str(args[0] ?? "all").toLowerCase();
        const paused = args.length < 2 ? true : truthyArg(args[1]);
        if (who === "all") {
          this.ballsPaused = paused;
        }
        return 0;
      }
      case "mixclut": {
        const from = str(args[0]).toLowerCase();
        const to = str(args[1]).toLowerCase();
        const amount = Math.min(1, Math.max(0, num(args[4]) / 255));
        // Hub `gotoblack` walks count 0…255 with from=`set` (absolute).
        // FIGHT `fadetoblack` repeats from=`current` amount 20 (step).
        let opacity: number;
        if (to === "black" && from === "current") {
          opacity = Math.min(1, this.fadeMix + amount);
        } else if (to === "black") {
          opacity = amount;
        } else if (from === "black") {
          opacity = 1 - amount;
        } else {
          opacity = amount;
        }
        this.fadeMix = opacity;
        this.view?.setFadeOpacity?.(opacity);
        return 0;
      }
      case "notedialog":
        return 0;
      case "message":
        this.view?.log(str(args[0]));
        return 0;
      case "button":
        return this.stillDown;
      case "stringlength":
        return str(args[0]).length;
      case "putword":
        return putWord(str(args[0]), str(args[1]), num(args[2]), str(args[3]));
      case "drawstring": {
        const at = asPoint(args[1]);
        const size = Math.max(8, num(args[3] ?? args[2] ?? 12));
        this.puzzleLabels = upsertPuzzleLabel(this.puzzleLabels, {
          text: str(args[0]),
          x: at.x,
          y: at.y,
          size,
        });
        this.syncPuzzleView();
        return 0;
      }
      case "pointinbutton": {
        const flat = str(args[0]).toLowerCase();
        const raw = str(args[1]).toLowerCase();
        const name = raw.includes(":") ? raw.slice(raw.lastIndexOf(":") + 1) : raw;
        const p = asPoint(args[2] ?? this.pointer);
        const hit = (this.stageHits.get(flat) ?? []).find((row) => row.name.toLowerCase() === name);
        return hit ? pointInMacRect(hit, p.x, p.y) : false;
      }
      case "cursor":
        this.cursorName = str(args[0] || "arrow").toLowerCase();
        return 0;
      case "hidecursor":
        this.cursorName = "watch";
        return 0;
      case "path":
        return 0;
      case "result":
        return ctx.lastResult;
      case "sqrt":
        return Math.sqrt(Math.max(0, num(args[0])));
      case "abs":
        return Math.abs(num(args[0]));
      case "pointx":
        return asPoint(args[0] ?? this.pointer).x;
      case "pointy":
        return asPoint(args[0] ?? this.pointer).y;
      case "mouse":
        return this.pointer;
      case "stilldown":
        return this.stillDown;
      case "makepoint":
        return {
          kind: "point",
          x: num(args[0]),
          y: num(args[1]),
          z: num(args[2]),
        };
      case "pointinset": {
        const p = asPoint(args[0] ?? this.pointer);
        return p.x >= 0 && p.x <= 512 && p.y >= 0 && p.y < 264;
      }
      case "pointinstage": {
        const p = asPoint(args[0] ?? this.pointer);
        return p.x >= 0 && p.x <= 512 && p.y >= 0 && p.y <= 384;
      }
      case "pointinactor": {
        const actor = this.actors.get(str(args[0]).toLowerCase());
        const p = asPoint(args[1] ?? this.pointer);
        return actor?.visible ? this.pointHitsSprite(actor, p) : false;
      }
      case "pointinprop": {
        const prop = this.props.get(str(args[0]).toLowerCase());
        const p = asPoint(args[1] ?? this.pointer);
        return prop?.visible ? this.pointHitsProp(prop, p) : false;
      }
      case "hittest": {
        const name = this.hitTest(
          asPoint(args[0] ?? this.pointer),
          str(ctx.globals.get("handitem") ?? ""),
        );
        ctx.lastResult = this.hitKind;
        return name;
      }
      case "propview":
        return this.propField(ctx, args, "view", (prop, value) => {
          const view = str(value);
          if (prop.view !== view) {
            prop.animTick = 0;
          }
          prop.view = view;
        });
      case "propxy":
        return this.propXy(ctx, args);
      case "propxyz":
        return this.propXyz(ctx, args);
      case "propstar":
        return this.setPropStar(ctx, args);
      case "propset":
        return this.propField(ctx, args, "set", (prop, value) => {
          prop.set = str(value);
        });
      case "propscale":
        return this.propField(ctx, args, "scale", (prop, value) => {
          prop.scale = num(value);
        });
      case "propdeg":
        return this.propField(ctx, args, "deg", (prop, value) => {
          prop.deg = wrapDeg(num(value));
        });
      case "propvalue":
        return this.propField(ctx, args, "value", (prop, value) => {
          prop.value = num(value);
        });
      case "propspeed":
        return this.propField(ctx, args, "speed", (prop, value) => {
          prop.speed = num(value);
        });
      case "propzclip":
        return this.propField(ctx, args, "zclip", (prop, value) => {
          prop.zclip = num(value);
        });
      case "propdist": {
        const prop = this.namedProp(str(args[0] ?? ctx.me));
        if (args.length >= 2) {
          prop.dist = num(args[1]);
          this.view?.refreshActors();
          return prop.dist;
        }
        return this.spriteDist(prop);
      }
      case "actordist": {
        const actor = this.namedActor(str(args[0] ?? ctx.me));
        return this.spriteDist(actor);
      }
      case "realdist": {
        // World feet-to-feet. `actordist` is 32000 off-still; shaman
        // `realdist (me) < hotdist ()` is the talk/touch radius.
        const who = str(args[0] ?? ctx.me ?? ctx.target).toLowerCase();
        const obj = this.actors.get(who) ?? this.namedProp(who);
        if (!this.view) {
          return 32000;
        }
        const p = playerWorldPoint(this.view.pose);
        return Math.hypot(obj.x - p.x, obj.y - p.y);
      }
      case "propscript": {
        const who = str(args[0] || ctx.me || ctx.target);
        const hook = ctx.frame()?.procName ?? "";
        const proc = this.index.lookup([`prop:${who.toLowerCase()}`], hook);
        if (proc) {
          await ctx.inObject("prop", who.toLowerCase(), () => ctx.runProc(proc));
        }
        return 0;
      }
      case "actorinstance":
        this.instanceActor(str(args[0]), str(args[1]));
        return 0;
      case "actoris3d": {
        const actor = this.namedActor(str(args[0] ?? ctx.me));
        if (args.length >= 2) {
          actor.is3d = truthyArg(args[1]);
          if (actor.is3d) {
            actor.screen = false;
          }
        }
        return actor.is3d;
      }
      case "actorxy":
        return this.actorXy(ctx, args);
      case "propinstance":
        this.instanceProp(str(args[0]), str(args[1]));
        return 0;
      case "scenexyz":
        return this.sceneXyz(str(args[0]), args[1] !== undefined ? num(args[1]) : 4);
      case "scenerow":
      case "actorexists": {
        const pose = this.scenePose(str(args[0]));
        return pose ? pose.y + 1 : 0;
      }
      case "scenecol":
      case "propexists": {
        const pose = this.scenePose(str(args[0]));
        return pose ? pose.x + 1 : 0;
      }
      case "wavevolume":
        return 5;
      case "themevol":
        return 0;
      case "soundvol":
        this.soundVolumes.set(str(args[0]).toLowerCase(), num(args[1]));
        return 0;
      case "soundloop":
        return this.soundLoop(str(args[0]), args.length < 2 ? true : truthyArg(args[1]));
      case "makecricket":
      case "makeball":
        this.makeBall(str(args[0] ?? ctx.me), args);
        return 0;
      case "stopcricket": {
        const who = str(args[0] ?? ctx.me).toLowerCase();
        if (who === "all") {
          for (const prop of this.props.values()) {
            prop.ball = undefined;
          }
        } else {
          this.namedProp(who).ball = undefined;
        }
        return 0;
      }
      case "iscricket":
      case "isball":
        return this.namedProp(str(args[0] ?? ctx.me)).ball ? 1 : 0;
      case "actorwarm":
        await this.ensureActor(str(args[0] ?? ctx.me));
        return 0;
      case "findfile":
      case "fileexists":
        return true;
      case "optionkey":
      case "shiftkey":
      case "commandkey":
        return false;
      case "substring":
        return substringIndex(str(args[0]), str(args[1]));
      case "quit":
        this.view?.log("quit");
        return 0;
      case "error":
        this.view?.log("script error()");
        return 0;
      case "currentvoice":
        // Dust empty `while currentvoice () != "none"` pumps the mixer.
        // Yield so Bolivar checkers banter can finish before the next line.
        if (this.currentVoice !== "none") {
          await sleep(16);
        }
        return this.currentVoice;
      case "currenttheme":
        if (args.length && this.trackFolder === "_NIGHT") {
          return "nightwind3";
        }
        if (args.length && this.trackFolder === "_TOWN") {
          return "daymusic5";
        }
        return this.currentTheme;
      case "currentsound":
        if (this.currentSoundName !== "none") {
          await sleep(16);
        }
        return this.currentSoundName;
      case "voicesound": {
        // Mixer start, not a wait. Awaiting fetch held `initprop` before
        // `propvisible (false)` so a pan-away door replayed close and
        // kept the overlay up. Set `currentVoice` first so
        // `while currentvoice () = name` (hub shaman) does not skip.
        const clip = str(args[0]);
        this.currentVoice = clip;
        void this.playVoice(clip);
        return 0;
      }
      case "singlesound":
      case "dualsound":
      case "multiplesound":
        // Fire-and-forget. Awaiting fetch/decode here held `scriptBusy`
        // and froze every actor `makeloop` (dog look, horse head/tail).
        void this.playFx(str(args[0]), false);
        this.noteFx(str(args[0]));
        return 0;
      case "opentrackfile":
        this.openTrack(str(args[0]));
        return 0;
      case "playtheme":
        this.playBed(str(args[0]));
        return 0;
      case "forceupdate":
        // EXE `0x433740`: one walk/display pump, not a `makeloop` drain.
        this.scriptPump += 1;
        try {
          const started = performance.now();
          this.advanceActorsOnce();
          this.view?.refreshActors();
          await this.runQueued(ctx, true);
          await waitGameFrame(this.framerateValue, started);
        } finally {
          this.scriptPump -= 1;
        }
        return 0;
      case "makeloop":
        this.makeLoop(str(args[0]), str(args[1]), str(args[2]), num(args[3]));
        return 0;
      case "stoploop":
        this.stopLoop(str(args[0]), str(args[1] ?? "all"));
        return 0;
      case "pauseloop":
        this.pauseLoop(str(args[0]), str(args[1] ?? "all"), truthyArg(args[2]));
        return 0;
      case "random": {
        const n = Math.max(1, Math.trunc(num(args[0])));
        return 1 + Math.floor(this.rng() * n);
      }
      case "numtostring":
        return String(Math.trunc(num(args[0])));
      case "stringtonum":
        return num(args[0]);
      case "findword":
        return findWord(str(args[0]), str(args[1]), num(args[2]));
      case "plugin":
        return 0;
      case "pluginfx": {
        const verb = str(args[0]).toLowerCase();
        if (verb === "checkmove") {
          return checkMove(str(args[1]), num(args[2]), num(args[3]));
        }
        ctx.unimplemented.add(name);
        this.view?.log(`unimplemented pluginfx ${verb}`);
        return "";
      }
      case "playmovie":
        await this.playMovie(str(args[0]));
        return 0;
      case "actionframe":
        return this.lastActionFrame === Math.trunc(num(args[0] ?? 1)) ? 1 : 0;
      case "countbevels":
        return this.bevels.length;
      case "puppetvisible":
        if (args.length) {
          const on = truthyArg(args[0]);
          this.puppetShown = on;
          this.ui.setVisible?.(on);
          return on;
        }
        return this.puppetShown;
      case "sounddone":
        return this.currentSoundName === "none" ? 1 : 0;
      case "shopwarm":
        await this.shopWarm(str(args[0]));
        return 0;
      case "countsounds":
        return countSounds(this.trackFolder);
      case "indextosound":
        return indexToSound(this.trackFolder, num(args[1] ?? args[0]));
      case "delay":
        // Same 60 Hz tick as `screentoblack (…, 30)`. Not rAF, not script Hz.
        await sleep(dustTicksToMs(num(args[0])));
        return 0;
      case "opencastfile": {
        const file = str(args[0]);
        await this.openCast(file);
        const stem = file.replace(/\.cst$/i, "").toLowerCase();
        const hook = this.index.lookup([`cast:${stem}`], "opencast");
        if (hook) {
          await ctx.inObject("cast", stem, () => ctx.runProc(hook));
        }
        return 0;
      }
      case "closecastfile":
        this.closeCast(str(args[0]));
        return 0;
      case "openshopfile": {
        const shop = str(args[0]).replace(/\.prp$/i, "").toLowerCase();
        await this.openShop(str(args[0]));
        await this.flushOpenProps(ctx);
        const hook = this.index.lookup([`shop:${shop}`], "openshop");
        if (hook) {
          await ctx.inObject("shop", shop, () => ctx.runProc(hook));
        }
        return 0;
      }
      case "closeshopfile":
        this.closeShop(str(args[0]));
        return 0;
      case "openstagefile":
        await this.openStage(str(args[0]));
        // Engine shows the default flat (`openflat` → mainpanel `noface`).
        await this.activateFlat(ctx, this.currentFlatName);
        // Same hook as `openset` / `opencast`. CRACK parks `spin`; SCORP
        // starts the drawer `trigger`. NEW.FLT has no `openstage`.
        {
          const hook = this.index.lookup(["stage"], "openstage");
          if (hook) {
            await ctx.inObject("stage", this.currentStageName, () => ctx.runProc(hook));
          }
        }
        return 0;
      case "closestagefile":
        this.closeStage();
        return 0;
      case "opensetfile": {
        const file = str(args[0]);
        if (this.sandbox) {
          sandboxEquipMineMask(file, ctx.globals, ctx.globalNames);
        }
        await this.openSet(file);
        {
          const hook = this.index.lookup(["set"], "openset");
          if (hook) {
            await ctx.runProc(hook);
          }
        }
        // `initall` does `stoploop ("flat", "all")` then `opensetfile`.
        // Re-run mainpanel `openflat` so `makeface` is not left dead.
        await this.rearmHudFlat(ctx);
        if (this.sandbox) {
          this.settleSandboxWorld(ctx);
          sandboxShowMineMask(this.currentSet, this.namedProp("mask"));
          // Town livestock is seeded after `initall`'s `initactors` (that
          // loop putdowns everyone). TARGET `opencast` already ran here.
          if (this.currentSet === "target" || this.currentSet === "town") {
            await this.seedSandboxAnimals(ctx);
          }
          if (this.currentSet === "town") {
            await this.seedSandboxTownPeople(ctx);
          }
          if (sandboxIsApoth(this.currentSet)) {
            await this.seedSandboxApothBottles(ctx);
          }
        }
        return 0;
      }
      case "advanceday":
        if (this.sandbox) {
          await this.sandboxAdvanceDay(ctx);
        }
        return 0;
      case "openfight":
        if (this.sandbox) {
          await this.runSandboxOpenFight(ctx);
        }
        return 0;
      case "closefight":
        if (this.sandbox) {
          await this.runSandboxCloseFight(ctx);
        }
        return 0;
      case "closesetfile":
        await ctx.inObject("scene", this.currentScene, () => ctx.evalCall("closescene", []));
        await ctx.inObject("set", "", () => ctx.evalCall("closeset", []));
        this.currentSet = "none";
        this.currentSetFile = "";
        return 0;
      case "openpuppetfile":
        this.skipSpeech = false;
        await this.openPuppet(str(args[0]), true);
        this.view?.refreshActors();
        return 0;
      case "closepuppetfile":
        this.skipSpeech = false;
        this.currentPuppet = "none";
        this.puppetShown = false;
        this.ui.close();
        if (this.cursorName === "watch") {
          this.cursorName = "arrow";
        }
        this.view?.refreshActors();
        return 0;
      case "currentset":
        return this.currentSet;
      case "currentpuppet":
        return this.currentPuppet;
      case "currentstage":
        return this.currentStageName || "none";
      case "currentflat":
        if (args.length) {
          this.currentFlatName = str(args[0]).toLowerCase();
          return this.currentFlatName;
        }
        return this.currentFlatName;
      case "countflats":
        return this.stageFlatNames.length;
      case "flattoindex": {
        const want = str(args[0]).toLowerCase();
        const at = this.stageFlatNames.findIndex((name) => name === want);
        return at < 0 ? 0 : at + 1;
      }
      case "indextoflat":
        return this.stageFlatNames[Math.trunc(num(args[0])) - 1] ?? "";
      case "gotoflat":
        await this.activateFlat(
          ctx,
          resolveFlatName(args[0], this.stageFlatNames, this.currentFlatName),
        );
        return this.currentFlatName;
      case "currentscene":
        if (args.length) {
          return await this.handleScene(str(args[0]));
        }
        return this.currentScene;
      case "currentdir":
      case "currentview":
        if (args.length) {
          const dir = parseDir(str(args[0]));
          if (dir) {
            this.currentDir = dir;
            if (this.view && this.view.pose.facing !== dir) {
              await this.view.setPose(this.view.world, {
                ...this.view.pose,
                facing: dir,
              });
            }
          }
          return str(args[0]);
        }
        return dirWord(this.currentDir);
      case "setvisible":
        if (args.length) {
          this.worldVisible = truthyArg(args[0]);
          this.view?.setWorldVisible?.(this.worldVisible);
        }
        return this.worldVisible;
      case "stagevisible":
        return true;
      case "countactors":
        return this.actors.size;
      case "indextoactor": {
        const i = num(args[0]) - 1;
        const name = [...this.actors.keys()][i] ?? "";
        const actor = this.actors.get(name);
        ctx.lastResult = actor?.cast ?? "";
        return name;
      }
      case "countprops":
        return this.props.size;
      case "indextoprop": {
        const i = num(args[0]) - 1;
        const prop = [...this.props.values()][i];
        ctx.lastResult = shopFileOf(prop?.shop ?? "");
        return prop?.name ?? "";
      }
      case "countpuppets":
        return this.puppetNames.length;
      case "indextopuppet":
        return this.puppetNames[num(args[0]) - 1] ?? "";
      case "propowner":
        if (args.length >= 2) {
          this.ensureProp(str(args[0])).owner = str(args[1]);
          return str(args[1]);
        }
        return this.ensureProp(str(args[0])).owner;
      case "propvisible":
        if (args.length >= 2) {
          const prop = this.ensureProp(str(args[0]));
          const on = truthyArg(args[1]);
          prop.visible = on;
          if (on && prop.name === "door") {
            prop.openedAt = {
              scene: this.currentScene,
              facing: String(this.view?.pose.facing ?? this.currentDir),
            };
          }
          if (!on) {
            prop.openedAt = undefined;
          }
          this.view?.refreshActors();
          this.syncPuzzleView();
        }
        return this.ensureProp(str(args[0])).visible;
      case "actorvisible":
        return this.actorField(ctx, args, "visible", (actor, value) => {
          actor.visible = truthyArg(value);
          if (
            this.sandbox &&
            !actor.visible &&
            actor.owner.toLowerCase() === "wonfight"
          ) {
            this.sandboxToyPlacements.delete(actor.name.toLowerCase());
          }
        });
      case "actorset":
        return this.actorField(ctx, args, "set", (actor, value) => {
          actor.set = str(value);
        });
      case "actorstar":
        return this.setActorStar(ctx, args);
      case "actorpose":
        return this.actorField(ctx, args, "pose", (actor, value) => {
          const next = str(value);
          if (next !== actor.pose) {
            actor.pose = next;
            actor.walkStep = 0;
            actor.walkAcc = 0;
            actor.walkTiming = timingForPose(actor.poseTiming, next);
          }
        });
      case "actorowner":
        return this.actorField(ctx, args, "owner", (actor, value) => {
          actor.owner = str(value);
        });
      case "actorvalue":
        return this.actorField(ctx, args, "value", (actor, value) => {
          actor.value = num(value);
        });
      case "actordeg":
        return this.actorField(ctx, args, "deg", (actor, value) => {
          actor.deg = wrapDeg(num(value));
        });
      case "actorscale":
        return this.actorField(ctx, args, "scale", (actor, value) => {
          actor.scale = num(value);
        });
      case "actorspeed":
        return this.actorField(ctx, args, "speed", (actor, value) => {
          actor.speed = num(value);
        });
      case "actorturn":
        return this.actorField(ctx, args, "turnSpeed", (actor, value) => {
          actor.turnSpeed = num(value);
        });
      case "actorzclip":
        return this.actorField(ctx, args, "zclip", (actor, value) => {
          actor.zclip = num(value);
        });
      case "actorhitbox":
      case "currentcd":
        return this.actorHitbox(args, ctx);
      case "variable":
        return this.actorField(ctx, args, "variable", (actor, value) => {
          actor.variable = num(value);
        });
      case "rowcoltoscene":
      case "sendtopostfx":
        return this.rowColToScene(num(args[0]), num(args[1]));
      case "scenebuild":
      case "sendtoserverfx":
        return this.sceneIsBuild(str(args[0]));
      case "actorxyz":
        return this.actorXyz(ctx, args);
      case "playerxyz":
        return this.playerXyz(args);
      case "cameraxyz":
        return this.cameraXyz(args);
      case "calcdist":
        return calcDist(args[0], args[1]);
      case "starxyz":
        return this.starPoint(str(args[0]));
      case "walktostar":
        return this.walkToStar(ctx, args);
      case "turntodeg":
        if (args.length >= 2) {
          this.startTurn(this.namedActor(str(args[0])), num(args[1]));
        }
        return 0;
      case "walkdest": {
        const actor = this.namedActor(str(args[0] ?? ctx.me));
        return walkDestOf(actor);
      }
      case "stopwalk": {
        const who = str(args[0] ?? ctx.me).toLowerCase();
        if (who === "all") {
          for (const actor of this.actors.values()) {
            this.clearWalk(actor);
          }
        } else {
          this.clearWalk(this.namedActor(who));
        }
        return 0;
      }
      case "iswalk": {
        const actor = this.namedActor(str(args[0] ?? ctx.me));
        if (
          sandboxSkipRangeWalkWait(
            this.sandbox,
            this.currentSet,
            actor.name,
            ctx.globals.get("leroyphase"),
          )
        ) {
          this.clearWalk(actor);
          return false;
        }
        return actor.walking || actor.turning;
      }
      case "currentdeg":
        if (args.length) {
          return num(args[0]);
        }
        return this.view ? dirToDeg(this.view.pose.facing) : dirToDeg("N");
      case "calcdeg":
        return calcDeg(asPoint(args[0]), asPoint(args[1]));
      case "calcvectx":
        return calcVect(num(args[0]), num(args[1])).x;
      case "calcvecty":
        return calcVect(num(args[0]), num(args[1])).y;
      case "frame":
        return this.frameCounter;
      case "tick":
        return Math.floor(performance.now());
      case "puppetclear":
        this.skipSpeech = false;
        this.bevels = [];
        this.ui.clear();
        return 0;
      case "puppetbevel":
        this.bevels.push({ label: str(args[0]), id: num(args[1]) });
        this.ui.addBevel({ label: str(args[0]), id: num(args[1]) });
        return 0;
      case "puppetscramble":
        scrambleInPlace(this.bevels, this.rng);
        this.ui.setBevels?.(this.bevels);
        return 0;
      case "puppetspeak":
        if (this.skipSpeech) {
          return 0;
        }
        await this.speak(str(args[0]));
        return 0;
      case "puppetscript": {
        const name = str(args[0]).toLowerCase();
        const proc = this.index.lookup([`puppet:${name}`], name);
        if (proc) {
          await ctx.runProc(proc);
        }
        return 0;
      }
      case "puppetevent":
        this.skipSpeech = false;
        if (this.bevels.length === 0) {
          return -1;
        }
        return this.waitPuppetEvent(ctx, num(args[0] ?? -1));
      case "actorscript": {
        const who = str(args[0] || ctx.me || ctx.target);
        const hook = ctx.frame()?.procName ?? "";
        const proc = this.index.lookup([`actor:${who.toLowerCase()}`], hook);
        if (proc) {
          await ctx.inObject("actor", who.toLowerCase(), () => ctx.runProc(proc));
        }
        return 0;
      }
      default:
        ctx.unimplemented.add(name);
        this.view?.log(`unimplemented ${name}`);
        return 0;
    }
  }

  private actorField(
    ctx: VM,
    args: Value[],
    field: keyof ActorState,
    set: (actor: ActorState, value: Value) => void,
  ): Value {
    const actor = this.namedActor(str(args[0] ?? ctx.me));
    if (args.length >= 2) {
      set(actor, args[1]);
      this.view?.refreshActors();
    }
    return actor[field] as Value;
  }

  private setActorStar(ctx: VM, args: Value[]): Value {
    const actor = this.namedActor(str(args[0] ?? ctx.me));
    if (args.length < 2) {
      return actor.star;
    }
    const star = str(args[1]);
    actor.star = star;
    const point = this.starPoint(star);
    if (point) {
      actor.x = point.x;
      actor.y = point.y;
      actor.z = point.z;
    }
    return star;
  }

  private actorXy(ctx: VM, args: Value[]): Value {
    const actor = this.namedActor(str(args[0] ?? ctx.me));
    if (args.length >= 3) {
      actor.x = num(args[1]);
      actor.y = num(args[2]);
      if (!actor.is3d) {
        actor.screen = true;
        if (!actor.set) {
          actor.set = this.currentSet;
        }
      }
      this.view?.refreshActors();
      return 0;
    }
    const axis = num(args[1]);
    if (axis === 1) {
      return actor.x;
    }
    if (axis === 2) {
      return actor.y;
    }
    return { kind: "point", x: actor.x, y: actor.y, z: 0 };
  }

  private actorHitbox(args: Value[], ctx: VM): Value {
    const who = str(args[0] ?? ctx.me).toLowerCase();
    if (who === "player") {
      if (args.length >= 3) {
        this.playerHitW = num(args[1]);
        this.playerHitH = num(args[2]);
        return 0;
      }
      return num(args[1]) === 2 ? this.playerHitH : this.playerHitW;
    }
    const actor = this.namedActor(who);
    if (args.length >= 3) {
      actor.hitboxW = num(args[1]);
      actor.hitboxH = num(args[2]);
      return 0;
    }
    return num(args[1]) === 2 ? actor.hitboxH : actor.hitboxW;
  }

  /** Printed `sendtopostfx (row, col)` — Dust `rowcoltoscene`. */
  rowColToScene(row: number, col: number): string {
    const x = Math.trunc(col);
    const y = Math.trunc(row);
    if (x < 0 || y < 0 || x > 14 || y > 14) {
      return "none";
    }
    return scriptSceneName(x, y);
  }

  /** Printed `sendtoserverfx (scene)` — Dust `scenebuild`. Blocked tiles cannot be stood on. */
  sceneIsBuild(name: string): boolean {
    const key = name.trim().toLowerCase();
    if (!key || key === "none") {
      return true;
    }
    const graph = this.view?.graph;
    const pose = this.scenePose(key, graph);
    if (!pose) {
      return true;
    }
    const rec =
      graph && isTownGridSize(graph.scenes.size)
        ? graph.scenes.get(tileKey(pose.y, pose.x))
        : graph?.scenes.get(tileKey(pose.x, pose.y));
    return Boolean(rec?.blocked);
  }

  private actorXyz(ctx: VM, args: Value[]): Value {
    const actor = this.namedActor(str(args[0] ?? ctx.me));
    if (args.length >= 4) {
      actor.x = num(args[1]);
      actor.y = num(args[2]);
      actor.z = num(args[3]);
      actor.screen = false;
      return 0;
    }
    const axis = num(args[1]);
    if (axis === 1) {
      return actor.x;
    }
    if (axis === 2) {
      return actor.y;
    }
    if (axis === 3) {
      return actor.z;
    }
    return { kind: "point", x: actor.x, y: actor.y, z: actor.z };
  }

  private playerXyz(args: Value[]): Value {
    const pose = this.view?.pose;
    const p = pose ? playerWorldPoint(pose) : { x: 0, y: 0 };
    return xyzAxis(args, p.x, p.y);
  }

  private cameraXyz(args: Value[]): Value {
    const pose = this.view?.pose;
    const p = pose ? cameraWorldPoint(pose) : { x: 0, y: 0 };
    return xyzAxis(args, p.x, p.y);
  }

  private walkToStar(ctx: VM, args: Value[]): Value {
    const actor = this.namedActor(str(args[0] ?? ctx.me));
    const dest = str(args[1]);
    if (dest.includes(",")) {
      const [rawX, rawY, rawZ] = dest.split(",").map(Number);
      const x = Number.isFinite(rawX) ? rawX : actor.x;
      const y = Number.isFinite(rawY) ? rawY : actor.y;
      const z = Number.isFinite(rawZ) ? rawZ : actor.z;
      actor.star = "custom";
      actor.destStar = `${Math.trunc(x)},${Math.trunc(y)},${Math.trunc(z)}`;
      actor.route = [];
      this.startWalk(actor, x, y, z);
      return 0;
    }
    const star = dest;
    const fromStar = actor.star;
    const point = this.starPoint(star);
    if (point) {
      actor.destStar = star;
      const destPt = { x: point.x, y: point.y, z: point.z };
      const hops = routeToStar(this.paths, fromStar, star, actor.x, actor.y, destPt);
      const first = hops[0] ?? destPt;
      actor.route = hops.slice(1);
      this.startWalk(actor, first.x, first.y, first.z);
    }
    return 0;
  }

  private clearWalk(actor: ActorState): void {
    actor.walking = false;
    actor.turning = false;
    actor.route = [];
    actor.destStar = "";
    actor.pose = "stand";
  }

  /** Named dest arrives; `"x,y,z"` stays `custom`. */
  private finishWalkStar(actor: ActorState): void {
    const dest = actor.destStar;
    actor.destStar = "";
    if (!dest) {
      return;
    }
    actor.star = dest.includes(",") ? "custom" : dest;
  }

  startWalk(actor: ActorState, x: number, y: number, z: number, continueCycle = false): void {
    actor.destX = x;
    actor.destY = y;
    actor.destZ = z || actor.z;
    actor.walking = true;
    const hasWalk =
      (actor.sprites?.walk?.length ?? 0) > 0 || actor.walkSprites.length > 0;
    // TARGET crows have `flight` and no walk strip — keep that pose.
    // Town NPCs still go to `walk` even before CST plates are loaded.
    if (hasWalk || (actor.pose || "stand").toLowerCase() !== "flight") {
      actor.pose = "walk";
    }
    const walkTable = timingForPose(actor.poseTiming, actor.pose || "walk");
    if (walkTable.length) {
      actor.walkTiming = walkTable;
    }
    if (!continueCycle) {
      actor.walkStep = 0;
      actor.walkAcc = 0;
    }
    // Idle `turntodeg` must not keep rotating the sprite after the walk
    // heading is set. EXE turns, then translates (`0x410b80`).
    actor.turning = false;
    const dx = x - actor.x;
    const dy = y - actor.y;
    if (dx !== 0 || dy !== 0) {
      actor.deg = this.facingForWalk(actor, x, y);
    }
    this.view?.refreshActors();
  }

  /**
   * Face the next hop (`calcdeg` to dest). Cast `walktopuppet` walks to
   * `playerxyz` on that vector, then `turntodeg (currentdeg + 128)` at
   * arrival. Forcing camera-facing for the whole beeline made off-axis
   * Help (east of the road) use the receding ¾ while she walked toward
   * the player.
   */
  private facingForWalk(actor: ActorState, x: number, y: number): number {
    return calcDeg(actor, { x, y });
  }

  startTurn(actor: ActorState, deg: number): void {
    actor.degTarget = wrapDeg(deg);
    if (Math.abs(degDelta(actor.deg, actor.degTarget)) <= 1) {
      actor.deg = actor.degTarget;
      actor.turning = false;
      return;
    }
    actor.turning = true;
    this.view?.refreshActors();
  }

  private actorClock = 0;

  /** One DF game frame: `actorspeed` / `actorturn` / one CST pose-table slot. */
  advanceActorsOnce(): void {
    this.advanceBalls();
    this.advancePropViews();
    let moved = false;
    for (const actor of this.actors.values()) {
      // `pausewalk ("all")` freezes everyone not on this SET (town NPCs
      // during TARGET / blackjack). Range livestock keep walking here.
      // No `actorset` (idle tests, unset extras) counts as not-here.
      if (this.walksPaused) {
        const here = Boolean(actor.set) && setNamesEqual(actor.set, this.currentSet);
        if (!here) {
          continue;
        }
      }
      if (actor.walking && actor.turning) {
        actor.turning = false;
      }
      if (actor.walking) {
        const dx = actor.destX - actor.x;
        const dy = actor.destY - actor.y;
        const dist = Math.hypot(dx, dy);
        const step = actor.speed;
        if (!Number.isFinite(dist) || !Number.isFinite(step) || step <= 0) {
          actor.walking = false;
          actor.route = [];
          this.finishWalkStar(actor);
          actor.pose = "stand";
          this.walkEnds.push(actor.name);
          continue;
        }
        if (dist <= step) {
          actor.x = actor.destX;
          actor.y = actor.destY;
          actor.z = actor.destZ;
          if (actor.route.length > 0) {
            const next = actor.route.shift()!;
            this.startWalk(actor, next.x, next.y, next.z, true);
          } else {
            actor.walking = false;
            this.finishWalkStar(actor);
            if (actor.pose === "walk") {
              actor.pose = "stand";
            }
            this.walkEnds.push(actor.name);
          }
        } else {
          actor.x += (dx / dist) * step;
          actor.y += (dy / dist) * step;
        }
        actor.walkStep += 1;
        moved = true;
      }
      if (actor.turning) {
        const delta = degDelta(actor.deg, actor.degTarget);
        const step = Math.max(1, actor.turnSpeed);
        if (!Number.isFinite(delta) || !Number.isFinite(actor.degTarget)) {
          actor.turning = false;
          this.turnEnds.push(actor.name);
          continue;
        }
        if (Math.abs(delta) <= step) {
          actor.deg = actor.degTarget;
          actor.turning = false;
          this.turnEnds.push(actor.name);
        } else {
          actor.deg = wrapDeg(actor.deg + Math.sign(delta) * step);
        }
        moved = true;
      }
    }
    if (moved) {
      this.view?.refreshActors();
    }
  }

  /** PRP views with a +0x2e table longer than 1 (hattip, glance, hit). */
  private advancePropViews(): void {
    let changed = false;
    for (const prop of this.props.values()) {
      if (!prop.visible) {
        continue;
      }
      const timing = prop.poseTiming[prop.view.toLowerCase()];
      if (!timing || timing.length <= 1) {
        continue;
      }
      prop.animTick += 1;
      changed = true;
    }
    if (changed) {
      this.view?.refreshActors();
    }
  }

  /** Wall-clock catch-up to boot `framerate (3)` → 20 Hz game frames. */
  advanceActors(dt: number): void {
    this.actorClock += Math.max(0, dt);
    const period = gameFrameSec(this.framerateValue);
    let n = 0;
    while (this.actorClock >= period && n < 8) {
      this.actorClock -= period;
      this.advanceActorsOnce();
      n += 1;
    }
  }

  private loopKey(kind: string, who: string): string {
    return `${kind.toLowerCase()}:${who.toLowerCase()}`;
  }

  private makeLoop(kind: string, who: string, proc: string, delay: number): void {
    const type = kind.toLowerCase();
    const name = resolveFlatLoopWho(type, who, this.currentFlatName, this.stageFlatNames);
    const ticks = Math.max(1, Math.trunc(delay));
    const key = this.loopKey(type, name);
    this.loops.set(key, {
      kind: type,
      who: name,
      proc: proc.toLowerCase(),
      delay: ticks,
      remaining: ticks,
      paused: false,
    });
  }

  private stopLoop(kind: string, who: string): void {
    const type = kind.toLowerCase();
    const name = who.toLowerCase();
    if (name === "all") {
      for (const [key, loop] of this.loops) {
        if (loop.kind === type) {
          this.loops.delete(key);
        }
      }
      this.dropDueLoops((loop) => loop.kind === type);
      return;
    }
    this.loops.delete(this.loopKey(type, name));
    this.dropDueLoops((loop) => loop.kind === type && loop.who === name);
  }

  /**
   * FIGHT `fadetoblack` re-arms on `fightslider2` until `closeshopfile`.
   * Those due ticks are already spliced out of `this.loops`; skip them
   * once the puzzle shop is gone so `blacktoscreen` cannot be re-blacked.
   */
  private scriptLoopLive(loop: ScriptLoop): boolean {
    if (loop.kind !== "prop") {
      return true;
    }
    const shop = (this.props.get(loop.who)?.shop ?? "").toLowerCase();
    if (!shop || !this.puzzleGroups.has(shop)) {
      return true;
    }
    const active = this.puzzleShop.toLowerCase();
    if (active === shop) {
      return true;
    }
    return this.shopAliases.get(shop) === active || this.shopAliases.get(active) === shop;
  }

  private dropDueLoops(match: (loop: ScriptLoop) => boolean): void {
    for (let i = this.dueLoops.length - 1; i >= 0; i -= 1) {
      if (match(this.dueLoops[i]!)) {
        this.dueLoops.splice(i, 1);
      }
    }
  }

  private hudFlatLoopAlive(who: string): boolean {
    const hit = (loop: ScriptLoop) => loop.kind === "flat" && loop.who === who;
    return [...this.loops.values()].some(hit) || this.dueLoops.some(hit);
  }

  /** Mainpanel `noface` after boot / initall. No-op if makeface is already armed. */
  async ensureHudPortrait(ctx: VM): Promise<void> {
    if ((this.currentFlatName || "mainpanel") !== "mainpanel") {
      return;
    }
    await this.rearmHudFlat(ctx);
  }

  /**
   * Dust shows a flat by running its `openflat` (and `closeflat` on the
   * one that was up). NEW.FLT mainpanel `openflat` is `noface`.
   */
  private async activateFlat(ctx: VM, name: string): Promise<void> {
    const dest = (name || "mainpanel").toLowerCase();
    const prev = this.currentFlatName.toLowerCase();
    if (prev && prev !== "none" && prev !== dest) {
      await ctx.inObject("flat", prev, () => ctx.evalCall("closeflat", []));
    }
    this.currentFlatName = dest;
    this.puzzleLabels = [];
    this.syncPuzzleView();
    await ctx.inObject("flat", dest, () => ctx.evalCall("openflat", []));
    this.syncPuzzleView();
    if (this.currentStageName.replace(/\.flt$/i, "") === "new") {
      if (dest === "avatar" || dest === "map") {
        this.view?.showHudFlat?.(dest);
      }
    }
  }

  /** After `stoploop ("flat", "all")`, the HUD portrait loop is gone. */
  private async rearmHudFlat(ctx: VM): Promise<void> {
    const who = (this.currentFlatName || "mainpanel").toLowerCase();
    if (who !== "mainpanel" || this.hudFlatLoopAlive(who)) {
      return;
    }
    await ctx.inObject("flat", who, () => ctx.evalCall("openflat", []));
  }

  private pauseLoop(kind: string, who: string, paused: boolean): void {
    const type = kind.toLowerCase();
    const name = who.toLowerCase();
    for (const loop of this.loops.values()) {
      if (loop.kind === type && (name === "all" || loop.who === name)) {
        loop.paused = paused;
      }
    }
    // Sitting at cards `pauseloop (…, "all")` then later `makeloop resetgame`.
    // Drop already-due world idles so they do not run when the hand ends.
    // Do not mark the kind sticky — a new makeloop is live (next hand).
    if (name === "all" && paused) {
      this.dropDueLoops((loop) => loop.kind === type);
    }
  }

  /**
   * Script frames are `60 / framerate()` Hz. Boot sets `framerate (3)`
   * so a `makeloop (…, 20)` idle tick is one second. One-shot: the proc
   * re-arms with another makeloop (Leroy `leroyidle` / `toidle`).
   */
  tickScriptClock(dt: number): void {
    const frameSec = Math.max(1, this.framerateValue) / 60;
    this.loopAcc += Math.max(0, dt);
    let frames = 0;
    while (this.loopAcc >= frameSec && frames < 32) {
      this.loopAcc -= frameSec;
      this.frameCounter += 1;
      frames += 1;
      for (const [key, loop] of [...this.loops]) {
        if (loop.paused) {
          continue;
        }
        loop.remaining -= 1;
        if (loop.remaining <= 0) {
          this.loops.delete(key);
          this.dueLoops.push(loop);
        }
      }
      this.advanceDrinkPoses();
    }
  }

  /**
   * Drink is 8 facings × 4 poses. `toidle` waits 25 script frames —
   * hold each pose 6 frames and stop on the last (one swallow, not a
   * 12 Hz loop that looks like a fidget).
   */
  private advanceDrinkPoses(): void {
    let changed = false;
    for (const actor of this.actors.values()) {
      if (actor.pose !== "drink") {
        continue;
      }
      const poses = Math.max(1, Math.floor((actor.drinkSprites.length || 32) / 8));
      actor.walkAcc += 1;
      const next = Math.min(
        poses - 1,
        Math.floor((actor.walkAcc - 1) / DRINK_HOLD_FRAMES),
      );
      if (next !== actor.walkStep) {
        actor.walkStep = next;
        changed = true;
      }
    }
    if (changed) {
      this.view?.refreshActors();
    }
  }

  async runQueued(ctx: VM, fromForceUpdate = false): Promise<void> {
    // Dust is single-threaded. Tick must not start another idle pump
    // while `resetgame` / `hasattention` already owns the VM. Nested
    // `forceupdate` still has to drain walkEnds on *this* stack.
    // `scriptPump > 0` used to let a tick sneak in during that drain
    // and freeze blackjack's second deal after the first card.
    if (this.scriptBusy && !fromForceUpdate) {
      return;
    }
    const hold = !fromForceUpdate && this.scriptPump === 0;
    if (hold) {
      this.scriptBusy = true;
    }
    try {
      const ends = this.walkEnds.splice(0);
      const turns = this.turnEnds.splice(0);
      // Nested `forceupdate` still drains walk/turn/ball. It must not run
      // another `makeloop` (Isao idle re-armed after `pauseloop all`, then
      // nested into blackjack `resetgame` `dealcards` after the first card).
      const due = fromForceUpdate ? [] : this.dueLoops.splice(0);
      for (const name of ends) {
        await ctx.inObject("actor", name, () => ctx.evalCall("endwalk", []));
      }
      for (const name of turns) {
        await ctx.inObject("actor", name, () => ctx.evalCall("endturn", []));
      }
      for (const loop of due) {
        if (!this.scriptLoopLive(loop)) {
          continue;
        }
        await ctx.inObject(loop.kind, loop.who, () => ctx.evalCall(loop.proc, []));
      }
      const balls = this.ballEnds.splice(0);
      for (const name of balls) {
        await ctx.inObject("prop", name, () =>
          ctx.evalCall("endball", [{ type: "str", value: "frames" }]),
        );
      }
    } finally {
      if (hold) {
        this.scriptBusy = false;
      }
    }
  }

  /**
   * Camera tile/facing changed. Fire standing actors' idle loops on the
   * next script frame so `turntodeg` re-aims instead of waiting a full
   * `makeloop` (Leroy's 20 frames = 1s). Do not cut a drink short.
   */
  noticeCamera(): void {
    for (const loop of this.loops.values()) {
      if (loop.paused || loop.kind !== "actor") {
        continue;
      }
      if (sandboxFightActor(loop.who)) {
        continue;
      }
      const actor = this.actors.get(loop.who);
      if (!actor?.visible || actor.pose !== "stand") {
        continue;
      }
      loop.remaining = Math.min(loop.remaining, 1);
    }
  }

  private async handleScene(arg: string): Promise<string> {
    const lower = arg.toLowerCase();
    if (lower === "strait" || lower === "left" || lower === "right") {
      this.view?.walk(lower === "strait" ? "strait" : lower);
      return this.currentScene;
    }
    this.currentScene = lower.startsWith("scene") ? lower : `scene ${lower}`;
    const graph = this.view?.graph;
    if (graph && this.view) {
      const pose = this.poseFromSceneName(graph, this.currentScene);
      if (pose && graph.cameraTiles.has(tileKey(pose.x, pose.y))) {
        try {
          await this.view.setPose(this.view.world, {
            ...pose,
            facing: parseDir(String(this.currentDir)) ?? this.view.pose.facing,
          });
        } catch {
          this.view.log(`still missing for ${this.currentScene}`);
        }
      }
    }
    return this.currentScene;
  }

  poseFromSceneName(
    graph: SetGraph,
    name: string,
  ): { x: number; y: number } | undefined {
    return this.scenePose(name, graph);
  }

  scenePose(name: string, graph?: SetGraph): { x: number; y: number } | undefined {
    const g = graph ?? this.view?.graph;
    const parsed = parseScriptScene(name);
    if (parsed && (!g || isTownGridSize(g.scenes.size))) {
      return parsed;
    }
    if (!g) {
      return parsed;
    }
    const scene = sceneByName(g, name);
    if (!scene) {
      return isTownGridSize(g.scenes.size) ? parsed : undefined;
    }
    // Town table (x,y) is Pascal (col, row). Script space is the transpose:
    // `chicken` at table (10, 3) is farm slot d11 (3, 10), between c11 and e11.
    if (isTownGridSize(g.scenes.size)) {
      return { x: scene.y, y: scene.x };
    }
    return { x: scene.x, y: scene.y };
  }

  sceneNameForPose(graph: SetGraph, x: number, y: number): string {
    if (isTownGridSize(graph.scenes.size)) {
      return scriptSceneName(x, y);
    }
    const rec = graph.scenes.get(tileKey(x, y));
    return rec?.name.toLowerCase() ?? `scene ${String.fromCharCode(97 + y)}${x + 1}`;
  }

  namedActor(name: string): ActorState {
    const key = name.toLowerCase();
    let actor = this.actors.get(key);
    if (!actor) {
      actor = {
        name: key,
        cast: "gang",
        visible: false,
        set: "",
        star: "",
        x: 0,
        y: 0,
        z: 0,
        deg: 0,
        scale: 1450,
        pose: "stand",
        owner: "none",
        value: 0,
        variable: 0,
        hitboxW: 0,
        hitboxH: 0,
        speed: 3,
        turnSpeed: 7,
        walking: false,
        turning: false,
        destX: 0,
        destY: 0,
        destZ: 0,
        destStar: "",
        route: [],
        degTarget: 0,
        walkStep: 0,
        walkAcc: 0,
        poseTiming: {},
        walkTiming: [],
        zclip: 32,
        standSprites: [],
        walkSprites: [],
        drinkSprites: [],
        sprites: {},
        spriteRoot: "",
        screen: false,
        is3d: false,
      };
      this.actors.set(key, actor);
    }
    return actor;
  }

  private async ensureActor(name: string): Promise<void> {
    const key = name.toLowerCase();
    const pending = this.actorScriptLoads.get(key);
    if (pending) {
      await pending;
      return;
    }
    const job = this.loadActorScript(key);
    this.actorScriptLoads.set(key, job);
    await job;
  }

  private async loadActorScript(key: string): Promise<void> {
    if (this.loadedActorScripts.has(key)) {
      return;
    }
    const source = this.resolveActorSource(key);
    if (!source) {
      this.loadedActorScripts.add(key);
      return;
    }
    const templateKey = source.folder.toLowerCase();
    if (templateKey !== key) {
      await this.ensureActor(source.folder);
      this.instanceActor(templateKey, key);
      this.loadedActorScripts.add(key);
      return;
    }
    const actor = this.namedActor(key);
    actor.cast = source.stem;
    actor.spriteRoot = source.dir;
    this.attachCastSprites(actor, source.folder);
    await this.addScriptFile(`actor:${key}`, `${source.dir}/${source.folder}/Script.json`);
    this.loadedActorScripts.add(key);
  }

  private resolveActorSource(
    name: string,
  ): { stem: string; dir: string; folder: string } | undefined {
    for (const [stem, bag] of this.castBags) {
      const names = bag.folders.length ? bag.folders : Object.keys(bag.sprites);
      const folder = actorTemplateFolder(name, names);
      if (folder) {
        return { stem, dir: bag.dir, folder };
      }
    }
    return undefined;
  }

  private attachCastSprites(actor: ActorState, folder: string): void {
    const bag = this.castBags.get(actor.cast);
    if (!bag) {
      return;
    }
    const poses =
      bag.sprites[folder] ??
      bag.sprites[actor.name] ??
      Object.entries(bag.sprites).find(([key]) => key.toLowerCase() === folder.toLowerCase())?.[1];
    if (!poses) {
      return;
    }
    actor.spriteRoot = bag.dir;
    actor.sprites = poses;
    actor.standSprites = poses.stand ?? [];
    actor.walkSprites = poses.walk ?? poses.lowwalk ?? [];
    actor.drinkSprites = poses.drink ?? [];
    const tables = bag.timing[folder] ?? bag.timing[actor.name] ?? bag.timing[folder.toLowerCase()] ?? {};
    actor.poseTiming = tables;
    actor.walkTiming = timingForPose(tables, actor.pose || "walk");
  }

  namedProp(name: string): PropState {
    return this.ensureProp(name);
  }

  ensureProp(name: string): PropState {
    const key = name.toLowerCase();
    let prop = this.props.get(key);
    if (!prop) {
      prop = {
        name: key,
        shop: "",
        visible: false,
        owner: "none",
        view: "",
        set: "",
        star: "",
        x: 0,
        y: 0,
        z: 0,
        scale: 1450,
        deg: 0,
        value: 0,
        speed: 8,
        zclip: 0,
        sprites: {},
        spriteRoot: "",
        poseTiming: {},
        animTick: 0,
        dist: 0,
        screen: false,
      };
      this.props.set(key, prop);
    }
    return prop;
  }

  starPoint(name: string): { kind: "point"; x: number; y: number; z: number } | undefined {
    if (!name) {
      return undefined;
    }
    const hit = this.waypoints.get(name.toLowerCase());
    if (!hit) {
      return undefined;
    }
    return { kind: "point", x: hit.x, y: hit.y, z: 0 };
  }

  nearbyActors(): ActorState[] {
    const pose = this.view?.pose;
    if (!pose) {
      return [];
    }
    const world = this.view?.world ?? WORLD_TOWN;
    return [...this.actors.values()].filter((actor) => {
      if (!actor.visible) {
        return false;
      }
      if (
        actor.set &&
        !setNamesEqual(actor.set, world) &&
        !setNamesEqual(actor.set, this.currentSet)
      ) {
        return false;
      }
      if (actor.screen && !actor.is3d) {
        // TARGET bottles/cans/plates are `actorxy` with no `actorset`.
        // They must not follow the camera into town.
        if (!actor.set && actor.cast && !setNamesEqual(actor.cast, this.currentSet)) {
          return false;
        }
        return true;
      }
      const still = viewStill(this.view, actor);
      if (!still) {
        return false;
      }
      // Same-tile NPCs beside the set-back lens crop bun/side on a 90°
      // turn. On-axis `walktopuppet` to playerxyz must stay (short
      // feet-forward, hotspot still near center).
      return actorFeetInFront(still.forward, still.x);
    });
  }

  /** FLT button under a HUD-band point (`mainpanel` EXIT, avatar, …). */
  hitHudButton(x: number, y: number): string | undefined {
    return hitFlatButton(this.stageHits.get(this.currentFlatName) ?? [], x, y)?.name;
  }

  skipRemainingSpeech(): void {
    this.skipSpeech = true;
    this.ui.skipLine();
  }

  private get puppetLines(): Map<string, PuppetLine> {
    return this.puppetLineBags.get(this.currentPuppetFolder) ?? this.loosePuppetLines;
  }

  private cachedViseme(ident: string): VisemeLine | undefined {
    return this.visemeLines.get(puppetClipKey(this.currentPuppetFolder, ident));
  }

  private async speak(ident: string): Promise<void> {
    const key = ident.toLowerCase();
    const line = this.puppetLines.get(key);
    if (line?.wav) {
      void voices.preload([line.wav]);
    }
    const viseme = await this.loadVisemeLine(key);
    if (viseme && line) {
      line.viseme = viseme;
    }
    const caption = puppetIdleCaption(ident, line?.text ?? ident);
    await this.ui.speak(caption, line?.wav, viseme ?? line?.viseme, ident);
  }

  /** Blink/gesture: visemes only. `waitEvent` stays live so bevels work. */
  private fidgetSilent(ident: string): void {
    const key = ident.toLowerCase();
    const line = this.puppetLines.get(key);
    if (line?.wav) {
      void voices.preload([line.wav]);
    }
    const viseme = this.cachedViseme(key) ?? line?.viseme;
    void this.ui.fidget(line?.wav, viseme, ident);
    if (viseme) {
      return;
    }
    void this.loadVisemeLine(key).then((loaded) => {
      if (!loaded) {
        return;
      }
      if (line) {
        line.viseme = loaded;
      }
      this.ui.setViseme(loaded);
    });
  }

  /**
   * DF.EXE `0x431330` (`puppetevent`). Four independent `idle 1`–`idle 4`
   * timers (`0x40B060` random interval from each clip’s length). `idlefx`
   * is a script, not this loop — the EXE plays the named clips.
   * Spoken idle awaits `speak` (hourglass). Blinks/gestures fidget
   * without locking the choice wait. One clip per wake — overdue
   * neighbors re-roll so glances do not dump back to back.
   */
  private async waitPuppetEvent(_ctx: VM, limitTicks: number): Promise<number> {
    const startTick = dustTick(this.nowMs());
    const deadline =
      limitTicks > 0 ? startTick + limitTicks : Number.POSITIVE_INFINITY;
    const tracks = PUPPET_IDLE_CLIPS.flatMap((ident) => {
      const line = this.puppetLines.get(ident);
      if (!line && !this.cachedViseme(ident)) {
        return [];
      }
      const kind = puppetIdleKind(ident, line?.text ?? "");
      const wavSec = line?.wav ? voices.bufferDuration(line.wav) : 0;
      const visemeTicks = this.cachedViseme(ident)?.ticks ?? 0;
      const duration = puppetIdleDurationUnits(wavSec, visemeTicks, kind);
      const rand15 = Math.floor(this.rng() * 0x8000);
      return [
        {
          ident,
          kind,
          interval: dustIdleInterval(duration, rand15),
          last: startTick,
          duration,
        },
      ];
    });
    const roll = (
      track: (typeof tracks)[number],
      now: number,
      floorSpeak: boolean,
    ): void => {
      track.last = now;
      track.interval = dustIdleInterval(
        track.duration,
        Math.floor(this.rng() * 0x8000),
      );
      if (floorSpeak && track.kind === "speak") {
        track.interval = Math.max(track.interval, PUPPET_IDLE_SPEAK_MIN_TICKS);
      }
    };
    const rebaseOverdue = (
      except: (typeof tracks)[number],
      now: number,
    ): void => {
      for (const track of tracks) {
        if (track === except) {
          continue;
        }
        if (now - track.last >= track.interval) {
          roll(track, now, true);
        }
      }
    };
    for (;;) {
      const now = dustTick(this.nowMs());
      if (now >= deadline) {
        return -2;
      }
      if (!this.ui.speaking) {
        const due = tracks.find((track) => {
          if (now - track.last < track.interval) {
            return false;
          }
          return track.kind === "speak" || !this.ui.fidgeting;
        });
        if (due) {
          if (due.kind === "speak") {
            await this.speak(due.ident);
            const end = dustTick(this.nowMs());
            roll(due, end, true);
            rebaseOverdue(due, end);
            this.skipSpeech = false;
          } else {
            this.fidgetSilent(due.ident);
            roll(due, now, false);
            rebaseOverdue(due, now);
          }
        }
      }
      const wake = dustTick(this.nowMs());
      if (wake >= deadline) {
        return -2;
      }
      const untilDeadline = deadline - wake;
      const untilIdle = tracks.reduce((soonest, track) => {
        const wait = track.interval - (wake - track.last);
        return wait < soonest ? wait : soonest;
      }, Number.POSITIVE_INFINITY);
      const sliceTicks = Math.max(1, Math.min(untilDeadline, untilIdle));
      const sliceMs = Number.isFinite(sliceTicks)
        ? puppetTicksToMs(sliceTicks)
        : undefined;
      const picked = await this.ui.waitEvent(sliceMs);
      if (picked !== undefined) {
        return picked;
      }
    }
  }

  /** Prefetch a few WAVs. Do not parse visemes.json (multi-megabyte blob). */
  prefetchTalk(folder = "PUP/_LEROY"): void {
    const urls = this.wavsFor(folder).slice(0, 8);
    voices.queue(urls);
    void this.ui.preloadVoices(urls);
  }

  warmTalk(who?: string): void {
    const folder = who
      ? puppetFolder(who)
      : this.currentPuppetFolder || "PUP/_LEROY";
    const urls = this.wavsFor(folder).slice(0, 8);
    voices.prime(urls);
    void this.ui.preloadVoices(urls);
  }

  private wavsFor(folder: string): string[] {
    const hit = this.puppetWavs.get(folder);
    if (hit?.length) {
      return hit;
    }
    if (folder.replace(/\\/g, "/").toUpperCase().endsWith("_LEROY")) {
      return ["leroy.43", "leroy.44"].map((id) =>
        extractUrl(`${folder}/AUDIO/${id}.wav`),
      );
    }
    return [];
  }

  private async loadVisemeLine(ident: string): Promise<VisemeLine | undefined> {
    const folder = this.currentPuppetFolder;
    if (!folder) {
      return undefined;
    }
    const key = ident.toLowerCase();
    const cacheKey = puppetClipKey(folder, key);
    const hit = this.visemeLines.get(cacheKey);
    if (hit) {
      return hit;
    }
    const pending = this.visemeLoads.get(cacheKey);
    if (pending) {
      return pending;
    }
    const job = (async () => {
      const data = await fetchJson<VisemeLine>(
        extractUrl(`${folder}/AUDIO/visemes/${key}.json`),
      ).catch(() => null);
      if (!data?.frames?.length) {
        return undefined;
      }
      this.visemeLines.set(cacheKey, data);
      return data;
    })().finally(() => {
      this.visemeLoads.delete(cacheKey);
    });
    this.visemeLoads.set(cacheKey, job);
    return job;
  }

  async bootIndex(): Promise<void> {
    const boot = await loadScriptJson("BOOT/_BOOTFILE/Script 1.json");
    for (const proc of boot) {
      this.index.add("boot", proc, "BOOT/_BOOTFILE/Script 1.json");
    }
  }

  async loadGangSprites(): Promise<void> {
    await this.loadCastSprites("CST/_GANG");
  }

  /** Sprites + CST +0x2e pose tables for one cast (gang, extra, target, mine). */
  async loadCastSprites(dir: string): Promise<void> {
    const data = await fetchJson<{
      actors?: Record<string, Record<string, SpritePlace[]>>;
    }>(extractUrl(`${dir}/sprites.json`)).catch(() => null);
    const actors = data?.actors ?? {};
    if (dir === "CST/_GANG") {
      this.gangSprites = actors;
    }
    const timing = await fetchJson<Record<string, Record<string, number[]>>>(
      extractUrl(`${dir}/timing.json`),
    ).catch(() => ({} as Record<string, Record<string, number[]>>));
    const stem = dir.replace(/^CST\/_/, "").toLowerCase();
    this.castBags.set(stem, {
      dir,
      folders: await this.listActorFolders(dir),
      sprites: actors,
      timing,
    });
  }

  private async openStage(name: string): Promise<void> {
    const stem = name.replace(/\.flt$/i, "").toLowerCase();
    const folder = `FLT/_${stem.toUpperCase()}`;
    this.index.removePrefix("stage");
    this.index.removePrefix("flat:");
    this.index.removePrefix("button:");
    this.stageHits.clear();
    this.stageStills.clear();
    this.puzzleLabels = [];
    this.currentStageName = stem;
    await Promise.all(stageScriptRels(stem).map((rel) => this.addScriptFile("stage", rel)));
    let flats = await fetchJson<{
      stage?: string;
      flats?: {
        name: string;
        file?: string;
        script?: number;
        still?: number;
        stillFile?: string;
        hits?: FlatHit[];
      }[];
    }>(extractUrl(`${folder}/flats.json`)).catch(() => null);
    if (!flats?.flats?.length) {
      flats = fallbackReaderFlats(stem);
    }
    if (flats?.stage) {
      const stageName = flats.stage.toLowerCase();
      this.currentStageName =
        stageName === "cardflats" ? stem : stageName.replace(/\.flt$/i, "");
    }
    if (flats?.flats?.length) {
      for (const flat of flats.flats) {
        const fname = flat.name.toLowerCase();
        const file = flat.file ?? `openflat_${flat.script}.json`;
        await this.addScriptFile(`flat:${fname}`, `${folder}/${file}`);
        const still = flat.stillFile ?? (flat.still != null ? `frame_${flat.still}.png` : "");
        if (still) {
          this.stageStills.set(fname, extractUrl(`${folder}/${still}`));
        }
        const hits = (flat.hits ?? []).map((hit) => ({
          ...hit,
          name: hit.name.toLowerCase(),
        }));
        this.stageHits.set(fname, hits);
        for (const hit of hits) {
          const bfile = hit.file ?? `mousedown _arg__${hit.script}.json`;
          await this.addScriptFile(`button:${fname}:${hit.name}`, `${folder}/${bfile}`);
        }
      }
    } else {
      await this.addScriptFile("flat:mainpanel", `${folder}/openflat.json`);
      await this.addScriptFile("flat:death", `${folder}/death.json`);
    }
    this.stageFlatNames = flats?.flats?.length
      ? flats.flats.map((flat) => flat.name.toLowerCase())
      : ["mainpanel"];
    this.currentFlatName = this.stageFlatNames[0] ?? "mainpanel";
    this.syncPuzzleView();
  }

  private closeStage(): void {
    this.stopLoop("flat", "all");
    this.index.removePrefix("stage");
    this.index.removePrefix("flat:");
    this.index.removePrefix("button:");
    this.stageHits.clear();
    this.stageStills.clear();
    this.puzzleLabels = [];
    this.currentStageName = "none";
    this.currentFlatName = "none";
    this.stageFlatNames = [];
    this.view?.showPuzzle?.(null);
    this.view?.showHudLabels?.([]);
  }

  private async openShop(name: string): Promise<void> {
    const stem = name.replace(/\.prp$/i, "").toLowerCase();
    if (stem !== "inven" && stem !== "house") {
      await this.openPuzzleShop(stem);
      return;
    }
    const shop = stem;
    if (this.loadedShops.has(shop)) {
      return;
    }
    const key = `shop:${shop}`;
    const groups = shop === "inven" ? INVEN_GROUPS : HOUSE_GROUPS;
    await Promise.all(shopScriptRels(shop).map((rel) => this.addScriptFile(key, rel)));
    const folder = shop === "inven" ? "PRP/_INVEN" : "PRP/_HOUSE";
    const sheet = await loadPropSheet(folder);
    const byGroup: Record<string, Record<string, SpritePlace[]>> = {};
    for (const rec of sheet) {
      const group = (rec.group ?? "").toLowerCase();
      const state = (rec.state ?? "base").toLowerCase();
      if (!group || !rec.path) {
        continue;
      }
      const bag = byGroup[group] ?? (byGroup[group] = {});
      const frames = bag[state] ?? (bag[state] = []);
      frames.push({
        path: rec.path,
        x: rec.x ?? 0,
        y: rec.y ?? 0,
        w: rec.w ?? 0,
        h: rec.h ?? 0,
      });
    }
    this.shopSprites.set(shop, byGroup);
    const timing = await fetchJson<Record<string, Record<string, number[]>>>(
      extractUrl(`${folder}/timing.json`),
    ).catch(() => ({} as Record<string, Record<string, number[]>>));
    const scriptJobs: Promise<void>[] = [];
    for (const group of groups) {
      const prop = this.ensureProp(group.name);
      prop.shop = shop;
      prop.spriteRoot = folder;
      prop.sprites = byGroup[group.name.toLowerCase()] ?? {};
      const tables = timing[group.name] ?? timing[group.name.toLowerCase()] ?? {};
      prop.poseTiming = Object.fromEntries(
        Object.entries(tables).map(([view, seq]) => [view.toLowerCase(), seq]),
      );
      const propKey = `prop:${group.name.toLowerCase()}`;
      for (const rel of propScriptRels(group)) {
        scriptJobs.push(this.addScriptFile(propKey, rel));
      }
      this.pendingOpenProps.push(group.name.toLowerCase());
    }
    await Promise.all(scriptJobs);
    this.loadedShops.add(shop);
  }

  private async openPuzzleShop(stem: string): Promise<void> {
    const folder = `PRP/_${stem.toUpperCase()}`;
    const key = `shop:${stem}`;
    this.puzzleShop = stem;
    if (this.loadedShops.has(stem)) {
      return;
    }
    await Promise.all(puzzleShopScriptRels(stem).map((rel) => this.addScriptFile(key, rel)));
    const groups = await fetchJson<{ name: string; script: number }[]>(
      extractUrl(`${folder}/groups.json`),
    ).catch(() => [] as { name: string; script: number }[]);
    const sheet = await loadPropSheet(folder);
    const byGroup: Record<string, Record<string, SpritePlace[]>> = {};
    for (const rec of sheet) {
      const group = (rec.group ?? "").toLowerCase();
      const state = (rec.state ?? "base").toLowerCase();
      if (!group || !rec.path) {
        continue;
      }
      const bag = byGroup[group] ?? (byGroup[group] = {});
      const frames = bag[state] ?? (bag[state] = []);
      frames.push({
        path: rec.path,
        x: rec.x ?? 0,
        y: rec.y ?? 0,
        w: rec.w ?? 0,
        h: rec.h ?? 0,
      });
    }
    this.shopSprites.set(stem, byGroup);
    this.puzzleGroups.set(stem, new Set(groups.map((group) => group.name.toLowerCase())));
    warmExtractImages(
      Object.values(byGroup).flatMap((bag) =>
        Object.values(bag).flatMap((frames) =>
          frames.map((frame) => extractUrl(`${folder}/${frame.path}`)),
        ),
      ),
    );
    const timing = await fetchJson<Record<string, Record<string, number[]>>>(
      extractUrl(`${folder}/timing.json`),
    ).catch(() => ({} as Record<string, Record<string, number[]>>));
    const scriptJobs: Promise<void>[] = [];
    for (const group of groups) {
      const name = group.name.toLowerCase();
      const prop = this.ensureProp(name);
      prop.shop = stem;
      prop.spriteRoot = folder;
      prop.screen = true;
      const frames = byGroup[name];
      if (frames && Object.keys(frames).length) {
        prop.sprites = frames;
      } else if (!Object.keys(prop.sprites).length) {
        prop.sprites = {};
      }
      const tables = timing[group.name] ?? timing[name] ?? {};
      prop.poseTiming = Object.fromEntries(
        Object.entries(tables).map(([view, seq]) => [view.toLowerCase(), seq]),
      );
      for (const rel of puzzlePropScriptRels(stem, group.script)) {
        scriptJobs.push(this.addScriptFile(`prop:${name}`, rel));
      }
      this.pendingOpenProps.push(name);
    }
    await Promise.all(scriptJobs);
    this.loadedShops.add(stem);
    // Pull lever: FLT button has only setcursor; the handle prop owns mousedown.
    if (this.index.lookup(["prop:handle"], "mousedown")) {
      this.index.copyKey("prop:handle", "button:flat 3:pull");
    }
  }

  /**
   * Snake SET `shopwarm ("puzzle")` after `openshopfile ("snake.prp")`.
   * The FLT stage is named `puzzle`; `sendtoshop ("puzzle", …)` needs
   * that key. Fight `shopwarm ("fight.prp")` is just a second open.
   */
  private async shopWarm(name: string): Promise<void> {
    const stem = libraryStem(name);
    if (this.puzzleShop && this.puzzleShop !== stem && !this.loadedShops.has(stem)) {
      this.index.copyKey(`shop:${this.puzzleShop}`, `shop:${stem}`);
      this.shopAliases.set(stem, this.puzzleShop);
      this.loadedShops.add(stem);
      return;
    }
    await this.openShop(name);
  }

  private closeShop(name: string): void {
    const stem = name.replace(/\.prp$/i, "").toLowerCase();
    const real = this.shopAliases.get(stem) ?? stem;
    for (const prop of [...this.props.values()]) {
      if (prop.shop !== stem && prop.shop !== real) {
        continue;
      }
      prop.visible = false;
      this.stopLoop("prop", prop.name);
    }
    if (this.puzzleShop === stem || this.puzzleShop === real) {
      this.puzzleShop = "";
    }
    for (const [alias, source] of [...this.shopAliases.entries()]) {
      if (alias === stem || source === stem || alias === real || source === real) {
        this.shopAliases.delete(alias);
      }
    }
    // Hide clones; do not delete them. `updatescreen` `propinstance`s
    // the same names again. Deleting dropped the sprite bag so the
    // next clone had no frames.
  }

  private async flushOpenProps(ctx: VM): Promise<void> {
    const pending = this.pendingOpenProps.splice(0);
    for (const name of pending) {
      const proc = this.index.lookup([`prop:${name}`], "openprop");
      if (proc) {
        await ctx.inObject("prop", name, () => ctx.runProc(proc));
      }
    }
  }

  paintPuzzle(): void {
    this.syncPuzzleView();
  }

  private syncPuzzleView(): void {
    const stage = this.currentStageName.toLowerCase().replace(/\.flt$/i, "");
    if (stage === "target") {
      this.view?.showPuzzle?.(null);
      this.view?.showHudLabels?.(this.puzzleLabels);
      return;
    }
    this.view?.showHudLabels?.([]);
    if (!isPuzzleStage(this.currentStageName)) {
      this.view?.showPuzzle?.(null);
      return;
    }
    const stillUrl =
      this.stageStills.get(this.currentFlatName) ??
      this.stageStills.get(this.stageFlatNames[0] ?? "");
    if (!stillUrl) {
      this.view?.showPuzzle?.(null);
      return;
    }
    const reader = isReaderStage(this.currentStageName) || isReaderStage(stage);
    this.view?.showPuzzle?.({
      stillUrl,
      items: this.puzzleItems(),
      labels: this.puzzleLabels,
      reader,
    });
    if (reader) {
      this.view?.setFadeOpacity?.(0);
    }
  }

  private puzzleItems(): ReturnType<typeof flatPropItem>[] {
    const items: ReturnType<typeof flatPropItem>[] = [];
    const shop = this.puzzleShop;
    const props = [...this.props.values()]
      .filter(
        (prop) =>
          prop.visible &&
          ((shop && prop.shop === shop) || isReaderBorderProp(prop.name)),
      )
      .sort((a, b) => b.dist - a.dist);
    for (const prop of props) {
      const view = (prop.view || "normal").toLowerCase();
      const bag = this.pieceSpriteBag(prop);
      const frames =
        bag[view] ??
        bag.normal ??
        bag.king ??
        Object.values(bag)[0] ??
        [];
      const place = propViewFrame(frames, prop.deg, prop.poseTiming[view], prop.animTick);
      if (!place) {
        continue;
      }
      items.push(flatPropItem(prop, place));
    }
    return items;
  }

  private pieceSpriteBag(prop: PropState): Record<string, SpritePlace[]> {
    if (Object.keys(prop.sprites).length) {
      return prop.sprites;
    }
    const shop = prop.shop || this.puzzleShop;
    const group = prop.name.replace(/\d+$/, "1");
    return this.shopSprites.get(shop)?.[group] ?? this.shopSprites.get(shop)?.[prop.name] ?? {};
  }

  private noteFx(name: string): void {
    const key = name.toLowerCase();
    this.currentSoundName = key;
    const gen = ++this.soundGen;
    const url = this.soundUrl(name);
    const dur = Math.max(0.25, voices.bufferDuration(url) || 0.55);
    setTimeout(() => {
      if (gen === this.soundGen && this.currentSoundName === key) {
        this.currentSoundName = "none";
      }
    }, dur * 1000);
  }

  private pendingOpenProps: string[] = [];

  private async openCast(name: string): Promise<void> {
    const stem = name.replace(/\.cst$/i, "").toLowerCase();
    if (this.loadedCasts.has(stem)) {
      return;
    }
    const key = `cast:${stem}`;
    const prefix = `CST/_${stem.toUpperCase()}`;
    try {
      const procs = await loadScriptJson(`${prefix}/Cast.json`);
      for (const proc of procs) {
        this.index.add(key, proc, `${prefix}/Cast.json`);
      }
    } catch {
      this.view?.log(`cast library missing for ${name}`);
    }
    await this.loadCastSprites(prefix);
    this.loadedCasts.add(stem);
  }

  private closeCast(name: string): void {
    const stem = name.replace(/\.cst$/i, "").toLowerCase();
    this.loadedCasts.delete(stem);
    this.castBags.delete(stem);
    this.index.removePrefix(`cast:${stem}`);
    for (const actor of this.actors.values()) {
      if (actor.cast !== stem) {
        continue;
      }
      this.loadedActorScripts.delete(actor.name);
      this.actorScriptLoads.delete(actor.name);
      actor.visible = false;
      actor.walking = false;
      actor.turning = false;
      actor.screen = false;
      actor.route = [];
      this.stopLoop("actor", actor.name);
      this.index.removePrefix(`actor:${actor.name}`);
    }
    this.view?.refreshActors();
  }

  private async listActorFolders(dir: string): Promise<string[]> {
    const known: Record<string, string[]> = {
      "CST/_GANG": [
        "Leroy", "Help", "Blood", "Jones", "Mwife", "Cobb", "Flippo", "Side",
        "Buick", "Todd", "Doc", "Quist", "Laurel", "Trotter", "Fear", "Gus",
        "Oona", "Dell", "Isao", "Bolivar", "Dead", "Mayor", "Ned", "Watson",
        "Marie", "Sonoma",
      ],
      "CST/_EXTRA": [
        "Jenix", "dog", "pig", "cow", "horse1", "chicken1", "bird1",
        "Kid", "bounty1", "kidgang1", "shaman", "birdcage",
      ],
      "CST/_TARGET": [
        "birdtarg", "bottle1targ", "can1targ", "can2targ", "can3targ",
        "chicken1targ", "chickexplode", "dummytarg", "gilatarg", "pigtarg",
        "target1", "target2", "target3", "target4", "target5", "target6",
        "target7", "towertarg", "vanetarg", "water1", "water2", "water3",
      ],
      "CST/_MINE": ["skeleton"],
    };
    return known[dir] ?? [];
  }

  private async openSet(name: string): Promise<void> {
    const folder = setFolderFromFile(name);
    if (!folder) {
      this.view?.log(`unknown set ${name}`);
      return;
    }
    const logical = name.replace(/\.set$/i, "").toLowerCase();
    this.currentSet = lightingFamily(logical) || logical;
    this.currentSetFile = name.toLowerCase();
    let graph = this.setGraphs.get(folder);
    if (!graph) {
      graph = await loadSetGraph(folder);
      this.setGraphs.set(folder, graph);
    }
    await this.loadWaypoints(folder);
    this.index.removePrefix("set");
    this.index.removePrefix("scene:");
    await this.addScriptFile("set", `SET/${folder}/Boot Script.json`);
    const files = isTownGridSize(graph.scenes.size)
      ? TOWN_SCENE_FILES
      : [...graph.scenes.values()]
          .map((scene) => scene.name)
          .filter((name, i, all) => Boolean(name) && all.indexOf(name) === i);
    if (isTownGridSize(graph.scenes.size)) {
      await this.addScriptFile("scene:chicken", `SET/${folder}/chicken.json`);
    }
    await Promise.all(
      files.map((fileName) =>
        this.addScriptFile(`scene:${fileName.toLowerCase()}`, `SET/${folder}/${fileName}.json`),
      ),
    );
    if (this.view) {
      const world = this.currentSet === "town" ? WORLD_TOWN : folder;
      const facing = parseDir(String(this.currentDir)) ?? this.view.pose.facing;
      if (openSetShouldStand(graph, this.currentScene, this.currentSet)) {
        const pose = poseForOpenedSet(graph, this.currentScene, facing);
        await this.view.setPose(world, pose);
        this.currentScene = this.sceneNameForPose(graph, pose.x, pose.y);
        this.currentDir = pose.facing;
      } else {
        this.view.world = world;
        this.view.graph = graph;
      }
    }
  }

  private async addScriptFile(key: string, rel: string): Promise<void> {
    // Several files share a key (`stage` = setcursor + gototown). Skipping
    // once `index.has(key)` after the first file left TARGET `gototown`
    // off the bag on the second range visit, so EXIT did nothing.
    if (this.missingScripts.has(rel)) {
      return;
    }
    try {
      let procs = this.scriptProcs.get(rel);
      if (!procs) {
        procs = await loadScriptJson(rel);
        this.scriptProcs.set(rel, procs);
      }
      for (const proc of procs) {
        this.index.add(key, proc, rel);
      }
    } catch {
      this.missingScripts.add(rel);
    }
  }

  /**
   * Load boot + stage + casts + shops so `boot()` can run. Then fire
   * `openprop` (tables, avatar, …). Actor clones (`horse2`) load with
   * the template script on first `sendtoactor`.
   */
  async installLibrary(vm: VM): Promise<void> {
    await this.bootIndex();
    await this.openStage("new.flt");
    await this.openCast("gang.cst");
    await this.openCast("extra.cst");
    await this.openShop("house.prp");
    await this.openShop("inven.prp");
    for (const name of this.pendingOpenProps) {
      const proc = this.index.lookup([`prop:${name}`], "openprop");
      if (proc) {
        await vm.inObject("prop", name, () => vm.runProc(proc));
      }
    }
    this.pendingOpenProps = [];
  }

  /**
   * Unlocked world init: afternoon town (or `?clock=`), cash for tables,
   * `debugging` so extracted `lock*` return false, no story casts.
   */
  async sandboxAdvanceDay(ctx: VM): Promise<void> {
    const fromGlobal = num(ctx.globals.get("clock") ?? 0);
    const requested = this.sandboxClock;
    const clock: ClockSlot =
      requested !== undefined && isClockSlot(requested)
        ? requested
        : isClockSlot(fromGlobal)
          ? fromGlobal
          : 2;
    this.sandboxClock = clock;
    const setBool = (name: string, value: boolean | number | string) => {
      ctx.globals.set(name, value);
      ctx.globalNames.add(name);
    };
    setBool("debugging", true);
    setBool("playercash", 999);
    setBool("playeraccount", 999);
    setBool("bulletcount", 99);
    setBool("clock", clock);
    setBool("phase", 0);
    setBool("playerdeath", "");
    setBool("townscene", "scene g15");
    setBool("dayrobber", 1);
    setBool("fighton", 0);
    const lit = (value: string) => ({ type: "str" as const, value });
    await ctx.inObject("stage", "", () =>
      ctx.evalCall("initall", [lit("town"), lit(sandboxTownSetFile(clock))]),
    );
    await ctx.evalCall("currentscene", [lit("scene g15")]);
    await ctx.evalCall("currentview", [lit("north")]);
    this.settleSandboxWorld(ctx);
    await this.seedSandboxAnimals(ctx);
    await this.seedSandboxTownPeople(ctx);
    await ctx.inObject("actor", "leroy", () => ctx.evalCall("setupactor", [lit("range")]));
    this.view?.refreshActors();
    // Extracted day-1 `advanceday` ends in `postmovie` → `blacktoscreen`.
    this.view?.setFadeOpacity?.(0);
  }

  /**
   * After boot `addinven ("helpbut")` (and after Unlocked `N` `initall`,
   * which clears `handitem`). Story `initprops` would have granted these
   * on day 3/4; Unlocked stays on day 1.
   */
  async seedSandboxInventory(ctx: VM): Promise<void> {
    if (!this.sandbox) {
      return;
    }
    const lit = (value: string) => ({ type: "str" as const, value });
    for (const name of sandboxInventoryToSeed(this.props.values())) {
      await ctx.inObject("shop", "inven", () => ctx.evalCall("addinven", [lit(name)]));
    }
  }

  /** N in Unlocked: swap town/nite (and court/school twins) without advancing `day`. */
  async applySandboxClock(ctx: VM, clock: ClockSlot): Promise<void> {
    if (!this.sandbox || sandboxFightOn(ctx.globals.get("fighton"))) {
      return;
    }
    this.sandboxClock = clock;
    ctx.globals.set("clock", clock);
    ctx.globalNames.add("clock");
    if (this.currentSet !== "town") {
      await this.view?.swapLighting?.();
      this.view?.refreshActors();
      return;
    }
    const lit = (value: string) => ({ type: "str" as const, value });
    await ctx.inObject("stage", "", () =>
      ctx.evalCall("initall", [lit("town"), lit(sandboxTownSetFile(clock))]),
    );
    this.settleSandboxWorld(ctx);
    await this.seedSandboxAnimals(ctx);
    await this.seedSandboxTownPeople(ctx);
    await this.seedSandboxInventory(ctx);
    await ctx.inObject("actor", "leroy", () => ctx.evalCall("setupactor", [lit("range")]));
    this.view?.refreshActors();
  }

  private settleSandboxWorld(ctx: VM): void {
    if (!this.sandbox) {
      return;
    }
    applySandboxStoryFlags(ctx.globals, ctx.globalNames);
    const hidden = [
      ...hideSandboxStoryActors(this.actors.values()),
      ...hideSandboxIdleFighters(
        this.actors.values(),
        sandboxFightOn(ctx.globals.get("fighton")),
        this.sandboxToyPlacements,
      ),
      ...hideRangeCastOffSet(this.currentSet, this.actors.values()),
    ];
    for (const name of hidden) {
      this.stopLoop("actor", name);
    }
    const hand = String(ctx.globals.get("handitem") ?? "");
    const pickups = hideSandboxGroundPickups(this.props.values(), hand);
    for (const name of pickups) {
      this.stopLoop("prop", name);
    }
    this.view?.refreshActors();
  }

  /**
   * EXTRA / TARGET `initactors` skip livestock Unlocked still wants
   * (`day = 1`, afternoon pig, range chicken/pig). Only call after
   * those procs have run, and not from `onArrive` (would reset walks).
   */
  private async seedSandboxAnimals(ctx: VM): Promise<void> {
    if (!this.sandbox) {
      return;
    }
    const lit = (value: string) => ({ type: "str" as const, value });
    const n = (value: number) => ({ type: "num" as const, value });
    for (const row of sandboxTownAnimalsToSeed(this.currentSet, this.actors.values())) {
      await this.ensureActor(row.name);
      if (!this.index.lookup([`actor:${row.name}`], "setupactor")) {
        continue;
      }
      await ctx.inObject("actor", row.name, () => ctx.evalCall("setupactor", [lit(row.where)]));
    }
    for (const row of sandboxRangeAnimalsToSeed(this.currentSet, this.actors.values())) {
      await ctx.evalCall("actorset", [lit(row.name), lit("target")]);
      await ctx.evalCall("actorvisible", [lit(row.name), n(1)]);
      await ctx.evalCall("actorpose", [lit(row.name), lit(row.pose)]);
      await ctx.evalCall("actoris3d", [lit(row.name), n(1)]);
      await ctx.evalCall("actorstar", [lit(row.name), lit(row.star)]);
      await ctx.evalCall("actorspeed", [lit(row.name), n(row.speed)]);
      if (row.z !== undefined) {
        const bird = this.namedActor(row.name);
        bird.z = row.z;
      }
      await ctx.inObject("actor", row.name, () => ctx.evalCall("endwalk", []));
    }
    this.view?.refreshActors();
  }

  /**
   * Re-place Unlocked top-bar toys after `initall` / N. Do not park Dell,
   * Kid, or fight scouts until the player taps a portrait.
   */
  private async seedSandboxTownPeople(ctx: VM): Promise<void> {
    if (!this.sandbox || this.currentSet !== "town") {
      return;
    }
    if (sandboxFightOn(ctx.globals.get("fighton"))) {
      return;
    }
    for (const [name, place] of this.sandboxToyPlacements) {
      await this.placeSandboxToy(ctx, name, place);
    }
    this.view?.refreshActors();
  }

  /** Icon click: stand the actor in the current still, facing the camera. */
  async spawnSandboxToy(ctx: VM, kind: SandboxToyKind | string): Promise<void> {
    const toyKind = sandboxToyKind(kind);
    if (!this.sandbox || !toyKind || this.currentSet !== "town") {
      return;
    }
    if (sandboxFightOn(ctx.globals.get("fighton"))) {
      return;
    }
    const pose = this.view?.pose;
    if (!pose) {
      return;
    }
    const toy = SANDBOX_TOYS.find((row) => row.kind === toyKind);
    if (!toy) {
      return;
    }
    const place = sandboxToyLookPose(pose);
    this.sandboxToyPlacements.set(toy.actor, place);
    await this.placeSandboxToy(ctx, toy.actor, place);
    this.view?.refreshActors();
  }

  private async placeSandboxToy(
    ctx: VM,
    name: string,
    place: { scene: string; deg: number },
  ): Promise<void> {
    const lit = (value: string) => ({ type: "str" as const, value });
    const n = (value: number) => ({ type: "num" as const, value });
    const key = name.toLowerCase();
    await this.ensureActor(key);
    const actor = this.namedActor(key);
    actor.walking = false;
    actor.turning = false;
    actor.route = [];
    await ctx.evalCall("actorset", [lit(key), lit("town")]);
    if (this.index.lookup([`actor:${key}`], "stdactor")) {
      await ctx.inObject("actor", key, () => ctx.evalCall("stdactor", [lit(key)]));
    }
    const x = await ctx.evalCall("scenexyz", [lit(place.scene), n(1)]);
    const y = await ctx.evalCall("scenexyz", [lit(place.scene), n(2)]);
    await ctx.evalCall("actorxyz", [lit(key), n(num(x)), n(num(y)), n(0)]);
    await ctx.evalCall("actoris3d", [lit(key), n(1)]);
    if (sandboxFightActor(key)) {
      await ctx.evalCall("actorscale", [lit(key), n(1500)]);
    }
    await ctx.evalCall("actorpose", [lit(key), lit("stand")]);
    await ctx.evalCall("actordeg", [lit(key), n(place.deg)]);
    await ctx.evalCall("actorvisible", [lit(key), n(1)]);
  }

  /** `?fight=bounty|gang` after Unlocked boot, or a scout click. */
  async startSandboxFight(ctx: VM, kind: "bounty" | "gang"): Promise<void> {
    ctx.globals.set("sandboxfight", kind);
    ctx.globalNames.add("sandboxfight");
    await this.runSandboxOpenFight(ctx);
  }

  /**
   * Extracted `openfight` keys off story `day`. Unlocked stays on day 1;
   * `sandboxfight` selects the bounty or gang branch.
   */
  private async runSandboxOpenFight(ctx: VM): Promise<void> {
    const kind = sandboxFightKind(ctx.globals.get("sandboxfight"));
    if (!kind) {
      return;
    }
    const lit = (value: string) => ({ type: "str" as const, value });
    const n = (value: number) => ({ type: "num" as const, value });
    const setg = (name: string, value: boolean | number | string) => {
      ctx.globals.set(name, value);
      ctx.globalNames.add(name);
    };
    setg("fighton", 1);
    setg("playerhits", 0);
    setg("debugging", false);
    setg("bulletcount", 6);
    const prefix = kind === "bounty" ? "bounty" : "kidgang";
    for (let i = 1; i <= 5; i++) {
      await this.ensureActor(`${prefix}${i}`);
    }
    for (const name of [...this.actors.keys()]) {
      if (!sandboxFightPutdown(name)) {
        continue;
      }
      await ctx.inObject("actor", name, () => ctx.evalCall("initactor", []));
    }
    await ctx.inObject("shop", "inven", () => ctx.evalCall("addinven", [lit("bullets")]));
    await ctx.inObject("shop", "inven", () => ctx.evalCall("addinven", [lit("gun")]));
    await ctx.evalCall("stoploop", [lit("scene"), lit("scene g14")]);
    await ctx.evalCall("closetrackfile", [lit("town.snd")]);
    await ctx.evalCall("closetrackfile", [lit("night.snd")]);
    if (kind === "bounty") {
      for (let i = 1; i <= 5; i++) {
        await ctx.inObject("actor", `bounty${i}`, () =>
          ctx.evalCall("setupactor", [lit("fight")]),
        );
      }
      await ctx.evalCall("actorwarm", [lit("bounty1")]);
      await ctx.evalCall("opentrackfile", [lit("bounty.snd")]);
    } else {
      setg("fightphase", 1);
      await ctx.inObject("prop", "powderkeg1", () => ctx.evalCall("openprop", []));
      for (const keg of ["powderkeg1", "powderkeg2", "powderkeg3"]) {
        await ctx.inObject("prop", keg, () => ctx.evalCall("setupprop", [lit("fight")]));
      }
      for (let i = 1; i <= 3; i++) {
        await ctx.inObject("actor", `kidgang${i}`, () =>
          ctx.evalCall("setupactor", [lit("fight")]),
        );
      }
      for (const name of ["kidgang4", "kidgang5"]) {
        await ctx.evalCall("actorpose", [lit(name), lit("dead")]);
        await ctx.evalCall("actorvisible", [lit(name), n(0)]);
      }
      await ctx.evalCall("actorwarm", [lit("kidgang1")]);
      await ctx.evalCall("opentrackfile", [lit("kid.snd")]);
    }
    await ctx.evalCall("playtheme", [lit("bountytheme")]);
    this.view?.refreshActors();
  }

  private async runSandboxCloseFight(ctx: VM): Promise<void> {
    const lit = (value: string) => ({ type: "str" as const, value });
    const n = (value: number) => ({ type: "num" as const, value });
    const setg = (name: string, value: boolean | number | string) => {
      ctx.globals.set(name, value);
      ctx.globalNames.add(name);
    };
    setg("fighton", 0);
    setg("sandboxfight", "");
    setg("debugging", true);
    for (const name of [...this.sandboxToyPlacements.keys()]) {
      if (sandboxFightActor(name)) {
        this.sandboxToyPlacements.delete(name);
      }
    }
    await ctx.evalCall("closetrackfile", [lit("bountytheme")]);
    for (const keg of ["powderkeg1", "powderkeg2", "powderkeg3"]) {
      await ctx.inObject("prop", keg, () => ctx.evalCall("putdownprop", []));
    }
    for (const actor of this.actors.values()) {
      if (!sandboxFightActor(actor.name)) {
        continue;
      }
      this.stopLoop("actor", actor.name);
      actor.visible = false;
      actor.walking = false;
      actor.turning = false;
      actor.route = [];
    }
    setg("loopsound", "");
    const clock = num(ctx.globals.get("clock") ?? 2);
    if (clock === 3) {
      await ctx.evalCall("opentrackfile", [lit("night.snd")]);
      await ctx.evalCall("makeloop", [lit("scene"), lit("scene g14"), lit("nightfxs"), n(2)]);
    } else {
      await ctx.evalCall("opentrackfile", [lit("town.snd")]);
      await ctx.evalCall("makeloop", [lit("scene"), lit("scene g14"), lit("dayfxs"), n(2)]);
    }
    if (this.currentSet === "town") {
      await this.seedSandboxAnimals(ctx);
      await this.seedSandboxTownPeople(ctx);
      await ctx.inObject("actor", "leroy", () => ctx.evalCall("setupactor", [lit("range")]));
    }
    this.view?.refreshActors();
  }

  /** Apoth `openset` only `setupprop("apoth")` on day 3 afternoon. */
  private async seedSandboxApothBottles(ctx: VM): Promise<void> {
    if (!this.sandbox || !sandboxIsApoth(this.currentSet)) {
      return;
    }
    const lit = (value: string) => ({ type: "str" as const, value });
    await ctx.inObject("prop", "bottles", () => ctx.evalCall("setupprop", [lit("apoth")]));
    sandboxBindApothBottles(this.currentSet, this.namedProp("bottles"));
    this.view?.refreshActors();
  }

  async preloadPuppet(name: string): Promise<void> {
    await this.openPuppet(name, false);
  }

  private async openPuppet(name: string, show: boolean): Promise<void> {
    const stem = name.replace(/\.pup$/i, "").toUpperCase();
    const folder = puppetFolder(stem);
    this.currentPuppetFolder = folder;
    if (!this.loadedPuppets.has(stem)) {
      const manifest = await fetchJson<{ scripts?: string[] }>(
        extractUrl(`${folder}/scripts.json`),
      ).catch(() => null);
      const scripts = manifest?.scripts?.length
        ? manifest.scripts
        : [
            "Boot Script.json",
            "day1.json",
            "day2.json",
            "day3.json",
            "day4.json",
            "day5.json",
          ];
      const csvRel = `${folder}/AUDIO/texts.csv`;
      const [sheet, csvText, bags] = await Promise.all([
        loadPuppetSheet(folder),
        fetch(extractUrl(csvRel))
          .then((r) => (r.ok ? r.text() : ""))
          .catch(() => ""),
        Promise.all(
          scripts.map(async (file) => {
            const rel = `${folder}/${file}`;
            try {
              const procs = await loadScriptJson(rel);
              return {
                label: file.replace(/\.json$/i, "").toLowerCase(),
                rel,
                procs,
              };
            } catch {
              return { label: "", rel, procs: [] as Proc[] };
            }
          }),
        ),
      ]);
      this.puppetScriptBag.set(
        stem,
        bags.filter((item) => item.procs.length),
      );
      if (sheet) {
        this.puppetSheets.set(folder, sheet);
      }
      const wavs: string[] = [];
      const idents: string[] = [];
      const lines = new Map<string, PuppetLine>();
      if (csvText) {
        for (const row of parseCsv(csvText)) {
          const ident = row[2]?.toLowerCase();
          if (!ident) {
            continue;
          }
          const wav = extractUrl(`${folder}/AUDIO/${row[2]}.wav`);
          lines.set(ident, { text: dustMacRoman(row[3] ?? ident), wav });
          wavs.push(wav);
          idents.push(ident);
        }
      }
      this.puppetLineBags.set(folder, lines);
      this.puppetWavs.set(folder, wavs);
      this.puppetIdents.set(folder, idents);
      this.loadedPuppets.add(stem);
    }
    this.installPuppetScripts(stem);
    this.puppetSheet = this.puppetSheets.get(folder) ?? null;
    const wavs = this.wavsFor(folder);
    if (wavs.length) {
      voices.queue(wavs.slice(0, 8));
      void this.ui.preloadVoices(wavs.slice(0, 8));
    }
    // Per-line viseme JSON, not the megabyte blob. Warm every ident so a
    // choice reply is not a late fetch while the WAV already plays.
    for (const ident of this.puppetIdents.get(folder) ?? []) {
      void this.loadVisemeLine(ident);
    }
    if (show) {
      this.currentPuppet = name.toLowerCase();
      this.puppetShown = true;
      if (this.puppetSheet) {
        await this.ui.open(this.puppetSheet);
      }
    } else {
      this.currentPuppet = "none";
    }
  }

  private installPuppetScripts(stem: string): void {
    const bag = this.puppetScriptBag.get(stem) ?? [];
    this.puppetNames.length = 0;
    for (const { label, rel, procs } of bag) {
      this.puppetNames.push(label);
      for (const proc of procs) {
        this.index.add(`puppet:${label}`, proc, rel);
      }
    }
  }

  spriteUrl(actor: ActorState, place: SpritePlace): string {
    return extractUrl(`${actor.spriteRoot}/${place.path}`);
  }

  async loadWaypoints(folder: string): Promise<void> {
    let bag = this.waypointBags.get(folder);
    if (!bag) {
      const waypoints = await fetchJson<Waypoint[]>(extractUrl(`SET/${folder}/waypoints.json`)).catch(
        () => [] as Waypoint[],
      );
      const paths = await fetchJson<StarPath[]>(extractUrl(`SET/${folder}/paths.json`)).catch(
        () => [] as StarPath[],
      );
      bag = { points: waypoints, paths };
      this.waypointBags.set(folder, bag);
    }
    this.waypoints = new Map(bag.points.map((w) => [w.name.toLowerCase(), w]));
    this.paths = bag.paths;
  }

  log(message: string): void {
    this.view?.log(message);
  }

  async placeLeroyAtSign(vm: VM): Promise<ActorState> {
    const leroy = this.namedActor("leroy");
    leroy.cast = "gang";
    leroy.spriteRoot = "CST/_GANG";
    const poses = this.gangSprites.Leroy ?? this.gangSprites.leroy;
    if (poses) {
      leroy.standSprites = poses.stand ?? [];
      leroy.walkSprites = poses.walk ?? [];
      leroy.drinkSprites = poses.drink ?? [];
      leroy.walkTiming = timingForPose(leroy.poseTiming, "stand");
    }
    leroy.standUrl = extractUrl("CST/_GANG/Leroy/stand/frame_68.png");
    // CST/_GANG/Leroy/Script.txt setupactor("sign") → actorstar, stdactor,
    // actorscale 1100, endwalk → leroyidle. Do not invent facing/drink.
    await vm.inObject("actor", "leroy", () =>
      vm.evalCall("setupactor", [{ type: "str", value: "sign" }]),
    );
    return leroy;
  }

  startNightBed(): void {
    this.trackFolder = "_NIGHT";
    this.pendingBed = "town.snd";
  }

  private playBed(name: string): void {
    this.pendingBed = name;
    this.currentTheme = name;
    const url = this.soundUrl(name);
    this.stopBed();
    this.stopLoopSounds();
    const gen = ++this.bedGen;
    void voices.playFx(url, 0.45, true).then((stop) => {
      if (gen !== this.bedGen) {
        stop();
        return;
      }
      this.bedStop = stop;
    });
  }

  resumeBed(): void {
    if (!this.bedStop && this.pendingBed) {
      this.playBed(this.pendingBed);
    }
  }

  private stopBed(): void {
    this.bedGen += 1;
    this.bedStop?.();
    this.bedStop = null;
  }

  private stopLoopSounds(): void {
    this.loopGen += 1;
    for (const stop of this.loopSounds.values()) {
      stop();
    }
    this.loopSounds.clear();
    voices.stopAllLooping();
  }

  private async playVoice(name: string): Promise<void> {
    this.currentVoice = name;
    const url = this.soundUrl(name);
    await voices.play(url);
    if (this.currentVoice === name) {
      this.currentVoice = "none";
    }
  }

  private async playFx(name: string, loop: boolean): Promise<void> {
    const url = this.soundUrl(name);
    const vol = (this.soundVolumes.get(name.toLowerCase()) ?? 160) / 256;
    const gen = this.loopGen;
    const stop = await voices.playFx(url, Math.max(0.15, Math.min(1, vol)), loop);
    if (loop) {
      if (gen !== this.loopGen) {
        stop();
        return;
      }
      this.loopSounds.get(name.toLowerCase())?.();
      this.loopSounds.set(name.toLowerCase(), stop);
    }
  }

  private soundLoop(name: string, on: boolean): number {
    const key = name.toLowerCase();
    if (!on) {
      this.loopSounds.get(key)?.();
      this.loopSounds.delete(key);
      return 0;
    }
    if (this.loopSounds.has(key)) {
      return 1;
    }
    this.loopSounds.set(key, () => undefined);
    void this.playFx(name, true);
    return 1;
  }

  private soundUrl(name: string): string {
    return soundFileUrl(name, this.trackFolder);
  }

  hitsHeldItem(point: Point, handitem: string): boolean {
    const key = handitem.toLowerCase();
    if (!key) {
      return false;
    }
    const prop = this.props.get(key);
    const x = prop?.x || 316;
    const y = prop?.y || 320;
    return Math.abs(x - point.x) < 40 && Math.abs(y - point.y) < 40;
  }

  /** Hub skeletons / season plants have no `mousedown` — they must not eat the sundial still. */
  private hitHasMousedown(kind: "actor" | "prop", name: string): boolean {
    const key = name.toLowerCase();
    if (kind === "actor" && sandboxFightScout(key)) {
      return true;
    }
    if (this.index.lookup([`${kind}:${key}`], "mousedown")) {
      return true;
    }
    if (kind !== "prop") {
      return false;
    }
    const shop = this.props.get(key)?.shop;
    return Boolean(shop && this.index.lookup([`shop:${shop}`], "mousedown"));
  }

  private hitTest(point: Point, handitem = ""): string {
    this.clickAbsorbed = false;
    if (isPuzzleStage(this.currentStageName)) {
      return this.hitTestPuzzle(point);
    }
    const range = this.currentSet === "target";
    const hits: { kind: "actor" | "prop"; name: string; forward: number }[] = [];
    for (const actor of this.nearbyActors()) {
      if (!this.pointHitsSprite(actor, point)) {
        continue;
      }
      const still = viewStill(this.view, actor);
      hits.push({ kind: "actor", name: actor.name, forward: still?.forward ?? 0 });
    }
    for (const prop of this.nearbyProps()) {
      if (isInventoryHudView(prop.view)) {
        continue;
      }
      if (!this.pointHitsProp(prop, point)) {
        continue;
      }
      const hud = prop.view === "large" || prop.view === "panel" || prop.view === "hilite";
      if (hud && point.y < 264) {
        continue;
      }
      const still = !hud ? viewStill(this.view, prop) : null;
      hits.push({
        kind: "prop",
        name: prop.name,
        // Screen overlays (gunhand) sit on the still; they must beat
        // world actors or every click shoots instead of opening reload.
        forward: hud || prop.screen ? -1 : (still?.forward ?? 0),
      });
    }
    const held = handitem.toLowerCase();
    // Town holster box (316, 320) overlaps TARGET EXIT. Range has no
    // holster (`propview ("gun", "empty")`).
    if (
      held &&
      !range &&
      this.hitsHeldItem(point, held) &&
      !hits.some((h) => h.name === held)
    ) {
      hits.push({ kind: "prop", name: held, forward: -1 });
    }
    hits.sort((a, b) => a.forward - b.forward);
    const top = hits.find((hit) => this.hitHasMousedown(hit.kind, hit.name));
    if (top) {
      this.hitKind = top.kind;
      this.clickAbsorbed = true;
      return top.name;
    }
    const hud = this.hitHudButton(point.x, point.y);
    if (hud) {
      this.hitKind = "button";
      this.clickAbsorbed = true;
      return hud;
    }
    if (point.y >= 0 && point.y < 264 && point.x >= 0 && point.x <= 512) {
      this.hitKind = "scene";
      // TARGET `clickfire` only lets `scene k12` fall through to a miss
      // (`updatescore ("%")` / cricket). Any other scene name is treated
      // as a hit and never refreshes % HIT.
      return this.currentSet === "target" ? "scene k12" : this.currentScene;
    }
    this.hitKind = "none";
    return "none";
  }

  private hitTestPuzzle(point: Point): string {
    const shop = this.puzzleShop;
    const items = this.puzzleItems();
    const hits: string[] = [];
    for (const item of [...items].reverse()) {
      const name = item.name;
      if (!name) {
        continue;
      }
      const key = name.toLowerCase();
      if (isReaderBorderProp(key) && !pointHitsReaderBorder(key, point.x, point.y)) {
        continue;
      }
      if (pointHitsFlatItem(item, point.x, point.y)) {
        hits.push(key);
      }
    }
    // FIGHT fists overlay Dell. Fists have no `mousedown` (only knife
    // anims); punches live on Dell. Prefer a prop that handles the click.
    const named = hits.find((name) => this.index.lookup([`prop:${name}`], "mousedown"));
    const pick = named ?? hits[0];
    if (pick) {
      this.hitKind = "prop";
      this.clickAbsorbed = true;
      return pick;
    }
    const hit = hitFlatButton(this.stageHits.get(this.currentFlatName) ?? [], point.x, point.y);
    if (hit) {
      this.hitKind = "button";
      this.clickAbsorbed = true;
      return hit.name;
    }
    if (shop) {
      const shopHits: string[] = [];
      for (const prop of this.props.values()) {
        if (prop.visible && prop.shop === shop && this.pointHitsProp(prop, point)) {
          shopHits.push(prop.name.toLowerCase());
        }
      }
      const handled = shopHits.find((name) => this.index.lookup([`prop:${name}`], "mousedown"));
      const shopPick = handled ?? shopHits[0];
      if (shopPick) {
        this.hitKind = "prop";
        this.clickAbsorbed = true;
        return shopPick;
      }
    }
    this.hitKind = "flat";
    return this.currentFlatName;
  }

  nearbyProps(): PropState[] {
    const puzzle = isPuzzleStage(this.currentStageName);
    return [...this.props.values()].filter((prop) => {
      if (!prop.visible) {
        return false;
      }
      if (puzzle && this.puzzleShop && prop.shop === this.puzzleShop) {
        return false;
      }
      if (prop.name === "avatar") {
        return false;
      }
      if (prop.view === "large" || prop.view === "panel" || prop.view === "hilite") {
        return true;
      }
      const world = this.view?.world ?? "";
      if (
        prop.set &&
        prop.set !== "town" &&
        !setNamesEqual(prop.set, this.currentSet) &&
        !setNamesEqual(prop.set, world)
      ) {
        return false;
      }
      return true;
    });
  }

  private pointHitsSprite(actor: ActorState, point: Point): boolean {
    const still = viewStill(this.view, actor);
    if (!still || !this.view) {
      return false;
    }
    const cam =
      this.view.viewCamera?.() ??
      cameraFromPose(this.view.pose, cameraZOf(this.view.world, this.view.graph));
    return worldSpriteHitsPoint(
      point.x,
      point.y,
      still.x,
      still.y,
      actorSprite(actor, cam),
      actor.scale,
      still.lensForward,
      CST_SCALE_FIELD,
    );
  }

  private pointHitsProp(prop: PropState, point: Point): boolean {
    if (isReaderBorderProp(prop.name)) {
      return pointHitsReaderBorder(prop.name, point.x, point.y);
    }
    if (this.puzzleShop && prop.shop === this.puzzleShop) {
      const item = this.puzzleItems().find((row) => row.name === prop.name);
      return item ? pointHitsFlatItem(item, point.x, point.y) : false;
    }
    if (prop.view === "large" || prop.view === "panel" || prop.view === "hilite") {
      return Math.abs(prop.x - point.x) < 40 && Math.abs(prop.y - point.y) < 40;
    }
    const still = viewStill(this.view, prop);
    if (!still || !this.view) {
      return false;
    }
    const view = (prop.view || "small").toLowerCase();
    const frames =
      prop.sprites[view] ??
      prop.sprites.sit ??
      prop.sprites.stand ??
      prop.sprites.small ??
      prop.sprites.base ??
      Object.values(prop.sprites)[0];
    const frame = frames?.[0];
    const stillScale = prop.screen ? 1 : propStillScale(prop, still.lensForward);
    if (!frame || frame.w <= 0 || frame.h <= 0) {
      return worldSpriteHitsPoint(
        point.x,
        point.y,
        still.x,
        still.y,
        frame,
        prop.scale || 1450,
        still.lensForward,
        PRP_SCALE_FIELD,
      );
    }
    if (isDoorOverlay(prop.name)) {
      return pointInSpriteDest(
        point.x,
        point.y,
        doorOverlayDestRect(still.x, still.y, frame, stillScale),
      );
    }
    return pointInSpriteDest(
      point.x,
      point.y,
      spriteDestRect(still.x, still.y, frame, stillScale),
    );
  }

  private spriteDist(obj: { x: number; y: number; z?: number }): number {
    const still = viewStill(this.view, obj);
    if (!still || !this.view) {
      return 32000;
    }
    const p = playerWorldPoint(this.view.pose);
    return Math.hypot(obj.x - p.x, obj.y - p.y);
  }

  private sceneXyz(name: string, axis: number): Value {
    const parsed = this.scenePose(name);
    const x = parsed ? parsed.x * TILE_SPAN + 128 : 0;
    const y = parsed ? parsed.y * TILE_SPAN + 128 : 0;
    if (axis === 1) {
      return x;
    }
    if (axis === 2) {
      return y;
    }
    if (axis === 3) {
      return 0;
    }
    return { kind: "point", x, y, z: 0 };
  }

  private propField(
    ctx: VM,
    args: Value[],
    field: keyof PropState,
    set: (prop: PropState, value: Value) => void,
  ): Value {
    const prop = this.namedProp(str(args[0] ?? ctx.me));
    if (args.length >= 2) {
      set(prop, args[1]);
      this.view?.refreshActors();
    }
    return prop[field] as Value;
  }

  private propXy(ctx: VM, args: Value[]): Value {
    const prop = this.namedProp(str(args[0] ?? ctx.me));
    if (args.length >= 3) {
      prop.x = num(args[1]);
      prop.y = num(args[2]);
      prop.screen = true;
      this.view?.refreshActors();
      return 0;
    }
    const axis = num(args[1]);
    if (axis === 1) {
      return prop.x;
    }
    if (axis === 2) {
      return prop.y;
    }
    return { kind: "point", x: prop.x, y: prop.y, z: 0 };
  }

  private propXyz(ctx: VM, args: Value[]): Value {
    const prop = this.namedProp(str(args[0] ?? ctx.me));
    if (args.length >= 4) {
      prop.x = num(args[1]);
      prop.y = num(args[2]);
      prop.z = num(args[3]);
      prop.screen = false;
      this.view?.refreshActors();
      return 0;
    }
    const axis = num(args[1]);
    if (axis === 1) {
      return prop.x;
    }
    if (axis === 2) {
      return prop.y;
    }
    if (axis === 3) {
      return prop.z;
    }
    return { kind: "point", x: prop.x, y: prop.y, z: prop.z };
  }

  private setPropStar(ctx: VM, args: Value[]): Value {
    const prop = this.namedProp(str(args[0] ?? ctx.me));
    if (args.length < 2) {
      return prop.star;
    }
    const star = str(args[1]);
    prop.star = star;
    const point = this.starPoint(star);
    if (point) {
      prop.x = point.x;
      prop.y = point.y;
      prop.z = point.z;
    }
    // Hub skeletons are world `propstar`s. `openPuzzleShop` marked them
    // screen (sundial/snake overlays); a star is a SET waypoint.
    prop.screen = false;
    this.view?.refreshActors();
    return star;
  }

  private instanceActor(from: string, to: string): void {
    const src = this.namedActor(from);
    const dest = this.namedActor(to);
    dest.cast = src.cast;
    dest.spriteRoot = src.spriteRoot;
    dest.standSprites = src.standSprites;
    dest.walkSprites = src.walkSprites;
    dest.drinkSprites = src.drinkSprites;
    dest.sprites = src.sprites;
    dest.poseTiming = src.poseTiming;
    dest.scale = src.scale;
    dest.speed = src.speed;
    dest.turnSpeed = src.turnSpeed;
    dest.zclip = src.zclip;
    dest.screen = src.screen;
    dest.is3d = src.is3d;
    this.index.copyKey(`actor:${from.toLowerCase()}`, `actor:${to.toLowerCase()}`);
  }

  private instanceProp(from: string, to: string): void {
    const src = this.namedProp(from);
    const dest = this.namedProp(to);
    const shop = src.shop || this.puzzleShop;
    const bag = this.shopSprites.get(shop)?.[from.toLowerCase()];
    const sprites =
      bag && Object.keys(bag).length
        ? bag
        : Object.keys(src.sprites).length
          ? src.sprites
          : dest.sprites;
    dest.shop = shop;
    dest.spriteRoot = src.spriteRoot || (shop ? `PRP/_${shop.toUpperCase()}` : dest.spriteRoot);
    dest.sprites = sprites;
    dest.poseTiming = src.poseTiming;
    dest.view = src.view;
    dest.scale = src.scale;
    dest.speed = src.speed;
    dest.zclip = src.zclip;
    dest.screen = true;
    dest.dist = src.dist;
    dest.animTick = 0;
    dest.visible = false;
    this.index.copyKey(`prop:${from.toLowerCase()}`, `prop:${to.toLowerCase()}`);
  }

  private makeBall(who: string, args: Value[]): void {
    const prop = this.namedProp(who);
    prop.ball = {
      vx: num(args[1]),
      vy: num(args[2]),
      vz: num(args[3]),
      remaining: Math.max(1, num(args[6] ?? args[5] ?? 40)),
    };
  }

  private advanceBalls(): void {
    if (this.ballsPaused) {
      return;
    }
    const done: string[] = [];
    for (const prop of this.props.values()) {
      const ball = prop.ball;
      if (!ball) {
        continue;
      }
      prop.x += ball.vx;
      prop.y += ball.vy;
      prop.z += ball.vz;
      ball.remaining -= 1;
      if (ball.remaining <= 0) {
        prop.ball = undefined;
        done.push(prop.name);
      }
    }
    if (done.length) {
      this.ballEnds.push(...done);
      this.view?.refreshActors();
    }
  }

  private readonly ballEnds: string[] = [];

  async onArrive(ctx: VM): Promise<void> {
    if (this.view) {
      this.currentScene = this.sceneNameForPose(this.view.graph, this.view.pose.x, this.view.pose.y);
      this.currentDir = this.view.pose.facing;
    }
    this.noticeCamera();
    await ctx.inObject("scene", this.currentScene, () => ctx.evalCall("openscene", []));
    if (ctx.lastFlow === "passcode") {
      await ctx.inObject("set", "", () => ctx.evalCall("openscene", []));
    }
    if (this.sandbox) {
      this.settleSandboxWorld(ctx);
    }
  }

  async onLeave(ctx: VM, scene = this.currentScene): Promise<void> {
    await ctx.inObject("scene", scene, () => ctx.evalCall("closescene", []));
  }

  /**
   * The open-door overlay replaces one still. Leaving that still (turn or
   * tile) runs `initprop` once: close sound + hide. D1 `closescene` is the
   * same call on tile leave; skip if already shut.
   */
  async closeDoorIfLeftOpening(
    ctx: VM,
    destScene: string,
    destFacing: string,
  ): Promise<void> {
    const door = this.props.get("door");
    if (!door?.visible) {
      return;
    }
    const opened = door.openedAt ?? {
      scene: this.currentScene,
      facing: String(this.view?.pose.facing ?? this.currentDir),
    };
    if (doorOpenedStillMatches(opened, destScene, destFacing)) {
      return;
    }
    await ctx.inObject("prop", "door", () => ctx.evalCall("initprop", []));
    door.visible = false;
    door.owner = "none";
    door.openedAt = undefined;
    this.view?.refreshActors();
  }

  /**
   * Boot `keydown`, or Dust `keyrepeat` (sets `isrepeat`, then `keydown`)
   * while a move key is held. Scene gates run on that path.
   */
  async dispatchKey(ctx: VM, arg: string, repeat = false): Promise<void> {
    const value: { type: "str"; value: string }[] = [{ type: "str", value: arg }];
    await ctx.inObject("boot", "", async () => {
      if (repeat && this.index.lookup(["boot"], "keyrepeat")) {
        await ctx.evalCall("keyrepeat", value);
        return;
      }
      if (repeat) {
        ctx.globalNames.add("isrepeat");
        ctx.globals.set("isrepeat", true);
      }
      try {
        await ctx.evalCall("keydown", value);
      } finally {
        if (repeat) {
          ctx.globals.set("isrepeat", false);
        }
      }
    });
  }

  /**
   * The open-door overlay is a 1:1 still replacement. World-projected
   * `hittest` often misses that dest, so a second facade click runs
   * scene `setupprop` and *closes* the door. Hit the same dest we blit.
   */
  openDoorContainsPoint(point: Point): boolean {
    const door = this.props.get("door");
    if (
      !door?.visible ||
      !isDoorOverlay(door.name) ||
      !door.owner ||
      door.owner === "none" ||
      !this.view
    ) {
      return false;
    }
    const facing = String(this.view.pose.facing ?? this.currentDir);
    if (!doorOpenedStillMatches(door.openedAt, this.currentScene, facing)) {
      return false;
    }
    const still = viewStill(this.view, door);
    if (!still) {
      return false;
    }
    const view = (door.view || door.owner).toLowerCase();
    const frames =
      door.sprites[view] ??
      door.sprites[door.owner.toLowerCase()] ??
      Object.values(door.sprites)[0];
    const frame = frames?.[0];
    if (!frame || frame.w <= 0 || frame.h <= 0) {
      return false;
    }
    return pointInSpriteDest(
      point.x,
      point.y,
      doorOverlayDestRect(still.x, still.y, frame, 1),
    );
  }

  /**
   * TARGET reload is gunhand `mousedown` (left-click the revolver).
   * Browser right-click is not in Dust scripts; we map it here so the
   * context menu does not eat the press.
   */
  async dispatchGunhandClick(ctx: VM, point?: Point): Promise<void> {
    const gun = this.props.get("gunhand");
    if (!gun?.visible) {
      return;
    }
    if (point) {
      this.pointer = point;
    }
    await ctx.inObject("prop", "gunhand", () =>
      ctx.evalCall("mousedown", [{ type: "call", name: "mouse", args: [] }]),
    );
  }

  async dispatchMouse(ctx: VM, point: Point): Promise<boolean> {
    this.pointer = point;
    this.clickAbsorbed = false;
    this.hitKind = "none";
    if (this.openDoorContainsPoint(point)) {
      await this.dispatchKey(ctx, "uparrow");
      this.clickAbsorbed = true;
      return true;
    }
    const proc = this.index.lookup(["boot"], "mousedown");
    if (proc) {
      const result = await ctx.inObject("boot", "", () => ctx.runProc(proc, [point]));
      if (this.hitKind === "actor" || this.hitKind === "prop" || result.flow === "exitcode") {
        this.clickAbsorbed = true;
      }
    }
    return this.clickAbsorbed;
  }

  /**
   * Boot `idle` cursor path without `forceupdate`: hittest then
   * `setcursor`. Scene hotspots (`pointinrules`) set `touch`.
   */
  async dispatchCursor(ctx: VM, point: Point): Promise<void> {
    this.pointer = point;
    const gunhand = this.props.get("gunhand");
    if (
      gunhandWantsSight(
        Boolean(gunhand?.visible),
        point,
        gunhand ? this.pointHitsProp(gunhand, point) : false,
      )
    ) {
      this.cursorName = "sight";
      return;
    }
    this.cursorName = "arrow";
    const name = this.hitTest(point, str(ctx.globals.get("handitem") ?? ""));
    const object =
      this.hitKind === "actor"
        ? "actor"
        : this.hitKind === "prop"
          ? "prop"
          : this.hitKind === "scene"
            ? "scene"
            : this.hitKind === "flat"
              ? "flat"
              : this.hitKind === "button"
                ? "button"
                : "";
    if (!object) {
      return;
    }
    await ctx.inObject(object, name, () =>
      ctx.evalCall("setcursor", [{ type: "call", name: "mouse", args: [] }]),
    );
  }

  private async playMovie(name: string): Promise<void> {
    this.lastActionFrame = 0;
    const seen = new Set<string>();
    let current: string | undefined = name;
    let played = false;
    try {
      while (current) {
        const key = current.toLowerCase();
        if (seen.has(key)) {
          break;
        }
        seen.add(key);
        if (this.skipMovies && isIntroMovie(current)) {
          this.view?.log(`skip ${current}`);
          break;
        }
        const folder = movieFolder(current);
        const timeline = await fetchJson<MovieTimeline>(extractUrl(`${folder}/timeline.json`)).catch(
          () => fallbackTimeline(8),
        );
        const hz = timeline.tick_hz || 60;
        const frames = timeline.frames.map((frame) => ({
          url: frameUrl(folder, frame.container),
          holdSec: Math.max(1, frame.hold_ticks || 0) / hz,
          startSec: frame.start_tick / hz,
          action: frame.action ?? 0,
          wait: frame.wait,
          waitAudio: frame.wait_audio,
          hotspots: frame.hotspots,
          timeoutMovie: frame.timeout_movie,
        }));
        const clips = (timeline.clips ?? []).map((clip) => ({
          url: clipUrl(folder, clip.container),
          startSec: clip.start_tick / hz,
          channel: clip.channel,
        }));
        if (this.view?.playMovie && frames.length) {
          const ok = await this.view.playMovie(frames, clips, { keepLayer: true });
          played = true;
          if (ok === false) {
            this.lastActionFrame = actionFrameAfterPlay(true, true);
            return;
          }
        } else {
          this.view?.log(`movie ${current}`);
          played = played || frames.length > 0;
        }
        current = movieChainName(timeline.next);
      }
    } finally {
      this.view?.endMovie?.();
    }
    this.lastActionFrame = actionFrameAfterPlay(played);
  }

  private openTrack(name: string): void {
    this.trackStack.push(this.trackFolder);
    this.trackFolder = sndFolderFromFile(name);
    const clips = trackClipNames(this.trackFolder);
    if (clips.length) {
      void voices.preload(clips.map((clip) => this.soundUrl(clip)));
    }
  }

  private closeTrack(name: string): void {
    if (isGossipTrack(name)) {
      this.trackFolder = this.trackStack.pop() ?? "_UNILIB";
      return;
    }
    this.trackStack.length = 0;
    this.stopBed();
    this.stopLoopSounds();
    this.currentTheme = "none";
    this.trackFolder = "_UNILIB";
  }
}

function viewStill(
  view: WorldView | null,
  obj: { x: number; y: number; z?: number; screen?: boolean },
): StillHit | null {
  if (!view) {
    return null;
  }
  if (obj.screen) {
    return { x: obj.x, y: obj.y, forward: 0, lensForward: 64 };
  }
  if (view.projectWorld) {
    return view.projectWorld(obj);
  }
  const cam = view.viewCamera?.() ?? cameraFromPose(view.pose);
  return worldToStill(obj, cam);
}

/**
 * Stay/hit `mousedown` runs `dealerdraw` with `me` still the button
 * (`flat 2:stay`). Dust `makeloop ("flat", me, "resetgame")` means the
 * current flat, not a button named that.
 */
export function resolveFlatLoopWho(
  kind: string,
  who: string,
  currentFlat: string,
  knownFlats: readonly string[],
): string {
  const name = who.toLowerCase();
  if (kind.toLowerCase() !== "flat") {
    return name;
  }
  if (knownFlats.includes(name)) {
    return name;
  }
  const prefix = name.split(":")[0] ?? name;
  if (knownFlats.includes(prefix)) {
    return prefix;
  }
  return (currentFlat || name).toLowerCase();
}

export function puppetFolder(stem: string): string {
  const name = stem.replace(/\.pup$/i, "").toUpperCase();
  return `PUP/_${name}`;
}

/**
 * `idle 1`–`idle 4` (and any other ident) live in that PUP’s folder.
 * DF.EXE `openpuppetfile` loads that file’s viseme table; a global
 * ident cache paints Leroy extras on Help (shop plate + Picasso head).
 */
export function puppetClipKey(folder: string, ident: string): string {
  const root = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return `${root}/${ident.trim().toLowerCase()}`;
}

async function loadPuppetSheet(folder: string): Promise<PuppetSheet | null> {
  const [data, idleLine] = await Promise.all([
    fetchJson<{
      layers?: Record<string, SpritePlace[]>;
      rest?: Record<string, unknown>;
      restLayers?: Record<string, number>;
    }>(extractUrl(`${folder}/FRAMES/sprites.json`)).catch(() => null),
    fetchJson<VisemeLine>(extractUrl(`${folder}/AUDIO/visemes/idle 1.json`)).catch(
      () => null,
    ),
  ]);
  if (!data?.layers) {
    return null;
  }
  const merged = mergePuppetRest(data, idleLine?.frames?.[0]);
  return {
    folder,
    layers: data.layers,
    rest: Object.keys(merged.rest).length ? merged.rest : undefined,
    restLayers: Object.keys(merged.restLayers).length ? merged.restLayers : undefined,
  };
}

function setFolderFromFile(name: string): string | undefined {
  return SET_FILE[name.toLowerCase()];
}

/** `screentoblack ("current", 30)` — duration is the last number. */
function fadeTicks(args: Value[]): number {
  for (let i = args.length - 1; i >= 0; i--) {
    if (typeof args[i] === "number") {
      return Math.max(0, num(args[i]));
    }
  }
  return 0;
}

const DIR_WORD: Record<string, string> = {
  N: "north",
  S: "south",
  E: "east",
  W: "west",
};

/**
 * Dust keeps `unilib.snd` open after later `opentrackfile` calls. Saloon
 * `openset` switches the track to `saloon1.snd`; Scene D1/C1 still play
 * `voicesound ("swingdoor")` from UNILIB. Prefix `door` covers dooropen
 * and doorclose names; swingdoor does not match that.
 */
const UNILIB_CLIP =
  /^(knock|door|inven|gun|hey|hotbell|gate|ricochet|manfalls|pageturn|swingdoor|dellgrunt)/;

export function soundFileUrl(name: string, trackFolder: string): string {
  const stem = name.replace(/\.(snd|wav)$/i, "");
  const lower = stem.toLowerCase();
  if (name.toLowerCase().endsWith(".snd") || name.toLowerCase().includes(".snd")) {
    return extractUrl(`SND/${trackFolder}/${stem}.snd.wav`);
  }
  const file = name.toLowerCase().endsWith(".wav") ? name : `${stem}.wav`;
  const folder = UNILIB_CLIP.test(lower) ? "_UNILIB" : trackFolder;
  return extractUrl(`SND/${folder}/${file}`);
}

/**
 * Dust `gotoflat (2)` is **1-based** into the stage's flats list
 * (NEW.FLT: 1 mainpanel, 2 map, 3 avatar). Names pass through.
 */
export function resolveFlatName(
  arg: Value,
  flats: readonly string[],
  fallback: string,
): string {
  if (typeof arg === "number" && Number.isFinite(arg)) {
    return flats[Math.trunc(arg) - 1] ?? fallback;
  }
  const name = str(arg).toLowerCase();
  return name || fallback;
}

/** Dust `sendtocast ("target.cst")` / `sendtoshop ("credits.prp")`. */
export function libraryStem(name: string): string {
  return name.replace(/\.(cst|set|prp|flt|pup|snd)$/i, "").toLowerCase();
}

/**
 * HIST.FLT dumps 50 page stills (`frame_3` … `frame_150`) but older
 * extracts skipped `flats.json` (parser cap 32). Build the same table
 * the extractor now writes so `gotoflat ("flat 1")` has a still.
 */
export function fallbackReaderFlats(stem: string): {
  stage: string;
  flats: { name: string; still: number; stillFile: string; hits: FlatHit[] }[];
} | null {
  if (stem.toLowerCase() !== "hist") {
    return null;
  }
  const flats = [];
  for (let i = 0; i < 50; i += 1) {
    const still = (i + 1) * 3;
    flats.push({
      name: `Flat ${i}`,
      still,
      stillFile: `frame_${still}.png`,
      hits: [],
    });
  }
  return { stage: "hist", flats };
}

export function dirWord(dir: Dir | string): string {
  const upper = String(dir).toUpperCase();
  if (DIR_WORD[upper]) {
    return DIR_WORD[upper]!;
  }
  const parsed = parseDir(dir);
  return parsed ? DIR_WORD[parsed]! : String(dir).toLowerCase();
}

async function loadPropSheet(folder: string): Promise<
  { group?: string; state?: string; path?: string; x?: number; y?: number; w?: number; h?: number }[]
> {
  const sidecar = await fetchJson<{
    props?: { group?: string; state?: string; path?: string; x?: number; y?: number; w?: number; h?: number }[];
  }>(extractUrl(`${folder}/sprites.json`)).catch(() => null);
  if (sidecar?.props?.length) {
    return sidecar.props;
  }
  return fetchJson<
    { group?: string; state?: string; path?: string; x?: number; y?: number; w?: number; h?: number }[]
  >(extractUrl(`${folder}/props.json`)).catch(() => []);
}

function truthyArg(value: Value): boolean {
  return value !== 0 && value !== false && value !== "" && value !== undefined;
}

function calcDist(a: Value, b: Value): number {
  const pa = asPoint(a);
  const pb = asPoint(b);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

function asPoint(value: Value): Point {
  if (value && typeof value === "object" && value.kind === "point") {
    return value;
  }
  return { kind: "point", x: 0, y: 0, z: 0 };
}

/**
 * Cast `walktopuppet` saves `walkdest` when `iswalk` is true — including
 * idle `turntodeg`. Named dest is the star; idle is `actorstar`, not
 * `"0,0,0"` (that sent Help/Leroy past the cemetery after talk).
 */
function walkDestOf(actor: ActorState): string {
  if (actor.destStar) {
    return actor.destStar;
  }
  if (actor.walking) {
    return `${Math.trunc(actor.destX)},${Math.trunc(actor.destY)},${Math.trunc(actor.destZ)}`;
  }
  return actor.star;
}

function xyzAxis(args: Value[], x: number, y: number): Value {
  const axis = num(args[0]);
  if (axis === 1) {
    return x;
  }
  if (axis === 2) {
    return y;
  }
  if (axis === 3) {
    return 0;
  }
  return { kind: "point", x, y, z: 0 };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });
}

/** Pace `forceupdate` to one game frame (`framerate` ticks of the 60 Hz clock). */
async function waitGameFrame(framerate: number, started = performance.now()): Promise<void> {
  const ms = gameFrameSec(framerate) * 1000;
  const inVitest = Boolean(
    (globalThis as { process?: { env?: { VITEST?: string } } }).process?.env?.VITEST,
  );
  if (inVitest) {
    await nextFrame();
    return;
  }
  // Wall-clock remainder, not rAF. Sleeping a full extra period after a
  // hitch made CRACK `mouse()` jump half a revolution per pump.
  await sleep(remainingGameFrameMs(performance.now(), started, ms));
}

function warmExtractImages(urls: readonly string[]): void {
  if (typeof Image === "undefined") {
    return;
  }
  for (const url of [...new Set(urls.filter(Boolean))]) {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Undo latin-1 reads of Mac Roman (0xD5 apostrophe became Õ). */
function dustMacRoman(text: string): string {
  const table: Record<number, string> = {
    0xd0: "\u2013",
    0xd1: "\u2014",
    0xd2: "\u201c",
    0xd3: "\u201d",
    0xd4: "\u2018",
    0xd5: "\u2019",
  };
  return text.replace(/[\u0080-\u00ff]/g, (ch) => table[ch.charCodeAt(0)] ?? ch);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) {
      continue;
    }
    rows.push(splitCsvLine(line));
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
