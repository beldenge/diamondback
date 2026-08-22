import type { Proc } from "../vm/ast";
import { num, str, VM, type OpcodeHost, type Value } from "../vm/runtime";
import { extractUrl } from "../world/set/extract";
import type { Dir, SetGraph, WalkerPose } from "../world/set/types";
import { loadSetGraph, parseDir, sceneByName, tileKey, WORLD_TOWN } from "../world/set/graph";
import { routeToStar, type RoutePoint, type StarPath } from "../world/set/path";
import {
  calcDeg,
  calcVect,
  cameraFromPose,
  cameraWorldPoint,
  degDelta,
  dirToDeg,
  DRINK_HOLD_FRAMES,
  gameFrameSec,
  playerWorldPoint,
  worldToStill,
  wrapDeg,
} from "./facing";
import type { ViewCamera } from "./facing";
import { ScriptIndex, loadScriptJson } from "./scripts";
import { asCenter, type PuppetSheet, type PuppetUi, type SpritePlace, type VisemeLine } from "./ui";
import { voices } from "./speech";

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
  speed: number;
  turnSpeed: number;
  walking: boolean;
  turning: boolean;
  destX: number;
  destY: number;
  destZ: number;
  /** Remaining SET-road waypoints after the current `dest*` (named `walktostar`). */
  route: RoutePoint[];
  degTarget: number;
  walkStep: number;
  walkAcc: number;
  /** CST setInfo +0x2e table for the current walk strip (1-based pose ids). */
  walkTiming: number[];
  zclip: number;
  standSprites: SpritePlace[];
  walkSprites: SpritePlace[];
  drinkSprites: SpritePlace[];
  spriteRoot: string;
  standUrl?: string;
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
  log(message: string): void;
  refreshActors(): void;
  /** Camera during a SET filmstrip; defaults to the standing pose. */
  viewCamera?(): ViewCamera;
}

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

export class DustHost implements OpcodeHost {
  readonly index = new ScriptIndex();
  readonly actors = new Map<string, ActorState>();
  readonly props = new Map<string, { owner: string; visible: boolean }>();
  waypoints = new Map<string, Waypoint>();
  paths: StarPath[] = [];
  currentSet = "none";
  currentSetFile = "";
  currentScene = "";
  currentDir: Dir | string = "N";
  currentPuppet = "none";
  readonly puppetNames: string[] = [];
  private puppetLines = new Map<
    string,
    { text: string; wav: string; viseme?: VisemeLine }
  >();
  private visemeLines = new Map<string, VisemeLine>();
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
  /** `random (n)` → `floor(rng() * n)`. Tests pin idle drink vs pivot. */
  rng = Math.random;
  frameCounter = 0;
  /** Nested `forceupdate` count. Game tick must not also step actors. */
  scriptPump = 0;
  private readonly loops = new Map<string, ScriptLoop>();
  private readonly dueLoops: ScriptLoop[] = [];
  private readonly walkEnds: string[] = [];
  private readonly turnEnds: string[] = [];
  private loopAcc = 0;
  view: WorldView | null = null;
  skipMovies = true;
  currentVoice = "none";
  currentTheme = "none";
  cursorName = "arrow";
  private trackFolder = "_UNILIB";
  private bed: HTMLAudioElement | null = null;
  private pendingBed: string | null = null;
  private puppetSheet: PuppetSheet | null = null;
  private gangSprites: Record<string, Record<string, SpritePlace[]>> = {};

  constructor(readonly ui: PuppetUi) {}

  lookup(name: string, ctx: VM): Proc | undefined {
    return this.index.lookup(this.lookupKeys(ctx), name);
  }

  private lookupKeys(ctx: VM): string[] {
    const keys: string[] = [];
    const me = (ctx.me || "").toLowerCase();
    if (ctx.object === "actor" && me) {
      keys.push(`actor:${me}`);
      const actor = this.actors.get(me);
      if (actor) {
        keys.push(`cast:${actor.cast}`);
      }
    } else if (ctx.object === "cast" && me) {
      keys.push(`cast:${me}`);
    } else if (ctx.object === "shop" && me) {
      keys.push(`shop:${me}`);
    } else if (ctx.object === "puppet") {
      if (me) {
        keys.push(`puppet:${me}`);
      }
      keys.push("puppet:boot script");
    } else if (ctx.object === "scene" && me) {
      keys.push(`scene:${me}`);
      keys.push("set");
    } else if (ctx.object === "set") {
      keys.push("set");
    } else if (ctx.object === "stage") {
      keys.push("stage");
    } else if (ctx.object === "boot") {
      keys.push("boot");
    } else if (ctx.object === "flat" && me) {
      keys.push(`flat:${me}`);
    }
    keys.push("stage", "boot");
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
      case "blackscreen":
      case "blacktoscreen":
      case "screentoblack":
      case "clut":
      case "visualeffect":
      case "plain":
      case "showcursor":
      case "flushevents":
      case "closetrackfile":
      case "halttheme":
      case "haltsound":
      case "haltvoice":
      case "stopball":
      case "pausewalk":
      case "pauseball":
      case "mixclut":
      case "notedialog":
      case "message":
        return 0;
      case "cursor":
        this.cursorName = str(args[0] || "arrow").toLowerCase();
        return 0;
      case "hidecursor":
        this.cursorName = "watch";
        return 0;
      case "path":
      case "propview":
      case "propxy":
      case "propxyz":
        return 0;
      case "findfile":
      case "fileexists":
        return true;
      case "optionkey":
      case "shiftkey":
      case "commandkey":
        return false;
      case "substring":
        return str(args[0]).toLowerCase().includes(str(args[1]).toLowerCase())
          ? 1
          : 0;
      case "quit":
        this.view?.log("quit");
        return 0;
      case "error":
        this.view?.log("script error()");
        return 0;
      case "currentvoice":
        return this.currentVoice;
      case "currenttheme":
        return this.currentTheme;
      case "currentsound":
        return "none";
      case "voicesound":
        this.playOneShot(str(args[0]));
        return 0;
      case "singlesound":
      case "dualsound":
      case "multiplesound":
        this.playOneShot(str(args[0]));
        return 0;
      case "opentrackfile":
        this.trackFolder = `_${str(args[0]).replace(/\.snd$/i, "").toUpperCase()}`;
        return 0;
      case "playtheme":
        this.playBed(str(args[0]));
        return 0;
      case "forceupdate":
        this.scriptPump += 1;
        try {
          this.advanceActorsOnce();
          await this.runQueued(ctx);
          await waitGameFrame(this.framerateValue);
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
      case "random":
        return Math.floor(this.rng() * Math.max(1, num(args[0])));
      case "numtostring":
        return String(Math.trunc(num(args[0])));
      case "stringtonum":
        return num(args[0]);
      case "findword":
        return findWord(str(args[0]), str(args[1]), num(args[2]));
      case "playmovie":
        this.view?.log(`movie ${str(args[0])}`);
        return 0;
      case "delay":
        await sleep(Math.max(0, num(args[0]) / 60) * 1000);
        return 0;
      case "opencastfile":
        await this.openCast(str(args[0]));
        return 0;
      case "openshopfile":
        await this.openShop(str(args[0]));
        return 0;
      case "openstagefile":
        await this.openStage(str(args[0]));
        return 0;
      case "opensetfile":
        await this.openSet(str(args[0]));
        {
          const hook = this.index.lookup(["set"], "openset");
          if (hook) {
            await ctx.runProc(hook);
          }
        }
        return 0;
      case "closesetfile":
        this.currentSet = "none";
        this.currentSetFile = "";
        return 0;
      case "openpuppetfile":
        await this.openPuppet(str(args[0]), true);
        return 0;
      case "closepuppetfile":
        this.currentPuppet = "none";
        this.ui.close();
        if (this.cursorName === "watch") {
          this.cursorName = "arrow";
        }
        return 0;
      case "currentset":
        return this.currentSet;
      case "currentpuppet":
        return this.currentPuppet;
      case "currentstage":
        return this.index.has("stage") ? "new" : "none";
      case "currentflat":
        return "none";
      case "currentscene":
        if (args.length) {
          return this.handleScene(str(args[0]));
        }
        return this.currentScene;
      case "currentdir":
      case "currentview":
        if (args.length) {
          const dir = parseDir(str(args[0]));
          if (dir) {
            this.currentDir = dir;
            if (this.view) {
              this.view.pose = { ...this.view.pose, facing: dir };
            }
          }
          return str(args[0]);
        }
        return String(this.currentDir).toLowerCase();
      case "setvisible":
      case "stagevisible":
        return true;
      case "countactors":
        return this.actors.size;
      case "indextoactor": {
        const i = num(args[0]) - 1;
        return [...this.actors.keys()][i] ?? "";
      }
      case "countprops":
        return this.props.size;
      case "indextoprop": {
        const i = num(args[0]) - 1;
        return [...this.props.keys()][i] ?? "";
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
          this.ensureProp(str(args[0])).visible = Boolean(args[1]);
        }
        return this.ensureProp(str(args[0])).visible;
      case "actorvisible":
        return this.actorField(ctx, args, "visible", (actor, value) => {
          actor.visible = truthyArg(value);
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
        return 0;
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
        return `${actor.destX},${actor.destY},${actor.destZ}`;
      }
      case "stopwalk": {
        const who = str(args[0] ?? ctx.me).toLowerCase();
        if (who === "all") {
          for (const actor of this.actors.values()) {
            actor.walking = false;
            actor.turning = false;
            actor.route = [];
            actor.pose = "stand";
          }
        } else {
          const actor = this.namedActor(who);
          actor.walking = false;
          actor.turning = false;
          actor.route = [];
          actor.pose = "stand";
        }
        return 0;
      }
      case "iswalk": {
        const actor = this.namedActor(str(args[0] ?? ctx.me));
        return actor.walking || actor.turning;
      }
      case "currentdeg":
        if (args.length) {
          return num(args[0]);
        }
        return this.view ? dirToDeg(this.view.pose.facing) : 128;
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
        this.bevels = [];
        this.ui.clear();
        return 0;
      case "puppetbevel":
        this.bevels.push({ label: str(args[0]), id: num(args[1]) });
        this.ui.addBevel({ label: str(args[0]), id: num(args[1]) });
        return 0;
      case "puppetspeak":
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
        if (this.bevels.length === 0) {
          return -1;
        }
        return this.ui.waitEvent();
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

  private actorXyz(ctx: VM, args: Value[]): Value {
    const actor = this.namedActor(str(args[0] ?? ctx.me));
    if (args.length >= 4) {
      actor.x = num(args[1]);
      actor.y = num(args[2]);
      actor.z = num(args[3]);
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
      const [x, y, z] = dest.split(",").map(Number);
      actor.star = "custom";
      actor.route = [];
      this.startWalk(actor, x || 0, y || 0, z || 0);
      return 0;
    }
    const star = str(args[1]);
    const fromStar = actor.star;
    actor.star = star;
    const point = this.starPoint(star);
    if (point) {
      const destPt = { x: point.x, y: point.y, z: point.z };
      const hops = routeToStar(this.paths, fromStar, star, actor.x, actor.y, destPt);
      const first = hops[0] ?? destPt;
      actor.route = hops.slice(1);
      this.startWalk(actor, first.x, first.y, first.z);
    }
    return 0;
  }

  startWalk(actor: ActorState, x: number, y: number, z: number, continueCycle = false): void {
    actor.destX = x;
    actor.destY = y;
    actor.destZ = z;
    actor.walking = true;
    actor.pose = "walk";
    if (!continueCycle) {
      actor.walkStep = 0;
      actor.walkAcc = 0;
    }
    const dx = x - actor.x;
    const dy = y - actor.y;
    if (dx !== 0 || dy !== 0) {
      actor.deg = this.facingForWalk(actor, x, y);
    }
    this.view?.refreshActors();
  }

  /**
   * Town `walktopuppet` walks to `playerxyz`. Face the camera
   * (`currentdeg + 128`) so the approach is straight-on, not the
   * sub-tile diagonal (Leroy 76 east of O7). Path hops use `calcdeg`
   * to the next vertex. Only the final beeline to the player (empty
   * route) uses the camera.
   */
  private facingForWalk(actor: ActorState, x: number, y: number): number {
    const pose = this.view?.pose;
    if (pose && actor.route.length === 0) {
      const px = playerWorldPoint(pose).x;
      const py = playerWorldPoint(pose).y;
      if (Math.hypot(x - px, y - py) < 2) {
        return wrapDeg(dirToDeg(pose.facing) + 128);
      }
    }
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
    let moved = false;
    for (const actor of this.actors.values()) {
      if (actor.walking) {
        const dx = actor.destX - actor.x;
        const dy = actor.destY - actor.y;
        const dist = Math.hypot(dx, dy);
        const step = actor.speed;
        if (dist <= step) {
          actor.x = actor.destX;
          actor.y = actor.destY;
          actor.z = actor.destZ;
          if (actor.route.length > 0) {
            const next = actor.route.shift()!;
            this.startWalk(actor, next.x, next.y, next.z, true);
          } else {
            actor.walking = false;
            actor.pose = "stand";
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
    const ticks = Math.max(1, Math.trunc(delay));
    const key = this.loopKey(kind, who);
    this.loops.set(key, {
      kind: kind.toLowerCase(),
      who: who.toLowerCase(),
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
      return;
    }
    this.loops.delete(this.loopKey(type, name));
  }

  private pauseLoop(kind: string, who: string, paused: boolean): void {
    const type = kind.toLowerCase();
    const name = who.toLowerCase();
    for (const loop of this.loops.values()) {
      if (loop.kind === type && (name === "all" || loop.who === name)) {
        loop.paused = paused;
      }
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

  async runQueued(ctx: VM): Promise<void> {
    const ends = this.walkEnds.splice(0);
    const turns = this.turnEnds.splice(0);
    const due = this.dueLoops.splice(0);
    for (const name of ends) {
      await ctx.inObject("actor", name, () => ctx.evalCall("endwalk", []));
    }
    for (const name of turns) {
      await ctx.inObject("actor", name, () => ctx.evalCall("endturn", []));
    }
    for (const loop of due) {
      await ctx.inObject(loop.kind, loop.who, () => ctx.evalCall(loop.proc, []));
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
      const actor = this.actors.get(loop.who);
      if (!actor?.visible || actor.pose !== "stand") {
        continue;
      }
      loop.remaining = Math.min(loop.remaining, 1);
    }
  }

  private handleScene(arg: string): string {
    const lower = arg.toLowerCase();
    if (lower === "strait" || lower === "left" || lower === "right") {
      this.view?.walk(lower === "strait" ? "strait" : lower);
      return this.currentScene;
    }
    this.currentScene = lower.startsWith("scene") ? lower : `scene ${lower}`;
    const graph = this.view?.graph;
    if (graph) {
      const scene = sceneByName(graph, this.currentScene);
      if (scene && this.view) {
        void this.view.setPose(this.view.world, {
          x: scene.x,
          y: scene.y,
          facing: parseDir(String(this.currentDir)) ?? this.view.pose.facing,
        });
      }
    }
    return this.currentScene;
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
        speed: 3,
        turnSpeed: 7,
        walking: false,
        turning: false,
        destX: 0,
        destY: 0,
        destZ: 0,
        route: [],
        degTarget: 0,
        walkStep: 0,
        walkAcc: 0,
        walkTiming: [],
        zclip: 32,
        standSprites: [],
        walkSprites: [],
        drinkSprites: [],
        spriteRoot: "",
      };
      this.actors.set(key, actor);
    }
    return actor;
  }

  ensureProp(name: string): { owner: string; visible: boolean } {
    const key = name.toLowerCase();
    let prop = this.props.get(key);
    if (!prop) {
      prop = { owner: "none", visible: false };
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
    const cam = this.view?.viewCamera?.() ?? cameraFromPose(pose);
    const world = this.view?.world ?? WORLD_TOWN;
    return [...this.actors.values()].filter((actor) => {
      if (!actor.visible) {
        return false;
      }
      if (actor.set && actor.set !== world && actor.set !== this.currentSet) {
        return false;
      }
      return worldToStill(actor, cam) !== null;
    });
  }

  private async speak(ident: string): Promise<void> {
    const key = ident.toLowerCase();
    const line = this.puppetLines.get(key);
    void this.loadVisemeLine(key).then((viseme) => {
      if (!viseme) {
        return;
      }
      if (line) {
        line.viseme = viseme;
      }
      this.ui.setViseme(viseme);
    });
    await this.ui.speak(line?.text ?? ident, line?.wav, line?.viseme);
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
    const hit = this.visemeLines.get(ident);
    if (hit) {
      return hit;
    }
    const folder = this.currentPuppetFolder;
    if (!folder) {
      return undefined;
    }
    const data = await fetchJson<VisemeLine>(
      extractUrl(`${folder}/AUDIO/visemes/${ident}.json`),
    ).catch(() => null);
    if (!data?.frames?.length) {
      return undefined;
    }
    this.visemeLines.set(ident, data);
    return data;
  }

  async bootIndex(): Promise<void> {
    const boot = await loadScriptJson("BOOT/_BOOTFILE/Script 1.json");
    for (const proc of boot) {
      this.index.add("boot", proc, "BOOT/_BOOTFILE/Script 1.json");
    }
  }

  async loadGangSprites(): Promise<void> {
    const data = await fetchJson<{
      actors?: Record<string, Record<string, SpritePlace[]>>;
    }>(extractUrl("CST/_GANG/sprites.json")).catch(() => null);
    this.gangSprites = data?.actors ?? {};
    const timing = await fetchJson<Record<string, Record<string, number[]>>>(
      extractUrl("CST/_GANG/timing.json"),
    ).catch(() => ({} as Record<string, Record<string, number[]>>));
    for (const [name, poses] of Object.entries(this.gangSprites)) {
      const actor = this.namedActor(name);
      actor.spriteRoot = "CST/_GANG";
      actor.standSprites = poses.stand ?? [];
      actor.walkSprites = poses.walk ?? [];
      actor.drinkSprites = poses.drink ?? [];
      actor.walkTiming = timing[name]?.walk ?? timing[name.toLowerCase()]?.walk ?? [];
    }
  }

  private async openStage(name: string): Promise<void> {
    const folder = setFolderFromFile(name) ?? "_NEW";
    const stem = name.replace(/\.flt$/i, "").toUpperCase();
    const rel = name.toLowerCase().endsWith(".flt")
      ? `FLT/_${stem}/setcursor _arg_.json`
      : `FLT/${folder}/setcursor _arg_.json`;
    try {
      const procs = await loadScriptJson(rel);
      for (const proc of procs) {
        this.index.add("stage", proc, rel);
      }
    } catch {
      const fallback = `FLT/_NEW/setcursor _arg_.json`;
      const procs = await loadScriptJson(fallback);
      for (const proc of procs) {
        this.index.add("stage", proc, fallback);
      }
    }
  }

  private async openShop(name: string): Promise<void> {
    const stem = name.replace(/\.prp$/i, "").toUpperCase();
    const key = `shop:${stem.toLowerCase()}`;
    const prefix = `PRP/_${stem}`;
    const files = stem === "INVEN"
      ? ["setcursor _arg__1.json"]
      : ["setcursor _arg__1.json"];
    for (const file of files) {
      try {
        const procs = await loadScriptJson(`${prefix}/${file}`);
        for (const proc of procs) {
          this.index.add(key, proc, `${prefix}/${file}`);
        }
      } catch {
        /* optional */
      }
    }
  }

  private async openCast(name: string): Promise<void> {
    const stem = name.replace(/\.cst$/i, "").toUpperCase();
    const key = `cast:${stem.toLowerCase()}`;
    const prefix = `CST/_${stem}`;
    try {
      const procs = await loadScriptJson(`${prefix}/Cast.json`);
      for (const proc of procs) {
        this.index.add(key, proc, `${prefix}/Cast.json`);
      }
    } catch {
      this.view?.log(`cast library missing for ${name}`);
    }
    const catalog = await fetchJson<{ files?: Record<string, { dir?: string }> }>(
      extractUrl("catalog.json"),
    ).catch(() => null);
    const dir = catalog?.files?.[name.toLowerCase()]?.dir ?? prefix;
    const listing = await this.listActorFolders(dir);
    for (const actor of listing) {
      try {
        const rel = `${dir}/${actor}/Script.json`;
        const procs = await loadScriptJson(rel);
        for (const proc of procs) {
          this.index.add(`actor:${actor.toLowerCase()}`, proc, rel);
        }
        const stand = await firstStand(dir, actor);
        const state = this.namedActor(actor);
        state.cast = stem.toLowerCase();
        state.standUrl = stand;
      } catch {
        /* skip */
      }
    }
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
    this.currentSet = logical === "nite" ? "town" : logical;
    this.currentSetFile = name.toLowerCase();
    const graph = await loadSetGraph(folder);
    await this.loadWaypoints(folder);
    try {
      const boot = await loadScriptJson(`SET/${folder}/Boot Script.json`);
      for (const proc of boot) {
        this.index.add("set", proc, `SET/${folder}/Boot Script.json`);
      }
    } catch {
      /* some sets have no boot */
    }
    if (this.view) {
      const world = this.currentSet === "town" ? WORLD_TOWN : folder;
      let pose = this.view.pose;
      const named = sceneByName(graph, this.currentScene);
      if (named && graph.cameraTiles.has(tileKey(named.x, named.y))) {
        pose = {
          x: named.x,
          y: named.y,
          facing: parseDir(String(this.currentDir)) ?? pose.facing,
        };
      }
      await this.view.setPose(world, pose);
    }
    const openset = this.index.lookup(["set"], "openset");
    if (openset && this.view) {
      /* caller may invoke openset */
    }
    void graph;
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
      if (csvText) {
        for (const row of parseCsv(csvText)) {
          const ident = row[2]?.toLowerCase();
          if (!ident) {
            continue;
          }
          const wav = extractUrl(`${folder}/AUDIO/${row[2]}.wav`);
          this.puppetLines.set(ident, { text: dustMacRoman(row[3] ?? ident), wav });
          wavs.push(wav);
          idents.push(ident);
        }
      }
      this.puppetWavs.set(folder, wavs);
      this.puppetIdents.set(folder, idents);
      this.loadedPuppets.add(stem);
    }
    this.installPuppetScripts(stem);
    this.puppetSheet = this.puppetSheets.get(folder) ?? null;
    const wavs = this.wavsFor(folder).slice(0, 8);
    if (wavs.length) {
      voices.queue(wavs);
      void this.ui.preloadVoices(wavs);
    }
    for (const ident of (this.puppetIdents.get(folder) ?? []).slice(0, 2)) {
      void this.loadVisemeLine(ident);
    }
    if (show) {
      this.currentPuppet = name.toLowerCase();
      if (this.puppetSheet) {
        this.ui.open(this.puppetSheet);
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
    const waypoints = await fetchJson<Waypoint[]>(extractUrl(`SET/${folder}/waypoints.json`)).catch(
      () => [] as Waypoint[],
    );
    this.waypoints = new Map(waypoints.map((w) => [w.name.toLowerCase(), w]));
    this.paths = await fetchJson<StarPath[]>(extractUrl(`SET/${folder}/paths.json`)).catch(
      () => [] as StarPath[],
    );
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
    const url = this.soundUrl(name);
    this.stopBed();
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.45;
    this.bed = audio;
    this.currentTheme = name;
    void audio.play().catch(() => {
      /* first user gesture will retry */
    });
  }

  resumeBed(): void {
    if (!this.bed && this.pendingBed) {
      this.playBed(this.pendingBed);
      return;
    }
    if (this.bed && this.bed.paused) {
      void this.bed.play().catch(() => undefined);
    }
  }

  private stopBed(): void {
    if (!this.bed) {
      return;
    }
    this.bed.pause();
    this.bed.src = "";
    this.bed = null;
  }

  private playOneShot(name: string): void {
    this.currentVoice = name;
    const audio = new Audio(this.soundUrl(name));
    audio.volume = 0.8;
    audio.addEventListener("ended", () => {
      if (this.currentVoice === name) {
        this.currentVoice = "none";
      }
    });
    void audio.play().catch(() => {
      this.currentVoice = "none";
    });
  }

  private soundUrl(name: string): string {
    const stem = name.replace(/\.(snd|wav)$/i, "");
    if (name.toLowerCase().endsWith(".snd") || name.toLowerCase().includes(".snd")) {
      return extractUrl(`SND/${this.trackFolder}/${stem}.snd.wav`);
    }
    const file = name.toLowerCase().endsWith(".wav") ? name : `${stem}.wav`;
    return extractUrl(`SND/${this.trackFolder}/${file}`);
  }
}

export function puppetFolder(stem: string): string {
  const name = stem.replace(/\.pup$/i, "").toUpperCase();
  return `PUP/_${name}`;
}

async function loadPuppetSheet(folder: string): Promise<PuppetSheet | null> {
  const data = await fetchJson<{
    layers?: Record<string, SpritePlace[]>;
    rest?: Record<string, unknown>;
    restLayers?: Record<string, number>;
  }>(extractUrl(`${folder}/FRAMES/sprites.json`)).catch(() => null);
  if (!data?.layers) {
    return null;
  }
  const rest = normalizeCenters(data.rest);
  const restLayers: Record<string, number> = {};
  if (data.restLayers) {
    for (const [name, value] of Object.entries(data.restLayers)) {
      const index = Number(value);
      if (Number.isFinite(index)) {
        restLayers[name] = index;
      }
    }
  }
  return {
    folder,
    layers: data.layers,
    rest: Object.keys(rest).length ? rest : undefined,
    restLayers: Object.keys(restLayers).length ? restLayers : undefined,
  };
}

function normalizeCenters(
  raw: Record<string, unknown> | undefined,
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  if (!raw) {
    return out;
  }
  for (const [name, value] of Object.entries(raw)) {
    const center = asCenter(value);
    if (center) {
      out[name] = center;
    }
  }
  return out;
}

function setFolderFromFile(name: string): string | undefined {
  return SET_FILE[name.toLowerCase()];
}

function truthyArg(value: Value): boolean {
  return value !== 0 && value !== false && value !== "" && value !== undefined;
}

function calcDist(a: Value, b: Value): number {
  const pa = asPoint(a);
  const pb = asPoint(b);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

function asPoint(value: Value): { x: number; y: number; z: number } {
  if (value && typeof value === "object" && value.kind === "point") {
    return value;
  }
  return { x: 0, y: 0, z: 0 };
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

function findWord(list: string, sep: string, index: number): string {
  const parts = list.split(sep).filter((p) => p.length > 0);
  return parts[index - 1] ?? parts[0] ?? "";
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
async function waitGameFrame(framerate: number): Promise<void> {
  const ms = gameFrameSec(framerate) * 1000;
  const t0 = performance.now();
  await nextFrame();
  const left = ms - (performance.now() - t0);
  const inVitest = typeof process !== "undefined" && Boolean(process.env?.VITEST);
  if (!inVitest && left > 1) {
    await sleep(left);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} ${res.status}`);
  }
  return (await res.json()) as T;
}

async function firstStand(dir: string, actor: string): Promise<string | undefined> {
  return extractUrl(`${dir}/${actor}/stand/frame_0.png`);
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
