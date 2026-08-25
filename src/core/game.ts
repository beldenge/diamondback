import { Color, Timer, WebGLRenderer } from "three";
import {
  frameUrl,
  framesFolder,
  hqFrame,
  loadSetGraph,
  loadTownGraph,
  poseLabel,
  resolveSpawn,
  sceneByName,
  WORLD_TOWN,
} from "../world/set/graph";
import type { SetGraph } from "../world/set/types";
import { StillsView } from "../world/set/stillsView";
import {
  applyTransition,
  isSwipePointer,
  stillClickPixel,
  swipeWalkInput,
  transitionForInput,
  walkInputFromCode,
  walkInputFromKeys,
  type WalkInput,
} from "../world/set/walker";
import { neighborStillUrls, poseHqUrl, transitionStillUrls } from "../world/set/film";
import { createStillAnim, tickStillAnim, type StillAnim } from "../world/set/playback";
import {
  STILL_FRAME_SEC,
  STILL_HEIGHT,
  STILL_WIDTH,
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
  type DoorLockCtx,
} from "../world/set/doors";
import { playSfx } from "../world/set/sfx";
import { createInitialState, type GlobalState } from "./state";
import { formatTime, isClockSlot, isNight, toggleDayNight, type ClockSlot } from "./time";

export class Game {
  private readonly renderer: WebGLRenderer;
  private readonly timer = new Timer();
  private state: GlobalState = createInitialState();
  private lastDayClock: ClockSlot = 2;
  private readonly timeEl: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly canvas: HTMLCanvasElement;

  private stills: {
    view: StillsView;
    world: string;
    graphs: Map<string, SetGraph>;
    graph: SetGraph;
    pose: WalkerPose;
    townPose: WalkerPose;
    interiorReturn: { world: string; pose: WalkerPose }[];
    openDoor: DoorDef | null;
    anim: StillAnim | null;
    pending: SetTransition | null;
    hqGen: number;
    busy: boolean;
  } | null = null;
  private readonly heldKeys = new Set<string>();
  private pendingInput: WalkInput | null = null;
  private skipNextClick = false;
  private paused = false;
  private swipe: { id: number; x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const params = new URLSearchParams(window.location.search);
    this.applyDebugClock(params);

    this.renderer = new WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(new Color(0x1a120c));

    const timeEl = document.getElementById("hud-time");
    const promptEl = document.getElementById("hud-prompt");
    const hintEl = document.getElementById("hud-hint");
    if (!timeEl || !promptEl || !hintEl) {
      throw new Error("HUD elements missing from index.html");
    }
    this.timeEl = timeEl;
    this.promptEl = promptEl;
    this.hintEl = hintEl;

    this.timer.connect(document);
    this.setupStills();
    this.syncHud();

    canvas.addEventListener("click", (event) => this.onClick(event));
    canvas.addEventListener("mousemove", (event) => this.onMouseMove(event));
    canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    window.addEventListener("pointerup", (event) => this.onPointerUp(event));
    window.addEventListener("pointercancel", () => {
      this.swipe = null;
    });
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
    window.addEventListener("keyup", (event) => this.heldKeys.delete(event.code));
    window.addEventListener("blur", () => this.heldKeys.clear());
    window.addEventListener("resize", () => this.onResize());
  }

  start(): void {
    this.paused = false;
    this.renderer.setAnimationLoop(() => this.tick());
  }

  stop(): void {
    this.paused = true;
    this.renderer.setAnimationLoop(null);
  }

  private setupStills(): void {
    this.canvas.style.cursor = "default";
    this.hintEl.textContent = "Loading Diamondback stills…";
    this.promptEl.textContent = "";
    void this.startStills();
  }

  private async startStills(): Promise<void> {
    try {
      const graph = await loadTownGraph();
      const pose = resolveSpawn(graph);
      const view = new StillsView();
      view.layout(window.innerWidth, window.innerHeight);
      this.stills = {
        view,
        world: WORLD_TOWN,
        graphs: new Map([[WORLD_TOWN, graph]]),
        graph,
        pose,
        townPose: pose,
        interiorReturn: [],
        openDoor: null,
        anim: null,
        pending: null,
        hqGen: 0,
        busy: false,
      };
      await this.showHold();
      this.preloadNeighbors();
      this.hintEl.textContent =
        "←/→ turn · ↑ walk · swipe to turn/walk · click a door to open, then walk in · N day/night";
      this.syncHud();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.hintEl.textContent = message;
      this.promptEl.textContent = "Extract not found";
    }
  }

  private tick(): void {
    if (this.paused) {
      return;
    }
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.tickStills(dt);
  }

  private tickStills(dt: number): void {
    const session = this.stills;
    if (!session) {
      return;
    }
    const anim = session.anim;
    if (anim) {
      this.driveAnim(anim, dt);
    }
    this.renderer.render(session.view.scene, session.view.camera);
  }

  private onClick(event: MouseEvent): void {
    if (this.skipNextClick) {
      this.skipNextClick = false;
      return;
    }
    const door = this.doorUnder(event);
    if (door) {
      if (door.autoWalk) {
        const session = this.stills;
        if (!session || session.busy) {
          return;
        }
        session.openDoor = door;
        void this.enterOpenDoor();
        return;
      }
      this.clickDoor(door);
    }
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !isSwipePointer(event.pointerType)) {
      return;
    }
    const norm = this.stillNorm(event);
    if (!norm || norm.nx < 0 || norm.nx > 1 || norm.ny < 0 || norm.ny > 1) {
      return;
    }
    this.swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  private onPointerUp(event: PointerEvent): void {
    const swipe = this.swipe;
    this.swipe = null;
    if (!swipe || event.pointerId !== swipe.id) {
      return;
    }
    const input = swipeWalkInput(event.clientX - swipe.x, event.clientY - swipe.y);
    if (!input) {
      return;
    }
    this.skipNextClick = true;
    this.tryMove(input);
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.stills) {
      return;
    }
    this.canvas.style.cursor = this.doorUnder(event) ? "pointer" : "default";
  }

  private stillNorm(event: MouseEvent): { nx: number; ny: number } | null {
    const session = this.stills;
    if (!session) {
      return null;
    }
    const bounds = this.canvas.getBoundingClientRect();
    const rect = session.view.stillRect(bounds.width, bounds.height);
    if (rect.w <= 0 || rect.h <= 0) {
      return null;
    }
    return {
      nx: (event.clientX - bounds.left - rect.x) / rect.w,
      ny: (event.clientY - bounds.top - rect.y) / rect.h,
    };
  }

  private doorUnder(event: MouseEvent): DoorDef | undefined {
    const session = this.stills;
    const norm = this.stillNorm(event);
    if (!session || !norm) {
      return undefined;
    }
    const pixel = stillClickPixel(norm.nx, norm.ny, STILL_WIDTH, STILL_HEIGHT);
    if (!pixel) {
      return undefined;
    }
    return doorAt(
      session.world,
      sceneNameOf(session.graph, session.pose.x, session.pose.y),
      session.pose.facing,
      pixel.x,
      pixel.y,
    );
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.paused || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    this.heldKeys.add(event.code);
    if (event.code === "KeyN") {
      if (event.repeat) {
        return;
      }
      event.preventDefault();
      const next = toggleDayNight(this.state.clock, this.lastDayClock);
      this.lastDayClock = next.lastDayClock;
      this.applyClockState({ ...this.state, clock: next.clock });
      return;
    }
    const input = walkInputFromCode(event.code);
    if (!input) {
      return;
    }
    event.preventDefault();
    this.tryMove(input);
  }

  private tryMove(input: WalkInput): void {
    const session = this.stills;
    if (!session) {
      return;
    }
    if (session.busy) {
      this.pendingInput = input;
      return;
    }
    this.pendingInput = null;
    session.hqGen += 1;
    if (input === "forward") {
      const auto = this.autoWalkAhead();
      if (auto) {
        session.openDoor = auto;
        void this.enterOpenDoor();
        return;
      }
      if (this.openDoorAhead()) {
        void this.enterOpenDoor();
        return;
      }
    }
    const tr = transitionForInput(session.graph, session.pose, input);
    if (!tr) {
      return;
    }
    session.view.hideOverlay();
    this.playTransition(tr);
  }

  private finishStillMove(): void {
    const session = this.stills;
    if (!session) {
      return;
    }
    const tr = session.pending;
    session.anim = null;
    session.pending = null;
    session.busy = false;
    if (tr) {
      const prev = session.pose;
      session.pose = applyTransition(tr);
      if (prev.x !== session.pose.x || prev.y !== session.pose.y) {
        session.openDoor = null;
      }
    }
    this.syncHud();
    this.revealHq();
    this.syncDoorOverlay();
    this.preloadNeighbors();
    const pending = this.pendingInput;
    this.pendingInput = null;
    if (pending) {
      this.tryMove(pending);
      return;
    }
    const held = walkInputFromKeys(this.heldKeys);
    if (held) {
      this.tryMove(held);
    }
  }

  private revealHq(): void {
    const session = this.stills;
    if (!session) {
      return;
    }
    const frame = hqFrame(session.graph, session.pose);
    if (frame === undefined) {
      return;
    }
    const url = frameUrl(this.stillsFolder(), frame.frame0, frame.offset);
    if (session.view.showCached(url)) {
      return;
    }
    void this.showHold();
  }

  private playTransition(tr: SetTransition): void {
    const session = this.stills;
    if (!session) {
      return;
    }
    session.busy = true;
    session.pending = tr;
    const folder = this.stillsFolder();
    const urls = transitionStillUrls(tr, folder);
    const dest = applyTransition(tr);
    const destHq = poseHqUrl(session.graph, dest, folder);
    const nextMoves = neighborStillUrls(session.graph, dest, folder, 1);
    const keep = destHq ? [...urls, destHq, ...nextMoves] : [...urls, ...nextMoves];
    session.view.retain(keep);
    if (destHq) {
      session.view.preload([destHq], "high");
    }
    session.view.preload(urls, "high");
    session.view.preload(nextMoves, "high");
    const anim = createStillAnim(urls);
    session.anim = anim;
    if (session.view.showCached(urls[0])) {
      anim.ready = true;
    } else {
      void session.view.show(urls[0]).then(() => {
        if (this.stills?.anim === anim) {
          anim.ready = true;
          anim.elapsed = 0;
        }
      });
    }
    this.timer.reset();
  }

  /** Advance one filmed frame per interval. If a PNG is not ready, wait — never skip. */
  private driveAnim(anim: StillAnim, dt: number): void {
    const session = this.stills;
    if (!session) {
      return;
    }
    const url = anim.urls[anim.index];
    if (!session.view.cached(url)) {
      void session.view.show(url).then(() => {
        if (this.stills?.anim === anim) {
          anim.ready = true;
          anim.elapsed = 0;
        }
      });
      return;
    }
    if (!anim.ready) {
      session.view.showCached(url);
      anim.ready = true;
      anim.elapsed = 0;
      return;
    }
    const step = tickStillAnim(anim, dt, STILL_FRAME_SEC);
    if (step.frameChanged) {
      const next = anim.urls[anim.index];
      if (session.view.showCached(next)) {
        anim.ready = true;
      } else {
        anim.ready = false;
        anim.elapsed = 0;
        void session.view.show(next).then(() => {
          if (this.stills?.anim === anim) {
            anim.ready = true;
            anim.elapsed = 0;
          }
        });
      }
    }
    if (step.done) {
      this.finishStillMove();
    }
  }

  private async showHold(): Promise<void> {
    const session = this.stills;
    if (!session) {
      return;
    }
    const gen = session.hqGen;
    const pose = session.pose;
    const frame = hqFrame(session.graph, pose);
    if (frame === undefined) {
      this.promptEl.textContent = "No still for this tile";
      return;
    }
    await session.view.show(frameUrl(this.stillsFolder(), frame.frame0, frame.offset));
    if (this.stills !== session || session.hqGen !== gen) {
      return;
    }
    this.syncHud();
    this.syncDoorOverlay();
  }

  private preloadNeighbors(): void {
    const session = this.stills;
    if (!session) {
      return;
    }
    this.preloadAround(session.pose);
  }

  private preloadAround(origin: WalkerPose): void {
    const session = this.stills;
    if (!session) {
      return;
    }
    session.view.preload(neighborStillUrls(session.graph, origin, this.stillsFolder(), 2), "low");
  }

  private applyClockState(state: GlobalState): void {
    this.state = state;
    if (this.stills) {
      this.stills.anim = null;
      this.stills.pending = null;
      this.stills.hqGen += 1;
      this.stills.busy = false;
      this.syncDoorOverlay();
      void this.showHold();
      this.preloadNeighbors();
    }
    this.syncHud();
  }

  private applyDebugClock(params: URLSearchParams): void {
    const clock = Number(params.get("clock"));
    if (isClockSlot(clock)) {
      this.state = { ...this.state, clock };
      if (!isNight(clock)) {
        this.lastDayClock = clock;
      }
    }
  }

  private syncHud(): void {
    this.timeEl.textContent = formatTime(this.state.day, this.state.clock);
    if (this.stills) {
      const label = poseLabel(this.stills.graph, this.stills.pose, this.stills.world);
      const door = this.doorOnThisPose();
      this.promptEl.textContent = door
        ? door.autoWalk || this.stills.openDoor?.id === door.id
          ? `${label} · walk in`
          : `${label} · click to open`
        : label;
    }
  }

  private lockCtx(): DoorLockCtx {
    return {
      day: this.state.day,
      clock: this.state.clock,
      phase: this.state.phase,
      fightOn: false,
    };
  }

  private stillsFolder(): string {
    const session = this.stills;
    if (!session) {
      return "_TOWN";
    }
    return framesFolder(session.world, isNight(this.state.clock));
  }

  private doorOnThisPose(): DoorDef | undefined {
    const session = this.stills;
    if (!session) {
      return undefined;
    }
    return doorOnPose(
      session.world,
      sceneNameOf(session.graph, session.pose.x, session.pose.y),
      session.pose.facing,
    );
  }

  private openDoorAhead(): DoorDef | null {
    const session = this.stills;
    if (!session) {
      return null;
    }
    const scene = sceneNameOf(session.graph, session.pose.x, session.pose.y);
    if (!doorMatchesPose(session.openDoor, session.world, scene, session.pose.facing)) {
      return null;
    }
    return session.openDoor;
  }

  private autoWalkAhead(): DoorDef | null {
    const door = this.doorOnThisPose();
    if (!door?.autoWalk || door.locked(this.lockCtx())) {
      return null;
    }
    return door;
  }

  private clickDoor(door: DoorDef): void {
    const session = this.stills;
    if (!session || session.busy) {
      return;
    }
    if (door.locked(this.lockCtx())) {
      playSfx(door.knockSound);
      return;
    }
    if (session.openDoor?.id === door.id) {
      session.openDoor = null;
      playSfx(closeSfx(door));
      session.view.hideOverlay();
      return;
    }
    session.openDoor = door;
    playSfx(door.openSound);
    this.syncDoorOverlay();
  }

  private syncDoorOverlay(): void {
    const session = this.stills;
    if (!session) {
      return;
    }
    const scene = sceneNameOf(session.graph, session.pose.x, session.pose.y);
    const door = session.openDoor;
    if (!door || !doorMatchesPose(door, session.world, scene, session.pose.facing)) {
      session.view.hideOverlay();
      return;
    }
    const url = overlaySprite(door, isNight(this.state.clock));
    if (!url) {
      session.view.hideOverlay();
      return;
    }
    const center = hitCenter(door.hitbox);
    void session.view.showOverlay(url, center.x, center.y);
  }

  private async enterOpenDoor(): Promise<void> {
    const session = this.stills;
    const door = this.openDoorAhead();
    if (!session || !door) {
      return;
    }
    session.busy = true;
    session.view.hideOverlay();
    try {
      if (door.go.kind === "town") {
        const graph = await this.graphFor(WORLD_TOWN);
        if (this.stills !== session) {
          return;
        }
        session.interiorReturn = [];
        session.world = WORLD_TOWN;
        session.graph = graph;
        session.pose = exitTownPose(session.townPose);
      } else {
        const world = goWorld(door.go, isNight(this.state.clock));
        if (!world) {
          return;
        }
        const top = session.interiorReturn.at(-1);
        const back = top !== undefined && top.world === world;
        if (back && top) {
          session.interiorReturn.pop();
          const graph = await this.graphFor(top.world);
          if (this.stills !== session) {
            return;
          }
          session.world = top.world;
          session.graph = graph;
          session.pose = exitTownPose(top.pose);
        } else {
          const graph = await this.graphFor(world);
          const dest = sceneByName(graph, door.go.scene);
          if (!dest || !graph.cameraTiles.has(`${dest.x},${dest.y}`)) {
            throw new Error(`Interior spawn missing (${world} ${door.go.scene})`);
          }
          if (this.stills !== session) {
            return;
          }
          if (session.world === WORLD_TOWN) {
            session.townPose = session.pose;
            session.interiorReturn = [];
          } else {
            session.interiorReturn.push({ world: session.world, pose: { ...session.pose } });
          }
          session.world = world;
          session.graph = graph;
          session.pose = { x: dest.x, y: dest.y, facing: door.go.facing };
        }
        if (!door.autoWalk) {
          playSfx(closeSfx(door));
        }
      }
      session.openDoor = null;
      session.hqGen += 1;
      await this.showHold();
      this.preloadNeighbors();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.hintEl.textContent = message;
    } finally {
      if (this.stills === session) {
        session.busy = false;
      }
    }
  }

  private async graphFor(world: string): Promise<SetGraph> {
    const session = this.stills;
    if (!session) {
      throw new Error("stills session missing");
    }
    const hit = session.graphs.get(world);
    if (hit) {
      return hit;
    }
    const folder = world === WORLD_TOWN ? "_TOWN" : world;
    const graph = await loadSetGraph(folder);
    session.graphs.set(world, graph);
    return graph;
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.stills) {
      this.stills.view.layout(w, h);
    }
  }
}


