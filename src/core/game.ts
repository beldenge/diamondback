import {
  Clock,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { PlayerController } from "../player/controls";
import { pickInteractable } from "../player/interact";
import { collisionAabbs, TOWN_LAYOUT } from "../world/layout";
import { applyLighting, createTownLights, type TownLights } from "../world/lighting";
import { buildTown, setTownNightWindows } from "../world/town";
import { createInitialState, sleep, type GlobalState } from "./state";
import { formatTime } from "./time";

export class Game {
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly player: PlayerController;
  private readonly lights: TownLights;
  private readonly clock = new Clock();
  private state: GlobalState = createInitialState();
  private readonly timeEl: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly hintEl: HTMLElement;

  constructor(canvas: HTMLCanvasElement) {
    this.camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 250);
    this.camera.position.set(TOWN_LAYOUT.spawn.x, TOWN_LAYOUT.spawn.y, TOWN_LAYOUT.spawn.z);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = TOWN_LAYOUT.spawn.yaw + Math.PI;
    this.applyDebugView(new URLSearchParams(window.location.search));

    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    const town = buildTown();
    this.scene.add(town);
    this.lights = createTownLights(this.scene, this.state.clock);
    setTownNightWindows(town, this.state.clock);

    this.player = new PlayerController(
      this.camera,
      canvas,
      collisionAabbs(),
      TOWN_LAYOUT.playBounds,
    );
    this.scene.add(this.player.controls.object);

    const timeEl = document.getElementById("hud-time");
    const promptEl = document.getElementById("hud-prompt");
    const hintEl = document.getElementById("hud-hint");
    if (!timeEl || !promptEl || !hintEl) {
      throw new Error("HUD elements missing from index.html");
    }
    this.timeEl = timeEl;
    this.promptEl = promptEl;
    this.hintEl = hintEl;
    this.syncHud();

    canvas.addEventListener("click", () => this.onClick());
    window.addEventListener("resize", () => this.onResize());
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.player.update(dt);
    const target = this.player.locked
      ? pickInteractable(this.camera, TOWN_LAYOUT.interactables)
      : null;
    this.promptEl.textContent = target ? target.label : "";
    this.hintEl.style.opacity = this.player.locked ? "0.45" : "0.9";
    this.renderer.render(this.scene, this.camera);
  }

  private onClick(): void {
    if (!this.player.locked) {
      this.player.lock();
      return;
    }
    const target = pickInteractable(this.camera, TOWN_LAYOUT.interactables);
    if (target?.kind === "sleep") {
      this.state = sleep(this.state);
      applyLighting(this.scene, this.lights, this.state.clock);
      setTownNightWindows(this.scene, this.state.clock);
      this.syncHud();
    }
  }

  private applyDebugView(params: URLSearchParams): void {
    const view = params.get("view");
    if (view === "hotel") {
      this.camera.position.set(-4, 1.65, 20.2);
    } else if (view === "street") {
      this.camera.position.set(0, 1.65, -6);
    }
    const clock = Number(params.get("clock"));
    if (clock === 1 || clock === 2 || clock === 3) {
      this.state = { ...this.state, clock };
    }
  }

  private syncHud(): void {
    this.timeEl.textContent = formatTime(this.state.day, this.state.clock);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
