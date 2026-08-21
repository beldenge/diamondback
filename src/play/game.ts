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
} from "../world/set/graph";
import { StillsView } from "../world/set/stillsView";
import {
  dirToDeg,
  pickCyclic,
  visibleOctant,
  walkFrame,
  worldToStill,
} from "./facing";
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
  private readonly heldKeys = new Set<string>();
  private booting = true;
  private scriptsReady = false;
  private logLine = "";
  private readonly actorLayer: HTMLDivElement;
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
        this.host.loadGangSprites().then(() => {
          this.host.placeLeroyAtSign();
          this.layoutActors();
          this.syncHud();
        }),
        this.loadTalkScripts(),
      ]);
      this.scriptsReady = true;
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
    if (!this.busy) {
      this.host.advanceActors(dt);
    }
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
    const named = this.host.cursorName;
    if (named && named !== "arrow" && CURSORS[named]) {
      this.setCursor(named);
      return;
    }
    if (this.host.currentPuppet !== "none" || this.flats.open) {
      this.setCursor("arrow");
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
      this.log("Loading Leroy…");
      return;
    }
    const actor = this.host.namedActor(name);
    this.busy = true;
    this.vm.object = "actor";
    this.vm.me = actor.name;
    this.vm.target = actor.name;
    this.host.cursorName = "watch";
    this.applyCursor();
    this.host.warmTalk();
    try {
      await this.vm.evalCall("mousedown", [{ type: "num", value: 0 }]);
    } catch (err) {
      this.log(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy = false;
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
    this.host.faceNearby();
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
    await this.view.show(frameUrl(this.stillsFolder(), frame.frame0, frame.offset));
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
    for (const node of this.actorLayer.querySelectorAll<HTMLElement>("[data-actor]")) {
      const box = node.getBoundingClientRect();
      if (
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom
      ) {
        return node.dataset.actor;
      }
    }
    return undefined;
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
    const bounds = this.canvas.getBoundingClientRect();
    this.actorLayer.style.left = "0";
    this.actorLayer.style.top = "0";
    this.actorLayer.style.width = `${bounds.width}px`;
    this.actorLayer.style.height = `${bounds.height}px`;
    if (this.host.currentPuppet !== "none") {
      this.actorLayer.hidden = true;
      return;
    }
    this.actorLayer.hidden = false;
    const camDeg = dirToDeg(this.pose.facing);
    const seen = new Set<string>();
    for (const actor of this.host.nearbyActors(520)) {
      const still = worldToStill(actor, this.pose);
      if (!still) {
        continue;
      }
      seen.add(actor.name);
      const oct = visibleOctant(actor.deg, camDeg);
      const place =
        actor.pose === "walk"
          ? walkFrame(actor.walkSprites, oct, actor.walkStep)
          : pickCyclic(actor.standSprites, oct);
      let chip = this.actorLayer.querySelector<HTMLButtonElement>(
        `[data-actor="${actor.name}"]`,
      );
      if (!chip) {
        chip = document.createElement("button");
        chip.type = "button";
        chip.className = "actor-chip";
        chip.dataset.actor = actor.name;
        const img = document.createElement("img");
        img.alt = actor.name;
        chip.append(img);
        chip.addEventListener("click", (event) => {
          event.stopPropagation();
          void this.talkTo(actor.name);
        });
        this.actorLayer.append(chip);
      }
      chip.style.left = `${(still.x / STILL_WIDTH) * 100}%`;
      chip.style.top = `${(still.y / STILL_HEIGHT) * 100}%`;
      const img = chip.querySelector("img");
      if (img && place) {
        const url = this.host.spriteUrl(actor, place);
        if (!img.src.endsWith(place.path.replaceAll("\\", "/"))) {
          img.src = url;
        }
        const distScale = 0.55 + 0.5 * (1 - Math.min(still.forward, 400) / 400);
        img.style.height = `${place.h * (actor.scale / 1450) * distScale}px`;
        img.style.width = "auto";
      } else if (img && actor.standUrl && img.src !== actor.standUrl) {
        img.src = actor.standUrl;
      }
    }
    for (const node of [...this.actorLayer.children]) {
      if (node instanceof HTMLElement && !seen.has(node.dataset.actor ?? "")) {
        node.remove();
      }
    }
  }

  private syncHud(): void {
    const day = numGlobal(this.vm, "day") || 1;
    const clock = numGlobal(this.vm, "clock") || 3;
    const cash = numGlobal(this.vm, "playercash");
    const label = this.graph ? poseLabel(this.graph, this.pose, this.world) : "Loading…";
    const clockName = clock === 1 ? "Morning" : clock === 2 ? "Afternoon" : "Night";
    this.timeEl.textContent = `PLAY · Day ${day} · ${clockName} · $${cash}`;
    this.hudFace.hidden = clock !== 3;
    const names = this.host.nearbyActors(520).map((a) => titleCase(a.name));
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
