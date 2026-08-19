import {
  Clock,
  Color,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { PlayerController } from "../player/controls";
import { pickInteractable } from "../player/interact";
import {
  frameUrl,
  hqFrame,
  loadTownGraph,
  poseLabel,
  resolveSpawn,
} from "../world/set/graph";
import type { SetGraph } from "../world/set/types";
import { StillsView } from "../world/set/stillsView";
import {
  applyTransition,
  stillClickInput,
  transitionForInput,
  type WalkInput,
} from "../world/set/walker";
import { createStillAnim, tickStillAnim, type StillAnim } from "../world/set/playback";
import {
  STILL_FRAME_SEC,
  framesToPlay,
  type SetTransition,
  type WalkerPose,
} from "../world/set/types";
import { collisionAabbs, TOWN_LAYOUT } from "../world/layout";
import { applyLighting, createTownLights, type TownLights } from "../world/lighting";
import { buildTown, setTownNightWindows } from "../world/town";
import { createInitialState, sleep, type GlobalState } from "./state";
import { formatTime, isClockSlot, isNight, toggleDayNight, type ClockSlot } from "./time";

type PlayMode = "stills" | "free";

export class Game {
  private readonly mode: PlayMode;
  private readonly renderer: WebGLRenderer;
  private readonly clock = new Clock();
  private state: GlobalState = createInitialState();
  private lastDayClock: ClockSlot = 2;
  private readonly timeEl: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly crosshair: HTMLElement | null;

  private free: {
    scene: Scene;
    camera: PerspectiveCamera;
    player: PlayerController;
    lights: TownLights;
  } | null = null;

  private stills: {
    view: StillsView;
    graph: SetGraph;
    pose: WalkerPose;
    anim: StillAnim | null;
    pending: SetTransition | null;
    queuedInput: WalkInput | null;
    hqGen: number;
    busy: boolean;
  } | null = null;
  private readonly heldKeys = new Set<string>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const params = new URLSearchParams(window.location.search);
    this.mode = params.get("mode") === "free" ? "free" : "stills";
    this.applyDebugClock(params);

    this.renderer = new WebGLRenderer({ canvas, antialias: this.mode === "free" });
    this.renderer.setPixelRatio(this.mode === "free" ? Math.min(window.devicePixelRatio, 2) : 1);
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
    this.crosshair = document.getElementById("crosshair");

    if (this.mode === "free") {
      this.setupFree(params);
    } else {
      this.setupStills();
    }
    this.syncHud();

    canvas.addEventListener("click", (event) => this.onClick(event));
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
    window.addEventListener("keyup", (event) => this.heldKeys.delete(event.code));
    window.addEventListener("blur", () => this.heldKeys.clear());
    window.addEventListener("resize", () => this.onResize());
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private setupFree(params: URLSearchParams): void {
    const camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 250);
    camera.position.set(TOWN_LAYOUT.spawn.x, TOWN_LAYOUT.spawn.y, TOWN_LAYOUT.spawn.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = TOWN_LAYOUT.spawn.yaw + Math.PI;
    const view = params.get("view");
    if (view === "hotel") {
      camera.position.set(-4, 1.65, 20.2);
    } else if (view === "street") {
      camera.position.set(0, 1.65, -6);
    }

    const scene = new Scene();
    const town = buildTown();
    scene.add(town);
    const lights = createTownLights(scene, this.state.clock);
    setTownNightWindows(town, this.state.clock);
    const player = new PlayerController(camera, this.canvas, collisionAabbs(), TOWN_LAYOUT.playBounds);
    scene.add(player.controls.object);
    this.free = { scene, camera, player, lights };
    this.canvas.style.cursor = "none";
    if (this.crosshair) {
      this.crosshair.style.display = "";
    }
    this.hintEl.textContent =
      "Click to look around · WASD move · N day/night · Click bed in the hotel to sleep · ?mode=stills for Dust views";
  }

  private setupStills(): void {
    this.canvas.style.cursor = "default";
    if (this.crosshair) {
      this.crosshair.style.display = "none";
    }
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
        graph,
        pose,
        anim: null,
        pending: null,
        queuedInput: null,
        hqGen: 0,
        busy: false,
      };
      await this.showHold();
      this.preloadNeighbors();
      this.hintEl.textContent = "←/→ or A/D turn · ↑ or W walk · N day/night · ?mode=free for graybox";
      this.syncHud();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.hintEl.textContent = message;
      this.promptEl.textContent = "Extract not found";
    }
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.mode === "free" && this.free) {
      this.tickFree(dt);
      return;
    }
    this.tickStills(dt);
  }

  private tickFree(dt: number): void {
    const free = this.free;
    if (!free) {
      return;
    }
    free.player.update(dt);
    const target = free.player.locked
      ? pickInteractable(free.camera, TOWN_LAYOUT.interactables)
      : null;
    this.promptEl.textContent = target ? target.label : "";
    this.hintEl.style.opacity = free.player.locked ? "0.45" : "0.9";
    this.renderer.render(free.scene, free.camera);
  }

  private tickStills(dt: number): void {
    const session = this.stills;
    if (!session) {
      return;
    }
    const anim = session.anim;
    if (anim) {
      const nextUrl = anim.urls[anim.index + 1];
      const waitingOnNext =
        anim.ready &&
        nextUrl !== undefined &&
        anim.elapsed + dt >= STILL_FRAME_SEC &&
        !session.view.has(nextUrl);
      if (waitingOnNext) {
        session.view.preload(anim.urls.slice(anim.index + 1));
      } else {
        const step = tickStillAnim(anim, dt, STILL_FRAME_SEC);
        if (step.frameChanged) {
          session.view.showCached(anim.urls[anim.index]);
        }
        if (step.done) {
          const tr = session.pending;
          session.anim = null;
          session.pending = null;
          session.busy = false;
          if (tr) {
            session.pose = applyTransition(tr);
          }
          this.syncHud();
          this.revealHq();
          this.preloadNeighbors();
          this.flushStillsInput();
        }
      }
    }
    this.renderer.render(session.view.scene, session.view.camera);
  }

  private onClick(event: MouseEvent): void {
    if (this.mode === "free" && this.free) {
      if (!this.free.player.locked) {
        this.free.player.lock();
        return;
      }
      const target = pickInteractable(this.free.camera, TOWN_LAYOUT.interactables);
      if (target?.kind === "sleep") {
        this.applyClockState(sleep(this.state));
      }
      return;
    }
    const input = this.clickToInput(event);
    if (input) {
      this.tryMove(input);
    }
  }

  private clickToInput(event: MouseEvent): WalkInput | null {
    const session = this.stills;
    if (!session) {
      return null;
    }
    const bounds = this.canvas.getBoundingClientRect();
    const rect = session.view.stillRect(bounds.width, bounds.height);
    const nx = (event.clientX - bounds.left - rect.x) / rect.w;
    const ny = (event.clientY - bounds.top - rect.y) / rect.h;
    return stillClickInput(nx, ny);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) {
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
    if (this.mode !== "stills") {
      return;
    }
    const input = keyToInput(event.code);
    if (!input) {
      return;
    }
    event.preventDefault();
    if (event.repeat) {
      return;
    }
    this.tryMove(input);
  }

  private tryMove(input: WalkInput): void {
    const session = this.stills;
    if (!session) {
      return;
    }
    if (session.busy) {
      session.queuedInput = input;
      return;
    }
    session.hqGen += 1;
    const tr = transitionForInput(session.graph, session.pose, input);
    if (!tr) {
      return;
    }
    void this.playTransition(tr);
  }

  private flushStillsInput(): void {
    const session = this.stills;
    if (!session || session.busy) {
      return;
    }
    const queued = session.queuedInput;
    session.queuedInput = null;
    const input = queued ?? heldWalkInput(this.heldKeys);
    if (input) {
      this.tryMove(input);
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
    const url = frameUrl(isNight(this.state.clock), frame.frame0, frame.offset);
    if (session.view.showCached(url)) {
      return;
    }
    void this.showHold();
  }

  private async playTransition(tr: SetTransition): Promise<void> {
    const session = this.stills;
    if (!session) {
      return;
    }
    session.busy = true;
    session.pending = tr;
    const night = isNight(this.state.clock);
    const urls = transitionUrls(tr, night);
    const anim = createStillAnim(urls);
    session.anim = anim;
    void session.view.ensure(urls);
    if (!session.view.showCached(urls[0])) {
      try {
        await session.view.ensure([urls[0]]);
      } catch {
        if (session.anim === anim) {
          session.anim = null;
          session.pending = null;
          session.busy = false;
          this.flushStillsInput();
        }
        return;
      }
      if (session.anim !== anim) {
        return;
      }
      session.view.showCached(urls[0]);
    }
    this.clock.getDelta();
    anim.ready = true;
    this.preloadAround(applyTransition(tr));
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
    await session.view.show(frameUrl(isNight(this.state.clock), frame.frame0, frame.offset));
    if (this.stills !== session || session.hqGen !== gen) {
      return;
    }
    this.syncHud();
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
    const night = isNight(this.state.clock);
    const urls: string[] = [];
    const seen = new Set<string>();
    const queue: { pose: WalkerPose; depth: number }[] = [{ pose: origin, depth: 0 }];
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) {
        break;
      }
      const key = `${item.pose.x},${item.pose.y},${item.pose.facing}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const hq = hqFrame(session.graph, item.pose);
      if (hq !== undefined) {
        urls.push(frameUrl(night, hq.frame0, hq.offset));
      }
      if (item.depth >= 1) {
        continue;
      }
      for (const input of ["left", "right", "forward"] as const) {
        const tr = transitionForInput(session.graph, item.pose, input);
        if (!tr) {
          continue;
        }
        urls.push(...transitionUrls(tr, night));
        queue.push({ pose: applyTransition(tr), depth: item.depth + 1 });
      }
    }
    session.view.preload(urls);
  }

  private applyClockState(state: GlobalState): void {
    this.state = state;
    if (this.free) {
      applyLighting(this.free.scene, this.free.lights, this.state.clock);
      setTownNightWindows(this.free.scene, this.state.clock);
    }
    if (this.stills) {
      this.stills.anim = null;
      this.stills.pending = null;
      this.stills.queuedInput = null;
      this.stills.hqGen += 1;
      this.stills.busy = false;
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
      this.promptEl.textContent = poseLabel(this.stills.graph, this.stills.pose);
    }
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.free) {
      this.free.camera.aspect = w / h;
      this.free.camera.updateProjectionMatrix();
    }
    if (this.stills) {
      this.stills.view.layout(w, h);
    }
  }
}

function heldWalkInput(keys: Set<string>): WalkInput | null {
  if (keys.has("ArrowUp") || keys.has("KeyW")) {
    return "forward";
  }
  if (keys.has("ArrowLeft") || keys.has("KeyA")) {
    return "left";
  }
  if (keys.has("ArrowRight") || keys.has("KeyD")) {
    return "right";
  }
  return null;
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

function transitionUrls(tr: SetTransition, night: boolean): string[] {
  const urls: string[] = [];
  const count = framesToPlay(tr);
  for (let i = 0; i < count; i += 1) {
    urls.push(frameUrl(night, tr.frame0, i));
  }
  return urls;
}
