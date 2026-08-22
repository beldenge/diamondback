import { Clock, Color, WebGLRenderer } from "three";
import { VM } from "../vm/runtime";
import {
  applyTransition,
  stillClickInput,
  stillClickPixel,
  transitionForInput,
  type WalkInput,
} from "../world/set/walker";
import { createStillAnim, tickStillAnim, type StillAnim } from "../world/set/playback";
import {
  STILL_FRAME_SEC,
  STILL_HEIGHT,
  STILL_WIDTH,
  type SetGraph,
  type SetTransition,
  type WalkerPose,
} from "../world/set/types";
import {
  closeSfx,
  doorAt,
  doorMatchesPose,
  doorOnPose,
  exitTownPose,
  goWorld,
  hitCenter,
  overlaySprite,
  sceneNameOf,
  type DoorDef,
} from "../world/set/doors";
import { playSfx } from "../world/set/sfx";
import {
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
import { StillsView } from "../world/set/stillsView";
import {
  actorSprite,
  actorStillHeight,
  cameraFromPose,
  lerpViewCamera,
  spriteStillTopLeft,
  worldToStill,
  type ViewCamera,
} from "./facing";
import {
  actorWorldZ,
  blitSpriteZ,
  sampleNearZ,
  spriteBitsFromImageData,
  zPlaneFromImageData,
  type SpriteBits,
} from "./occlude";
import { DustHost, type WorldView } from "./host";
import { loadScriptJson } from "./scripts";
import {
  FlatOverlay,
  hitMacRect,
  MAINPANEL_BUTTONS,
  stageFromHudClick,
} from "./hud";
import { playStageRect } from "./stage";
import { PLAY_HUD_CHROME, PLAY_HUD_FACE_NIGHT, PuppetUi } from "./ui";
import { unlockVoices } from "./speech";

const CURSORS: Record<string, string> = {
  arrow: "/rsrc/cursors/arrow.cur",
  touch: "/rsrc/cursors/touch.cur",
  goleft: "/rsrc/cursors/goleft.cur",
  goright: "/rsrc/cursors/goright.cur",
  gostrait: "/rsrc/cursors/gostrait.cur",
  watch: "/rsrc/cursors/watch.cur",
  hand: "/rsrc/cursors/hand.cur",
  fist: "/rsrc/cursors/fist.cur",
};

export { worldToStill } from "./facing";

export class PlayGame implements WorldView {
  pose: WalkerPose = { x: 6, y: 14, facing: "N" };
  world = WORLD_TOWN;
  graph!: SetGraph;

  private readonly renderer: WebGLRenderer;
  private readonly clock = new Clock();
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
  private hqGen = 0;
  private busy = false;
  /** `mousedown` / puppet — freeze world actors; SET walks must not. */
  private talking = false;
  private readonly heldKeys = new Set<string>();
  private booting = true;
  private scriptsReady = false;
  private logLine = "";
  private readonly actorLayer: HTMLDivElement;
  private readonly actorCanvas: HTMLCanvasElement;
  private readonly actorCtx: CanvasRenderingContext2D;
  private readonly pick = new Uint16Array(STILL_WIDTH * STILL_HEIGHT);
  private readonly pickNames: string[] = [""];
  private readonly spriteBits = new Map<string, SpriteBits>();
  private readonly spriteLoading = new Map<string, Promise<SpriteBits | null>>();
  private zPlane: Uint8Array | null = null;
  private zKey = "";
  private readonly stageEl: HTMLDivElement;
  private readonly hudEl: HTMLDivElement;
  private readonly hudFace: HTMLImageElement;
  private readonly captionEl: HTMLDivElement;
  private readonly flats: FlatOverlay;
  private needsRender = true;
  private cursorOn = "";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    document.body.classList.add("play");
    this.stageEl = document.createElement("div");
    this.stageEl.id = "play-stage";
    this.hudEl = document.createElement("div");
    this.hudEl.id = "play-hud";
    this.hudEl.style.backgroundImage = `url("${PLAY_HUD_CHROME}")`;
    this.hudFace = document.createElement("img");
    this.hudFace.id = "play-hud-face";
    this.hudFace.alt = "";
    this.hudFace.src = PLAY_HUD_FACE_NIGHT;
    this.hudEl.append(this.hudFace);
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
    this.actorLayer.append(this.actorCanvas);
    this.captionEl = document.createElement("div");
    this.captionEl.id = "play-caption";
    const app = document.getElementById("app");
    canvas.replaceWith(this.stageEl);
    this.stageEl.append(canvas, this.actorLayer, this.hudEl);
    app?.append(this.stageEl, this.captionEl);
    this.renderer = new WebGLRenderer({ canvas, antialias: false });
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
    this.view = new StillsView();
    this.ui = new PuppetUi();
    this.flats = new FlatOverlay();
    this.stageEl.append(this.ui.root, this.flats.root);
    this.hudEl.addEventListener("click", (event) => this.onHudClick(event));
    this.hudEl.addEventListener("mousemove", (event) => this.onHudMove(event));
    this.host = new DustHost(this.ui);
    this.host.skipMovies = !new URLSearchParams(location.search).has("intro");
    this.host.view = this;
    this.vm = new VM({
      call: (name, args, ctx) => this.host.call(name, args, ctx),
      lookup: (name, ctx) => this.host.lookup(name, ctx),
      log: (message) => this.log(message),
    });
    this.layoutStage();

    canvas.addEventListener("click", (event) => void this.onClick(event));
    canvas.addEventListener("mousemove", (event) => this.onMove(event));
    window.addEventListener("pointerdown", () => unlockVoices(), { capture: true });
    this.actorLayer.addEventListener("mousemove", (event) => this.onMove(event));
    this.stageEl.addEventListener("mouseleave", () => {
      this.hover = null;
      this.applyCursor();
    });
    window.addEventListener("keydown", (event) => this.onKey(event));
    window.addEventListener("keyup", (event) => this.heldKeys.delete(event.code));
    window.addEventListener("resize", () => this.layoutStage());
  }

  refreshActors(): void {
    this.layoutActors();
  }

  viewCamera(): ViewCamera {
    if (this.anim && this.pending) {
      const t = (this.anim.index + 1) / this.anim.urls.length;
      return lerpViewCamera(
        {
          x: this.pending.xFrom,
          y: this.pending.yFrom,
          facing: this.pending.dirFrom,
        },
        { x: this.pending.xTo, y: this.pending.yTo, facing: this.pending.dirTo },
        t,
      );
    }
    return cameraFromPose(this.pose);
  }

  private layoutStage(): void {
    const rect = playStageRect(window.innerWidth, window.innerHeight);
    this.stageEl.style.left = `${rect.x}px`;
    this.stageEl.style.top = `${rect.y}px`;
    this.stageEl.style.width = `${rect.w}px`;
    this.stageEl.style.height = `${rect.h}px`;
    this.canvas.style.width = `${rect.worldW}px`;
    this.canvas.style.height = `${rect.worldH}px`;
    this.renderer.setSize(rect.worldW, rect.worldH, false);
    this.view.layout(rect.worldW, rect.worldH);
    this.ui.layout(rect.scale);
    this.needsRender = true;
    this.captionEl.style.top = `${rect.y + rect.h + 6}px`;
    this.captionEl.style.bottom = "auto";
    this.layoutActors();
  }

  start(): void {
    this.vm.globalNames.add("day");
    this.vm.globalNames.add("clock");
    this.vm.globalNames.add("phase");
    this.vm.globalNames.add("playercash");
    this.vm.globalNames.add("leroyphase");
    this.vm.globals.set("day", 1);
    this.vm.globals.set("clock", 3);
    this.vm.globals.set("phase", 1);
    this.vm.globals.set("playercash", 5);
    this.vm.globals.set("leroyphase", 0);
    this.syncHud();
    this.renderer.setAnimationLoop(() => this.tick());
    void this.boot();
  }

  log(message: string): void {
    this.logLine = message;
    this.syncHud();
  }

  walk(kind: "strait" | "left" | "right"): void {
    const input: WalkInput = kind === "strait" ? "forward" : kind;
    this.tryMove(input);
  }

  async setPose(world: string, pose: WalkerPose): Promise<void> {
    const folder = framesFolder(world, this.isNight());
    const graph = await this.graphFor(folder, world);
    this.world = world;
    this.graph = graph;
    this.pose = pose;
    this.host.currentScene = sceneNameOf(graph, pose.x, pose.y)?.toLowerCase() ?? "";
    this.host.currentDir = pose.facing;
    await this.showHold();
    this.host.noticeCamera();
  }

  private async boot(): Promise<void> {
    try {
      this.host.prefetchTalk();
      this.graph = await loadSetGraph("_NITE");
      this.graphs.set("_NITE", this.graph);
      this.world = WORLD_TOWN;
      this.pose = { x: 6, y: 14, facing: "N" };
      this.townPose = { ...this.pose };
      this.host.currentSet = "town";
      this.host.currentScene = "scene o7";
      this.host.currentDir = "N";
      await this.showHold();
      this.host.startNightBed();
      this.booting = false;
      this.syncHud();
      await Promise.all([
        this.host.loadGangSprites(),
        this.host.loadCastSprites("CST/_EXTRA"),
        this.host.loadWaypoints("_NITE"),
        this.loadTalkScripts(),
      ]);
      this.scriptsReady = true;
      await this.host.placeLeroyAtSign(this.vm);
      this.preloadActorArt();
      this.layoutActors();
      this.syncHud();
      this.syncHud();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logLine = message;
      this.booting = false;
      this.syncHud();
    }
  }

  private async loadTalkScripts(): Promise<void> {
    const files: [string, string][] = [
      ["stage", "FLT/_NEW/setcursor _arg_.json"],
      ["cast:gang", "CST/_GANG/Cast.json"],
      ["actor:leroy", "CST/_GANG/Leroy/Script.json"],
    ];
    await Promise.all([
      this.host.bootIndex().catch((err: unknown) => {
        this.log(`boot: ${err instanceof Error ? err.message : String(err)}`);
      }),
      ...files.map(async ([key, rel]) => {
        try {
          const procs = await loadScriptJson(rel);
          for (const proc of procs) {
            this.host.index.add(key, proc, rel);
          }
        } catch (err) {
          this.log(`${rel}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
      this.host.preloadPuppet("leroy.pup"),
    ]);
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
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.talking && this.host.scriptPump === 0) {
      this.host.advanceActors(dt);
    }
    this.host.tickScriptClock(dt);
    void this.host.runQueued(this.vm);
    this.layoutActors();
    this.applyCursor();
    this.ui.tick(dt);
    if (this.anim) {
      this.driveAnim(this.anim, dt);
      this.needsRender = true;
    }
    if (this.needsRender) {
      this.renderer.render(this.view.scene, this.view.camera);
      if (!this.anim) {
        this.needsRender = false;
      }
    }
  }

  private onMove(event: MouseEvent): void {
    this.hover = event;
    this.applyCursor();
  }

  private hover: MouseEvent | null = null;

  private applyCursor(): void {
    // Puppet/flat UI is arrow. `walktopuppet` sets watch only for the walk;
    // do not keep the hourglass on the talking-head.
    if (this.host.currentPuppet !== "none" || this.flats.open) {
      this.setCursor("arrow");
      return;
    }
    const named = this.host.cursorName;
    if (named && named !== "arrow" && CURSORS[named]) {
      this.setCursor(named);
      return;
    }
    const event = this.hover;
    if (event && this.actorUnder(event)) {
      this.setCursor("touch");
      return;
    }
    if (event && this.doorUnder(event)) {
      this.setCursor("touch");
      return;
    }
    const input = event ? this.clickToInput(event) : null;
    if (input === "left") {
      this.setCursor("goleft");
    } else if (input === "right") {
      this.setCursor("goright");
    } else if (input === "forward") {
      this.setCursor("gostrait");
    } else {
      this.setCursor("arrow");
    }
  }

  private setCursor(name: string): void {
    if (this.cursorOn === name) {
      return;
    }
    this.cursorOn = name;
    const url = CURSORS[name] ?? CURSORS.arrow;
    const value = `url("${url}"), auto`;
    this.canvas.style.cursor = value;
    this.actorLayer.style.cursor = value;
    this.stageEl.style.cursor = value;
    this.hudEl.style.cursor = value;
  }

  private onHudMove(event: MouseEvent): void {
    const at = this.hudStagePoint(event);
    const hit = at ? hitMacRect(MAINPANEL_BUTTONS, at.x, at.y) : undefined;
    this.setCursor(hit ? "touch" : "arrow");
  }

  private onHudClick(event: MouseEvent): void {
    event.stopPropagation();
    this.host.resumeBed();
    if (this.busy || this.host.currentPuppet !== "none" || this.flats.open) {
      return;
    }
    const at = this.hudStagePoint(event);
    if (!at) {
      return;
    }
    const hit = hitMacRect(MAINPANEL_BUTTONS, at.x, at.y);
    const cash = numGlobal(this.vm, "playercash");
    if (hit?.name === "map") {
      this.flats.show("map", cash);
    } else if (hit?.name === "self") {
      this.flats.show("avatar", cash);
    } else if (hit?.name === "horn") {
      this.flats.show("score", cash);
    }
  }

  private hudStagePoint(event: MouseEvent): { x: number; y: number } | null {
    const bounds = this.hudEl.getBoundingClientRect();
    return stageFromHudClick(
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      bounds.width,
      bounds.height,
    );
  }

  private async onClick(event: MouseEvent): Promise<void> {
    unlockVoices();
    if (this.booting || this.busy || this.host.currentPuppet !== "none" || this.flats.open) {
      return;
    }
    const who = this.actorUnder(event);
    if (who) {
      await this.talkTo(who);
      return;
    }
    this.host.resumeBed();
    const door = this.doorUnder(event);
    if (door) {
      this.clickDoor(door);
      return;
    }
    const input = this.clickToInput(event);
    if (input) {
      this.tryMove(input);
    }
  }

  private async talkTo(name: string): Promise<void> {
    unlockVoices();
    if (!this.scriptsReady) {
      this.log(`Loading ${name}…`);
      return;
    }
    const actor = this.host.namedActor(name);
    this.busy = true;
    this.talking = true;
    this.vm.object = "actor";
    this.vm.me = actor.name;
    this.vm.target = actor.name;
    this.applyCursor();
    this.host.warmTalk(name);
    try {
      await this.vm.evalCall("mousedown", [{ type: "num", value: 0 }]);
    } catch (err) {
      this.log(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy = false;
      this.talking = false;
      this.host.currentPuppet = "none";
      this.host.cursorName = "arrow";
      this.ui.close();
      this.applyCursor();
      this.syncHud();
      this.needsRender = true;
    }
  }

  private onKey(event: KeyboardEvent): void {
    this.host.resumeBed();
    if (event.altKey || event.ctrlKey || event.metaKey || this.booting) {
      return;
    }
    if (event.code === "KeyC" && !event.repeat) {
      this.ui.toggleCaptions();
      event.preventDefault();
      return;
    }
    this.heldKeys.add(event.code);
    if (this.flats.open) {
      if (event.code === "Escape") {
        this.flats.close();
      }
      return;
    }
    if (this.host.currentPuppet !== "none") {
      return;
    }
    const input = keyToInput(event.code);
    if (!input || event.repeat) {
      return;
    }
    event.preventDefault();
    this.tryMove(input);
  }

  private tryMove(input: WalkInput): void {
    if (this.busy || !this.graph) {
      return;
    }
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
    this.busy = true;
    this.pending = tr;
    const folder = this.stillsFolder();
    const urls = [0, 1, 2, 3, 4].map((offset) => frameUrl(folder, tr.frame0, offset));
    this.view.preload(urls);
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
    this.clock.getDelta();
    this.needsRender = true;
    void this.loadZPlane(zUrlFromStill(urls[0]));
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
      void this.loadZPlane(zUrlFromStill(next));
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
    this.anim = null;
    this.pending = null;
    this.busy = false;
    if (tr) {
      this.pose = applyTransition(tr);
      this.host.currentScene = sceneNameOf(this.graph, this.pose.x, this.pose.y)?.toLowerCase() ?? "";
      this.host.currentDir = this.pose.facing;
    }
    this.host.noticeCamera();
    this.syncHud();
    this.layoutActors();
    void this.showHold();
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
    await Promise.all([
      this.view.show(still),
      this.loadZPlane(zUrl(folder, frame.frame0, frame.offset)),
    ]);
    if (gen !== this.hqGen) {
      return;
    }
    this.needsRender = true;
    this.layoutActors();
    this.syncHud();
  }

  private stillsFolder(): string {
    return framesFolder(this.world, this.isNight());
  }

  private actorUnder(event: MouseEvent): string | undefined {
    const norm = this.stillNorm(event);
    if (!norm) {
      return undefined;
    }
    const x = Math.min(STILL_WIDTH - 1, Math.max(0, Math.floor(norm.nx * STILL_WIDTH)));
    const y = Math.min(STILL_HEIGHT - 1, Math.max(0, Math.floor(norm.ny * STILL_HEIGHT)));
    const id = this.pick[y * STILL_WIDTH + x];
    if (!id) {
      return undefined;
    }
    return this.pickNames[id];
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

  private clickToInput(event: MouseEvent): WalkInput | null {
    const norm = this.stillNorm(event);
    if (!norm) {
      return null;
    }
    return stillClickInput(norm.nx, norm.ny);
  }

  private doorUnder(event: MouseEvent): DoorDef | undefined {
    const norm = this.stillNorm(event);
    if (!norm || !this.graph) {
      return undefined;
    }
    const pixel = stillClickPixel(norm.nx, norm.ny, STILL_WIDTH, STILL_HEIGHT);
    if (!pixel) {
      return undefined;
    }
    return doorAt(
      this.world,
      sceneNameOf(this.graph, this.pose.x, this.pose.y),
      this.pose.facing,
      pixel.x,
      pixel.y,
    );
  }

  private clickDoor(door: DoorDef): void {
    if (this.openDoor?.id === door.id) {
      this.openDoor = null;
      playSfx(closeSfx(door));
      this.view.hideOverlay();
      return;
    }
    this.openDoor = door;
    playSfx(door.openSound);
    const url = overlaySprite(door, this.isNight());
    if (url) {
      const center = hitCenter(door.hitbox);
      void this.view.showOverlay(url, center.x, center.y);
    }
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
        const graph = await this.graphFor("_NITE", WORLD_TOWN);
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
      this.host.currentScene = sceneNameOf(this.graph, this.pose.x, this.pose.y)?.toLowerCase() ?? "";
      await this.showHold();
    } finally {
      this.busy = false;
    }
  }

  private layoutActors(): void {
    if (this.host.currentPuppet !== "none") {
      this.actorLayer.hidden = true;
      return;
    }
    this.actorLayer.hidden = false;
    const frame = this.actorCtx.createImageData(STILL_WIDTH, STILL_HEIGHT);
    this.pick.fill(0);
    this.pickNames.length = 1;
    const cam = this.viewCamera();
    const nearZ = sampleNearZ(this.zPlane);
    let pickId = 1;
    for (const actor of this.host.nearbyActors()) {
      const still = worldToStill(actor, cam);
      if (!still) {
        continue;
      }
      const place = actorSprite(actor, cam.deg);
      if (!place || place.h <= 0) {
        continue;
      }
      const url = this.host.spriteUrl(actor, place);
      const bits = this.spriteBits.get(url);
      if (!bits) {
        void this.loadSpriteBits(url);
        continue;
      }
      const stillScale = actorStillHeight(place.h, actor.scale, still.forward) / place.h;
      const topLeft = spriteStillTopLeft(still.x, still.y, place, stillScale);
      this.pickNames[pickId] = actor.name;
      blitSpriteZ(
        frame.data,
        this.pick,
        pickId,
        this.zPlane,
        actorWorldZ(still.forward, nearZ),
        bits,
        topLeft.x,
        topLeft.y,
        stillScale,
      );
      pickId += 1;
    }
    this.actorCtx.putImageData(frame, 0, 0);
  }

  private preloadActorArt(): void {
    for (const actor of this.host.actors.values()) {
      for (const place of [
        ...actor.standSprites,
        ...actor.walkSprites,
        ...actor.drinkSprites,
      ]) {
        void this.loadSpriteBits(this.host.spriteUrl(actor, place));
      }
    }
  }

  private loadSpriteBits(url: string): Promise<SpriteBits | null> {
    const hit = this.spriteBits.get(url);
    if (hit) {
      return Promise.resolve(hit);
    }
    const pending = this.spriteLoading.get(url);
    if (pending) {
      return pending;
    }
    const job = decodeStillImage(url)
      .then((image) => {
        const bits = spriteBitsFromImageData(image);
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

  private loadZPlane(url: string): Promise<void> {
    if (this.zKey === url) {
      return Promise.resolve();
    }
    this.zKey = url;
    return decodeStillImage(url)
      .then((image) => {
        if (this.zKey !== url) {
          return;
        }
        this.zPlane = zPlaneFromImageData(image);
        this.layoutActors();
      })
      .catch(() => {
        if (this.zKey === url) {
          this.zPlane = null;
          this.layoutActors();
        }
      });
  }

  private syncHud(): void {
    const day = numGlobal(this.vm, "day") || 1;
    const clock = numGlobal(this.vm, "clock") || 3;
    const cash = numGlobal(this.vm, "playercash");
    const label = this.graph ? poseLabel(this.graph, this.pose, this.world) : "Loading…";
    const clockName = clock === 1 ? "Morning" : clock === 2 ? "Afternoon" : "Night";
    this.timeEl.textContent = `PLAY · Day ${day} · ${clockName} · $${cash}`;
    this.hudFace.hidden = clock !== 3;
    const names = this.host.nearbyActors().map((a) => titleCase(a.name));
    this.promptEl.textContent = names.length
      ? `${label} · ${names.join(", ")} — click to talk`
      : label;
    const extra = [...this.vm.unimplemented].slice(0, 4).join(", ");
    const caption = [
      "←/→ turn · ↑ walk · click Leroy · map/portrait on the bar",
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

function titleCase(name: string): string {
  return name.slice(0, 1).toUpperCase() + name.slice(1);
}

async function decodeStillImage(url: string): Promise<ImageData> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} ${res.status}`);
  }
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("image canvas");
  }
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return data;
}

function keyToInput(code: string): WalkInput | null {
  if (code === "ArrowLeft" || code === "KeyA") {
    return "left";
  }
  if (code === "ArrowRight" || code === "KeyD") {
    return "right";
  }
  if (code === "ArrowUp" || code === "KeyW") {
    return "forward";
  }
  return null;
}

function numGlobal(vm: VM, name: string): number {
  const value = vm.globals.get(name);
  return typeof value === "number" ? value : Number(value ?? 0) || 0;
}
