/**
 * Dust: Reimagined — a 3D free-roam of Diamondback
 * (`/?mode=reimagined`): pointer-lock FPS, empty town, clickable doors,
 * `N` day/night. Esc releases the look; Esc again returns to the
 * chooser. Isolated from the stills walker: no VM, no SET playback.
 */
import * as THREE from "three";
import { Ambient } from "./ambient";
import { CafeDoors, SwingDoor, type Clickable } from "./doorsim";
import type { Aabb } from "./geometry";
import { INTERIOR_DOORS, buildInteriors } from "./interiors";
import { CAFE_DOORS, SHAFT, STREET_DOORS, placeLabel } from "./layout";
import { getMats } from "./materials";
import { LightPool } from "./lights";
import { Hud } from "./hud";
import { Player } from "./player";
import { Sky } from "./sky";
import { TouchControls } from "./touch";
import { parseSpawn } from "./spawn";
import { buildTown } from "./town";
import { FountainSecret, buildUnderground } from "./underground";
import { auditDecor } from "./audit";

const REACH = 4.2;

/** Screen-space centre of the crosshair ray; constant, so do not reallocate it. */
const CROSSHAIR = new THREE.Vector2(0, 0);

/** A tapped door may be a step further off than one you walked up to. */
const TOUCH_REACH = 6.5;

/**
 * Render-scale notches, coarsest last. A 4K display asks for a 2x
 * buffer — 7.3 megapixels, four MSAA samples each — which a laptop GPU
 * cannot fill at 60. The ceiling is still the display's own ratio
 * (capped at 2), so nothing changes on hardware that keeps up.
 */
const SCALE_STEPS = [2, 1.5, 1.25, 1, 0.75] as const;

/** Frame budget, in ms, above which the renderer drops a notch… */
const SCALE_DOWN_MS = 20;

/** …and below which it climbs back. The gap is the anti-oscillation margin. */
const SCALE_UP_MS = 11;

/** Frames of agreement before a step, plus the same again as a cooldown. */
const SCALE_FRAMES = 45;

export class ReimaginedGame {
  onQuit: (() => void) | null = null;

  private canvas: HTMLCanvasElement;

  private renderer: THREE.WebGLRenderer;

  private scene = new THREE.Scene();

  private camera: THREE.PerspectiveCamera;

  private player = new Player();

  private sky: Sky;

  private hud: Hud;

  private doors: Clickable[] = [];

  private cafe: CafeDoors;

  private ambient: Ambient;

  private lights: LightPool;

  /** Frames of sun shadow map still owed (see `tick`). */
  private shadowFrames = 2;

  /** Index into `SCALE_STEPS`, plus the evidence for moving it. */
  private scaleStep = 0;

  private scaleVotes = 0;

  private scaleHold = 0;

  private frameAvgMs = 16;

  private staticBoxes: Aabb[] = [];

  private frameBoxes: Aabb[] = [];

  private keys = new Set<string>();

  private raycaster = new THREE.Raycaster();

  /** Every door's hit mesh, gathered once: the crosshair test runs per frame. */
  private hitMeshes: THREE.Mesh[] = [];

  private clock = new THREE.Clock();

  private running = false;

  private disposed = false;

  /** Debug `still=1`: no start shade; clicks work without pointer lock. */
  private still = false;

  private touch: TouchControls;

  /** Touch has no pointer lock to enter, so the shade lifts on first tap. */
  private touchStarted = false;

  /** `pointerType` of the last press on the canvas: mouse locks, touch does not. */
  private lastPointer = "mouse";

  /** Problems the dressing audit found at build time (read via `window.reimagined`). */
  readonly decorReport: string[] = [];

  private detach: (() => void)[] = [];

  constructor(search: string) {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "reimagined-viewport";
    this.canvas.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;display:block;background:#0a0604;z-index:20;cursor:crosshair;touch-action:none;";
    document.body.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // The town does not move. Redrawing 377 shadow casters every frame
    // was a fifth of the frame; `tick` asks for a redraw when a door
    // swings or the sky flips instead.
    this.renderer.shadowMap.autoUpdate = false;

    // The film projects with focal 310 on a 512-wide still: 79° across,
    // 46° tall. Holding the film's 79° across a 16:9 window means a
    // 50° vertical field, so the facades keep the stills' proportions.
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.rotation.order = "YXZ";

    const mats = getMats();
    const nightGroup = new THREE.Group();
    nightGroup.visible = false;

    const town = buildTown(mats, nightGroup);
    this.scene.add(town.group);
    this.scene.add(nightGroup);

    const interiors = buildInteriors(mats);
    this.scene.add(interiors.group);

    const under = buildUnderground(mats);
    this.scene.add(under.group);

    this.staticBoxes = [
      ...town.builder.colliders,
      ...interiors.builder.colliders,
      ...under.builder.colliders,
    ];
    // dressing audit for the dev handle: signs off walls, over openings, on each other
    this.decorReport = auditDecor([town.builder, interiors.builder, under.builder]);

    for (const spec of [...STREET_DOORS, ...INTERIOR_DOORS]) {
      const door = new SwingDoor(spec, mats);
      this.doors.push(door);
      this.scene.add(door.group);
    }
    // café half-doors in the saloon vestibule; they swing as you pass
    this.cafe = new CafeDoors(mats, CAFE_DOORS.x, CAFE_DOORS.z, CAFE_DOORS.width, CAFE_DOORS.side);
    this.scene.add(this.cafe.group);
    // the courtyard fountain hides the way down
    const fountain = new FountainSecret(mats);
    this.doors.push(fountain);
    this.scene.add(fountain.group);

    this.lights = new LightPool([...interiors.lights, ...under.lights]);
    this.scene.add(this.lights.group);

    this.sky = new Sky(this.scene, nightGroup);
    this.scene.add(this.sky.group);
    // meteors at night, the odd tumbleweed down the streets
    this.ambient = new Ambient();
    this.scene.add(this.ambient.group);

    this.touch = new TouchControls(this.canvas);
    this.touch.onNight = () => this.toggleNight();
    this.touch.onMenu = () => this.onQuit?.();
    this.touch.onFirstTouch = () => {
      this.touchStarted = true;
      this.hud.setTouch(true);
      this.hud.setPaused(false);
    };

    this.hud = new Hud();
    // Debug `still=1`: start without the click-to-enter shade so pose
    // screenshots compare cleanly against the film stills.
    const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    this.still = query.get("still") !== null;
    this.hud.setTouch(this.touch.engaged);
    this.hud.setPaused(!this.still && !this.touchStarted);

    const spawn = parseSpawn(search);
    this.player.place(spawn.x, spawn.y, spawn.z, spawn.yaw);

    this.bindEvents();
    // dev handle for poking the running instance from the console
    (window as unknown as { reimagined?: ReimaginedGame }).reimagined = this;
  }

  private bindEvents(): void {
    const on = (
      target: Document | Window | HTMLElement,
      type: string,
      fn: (ev: never) => void,
    ): void => {
      target.addEventListener(type, fn as EventListener);
      this.detach.push(() => target.removeEventListener(type, fn as EventListener));
    };

    on(this.canvas, "pointerdown", (ev: PointerEvent) => {
      this.lastPointer = ev.pointerType;
    });
    on(this.canvas, "click", () => {
      // Only a mouse asks for pointer lock. A phone will not grant it,
      // and on a touch laptop the finger path and the mouse path both
      // stay available — whichever was used last decides.
      if (!this.still && this.lastPointer !== "touch" && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }
    });
    on(document, "pointerlockchange", () => {
      const free = document.pointerLockElement !== this.canvas;
      this.hud.setPaused(free && !this.still && !this.touchStarted);
    });
    on(document, "mousemove", (ev: MouseEvent) => {
      if (document.pointerLockElement === this.canvas) {
        this.player.look(ev.movementX, ev.movementY);
      }
    });
    on(document, "mousedown", (ev: MouseEvent) => {
      if ((this.still || document.pointerLockElement === this.canvas) && ev.button === 0) {
        this.tryToggleDoor();
      }
    });
    on(document, "keydown", (ev: KeyboardEvent) => {
      if (!this.running) {
        return;
      }
      if (ev.code === "Escape") {
        // Pointer lock swallows its own Esc; one we can see means the
        // look is already released — return to the chooser.
        if (document.pointerLockElement !== this.canvas) {
          this.onQuit?.();
        }
        return;
      }
      this.keys.add(ev.code);
      if ((ev.code === "KeyN" || ev.key === "n" || ev.key === "N") && !ev.repeat) {
        this.toggleNight();
      }
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(ev.code)
      ) {
        ev.preventDefault();
      }
    });
    on(document, "keyup", (ev: KeyboardEvent) => {
      this.keys.delete(ev.code);
    });
    on(window, "resize", () => {
      this.renderer.setPixelRatio(this.pixelRatio());
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.shadowFrames = 2;
    });
    on(window, "blur", () => {
      this.keys.clear();
    });
  }

  private toggleNight(): void {
    this.sky.toggle(this.scene);
    // Sun moves and the night group appears: the static map is stale.
    this.shadowFrames = 2;
  }

  private aimedDoor(at: THREE.Vector2 = CROSSHAIR, reach = REACH): Clickable | null {
    this.raycaster.setFromCamera(at, this.camera);
    this.raycaster.far = reach;
    const meshes = this.hitMeshes;
    if (meshes.length === 0) {
      for (const door of this.doors) {
        for (const hm of door.hitMeshes) {
          meshes.push(hm);
        }
      }
    }
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) {
      return null;
    }
    const first = hits[0].object as THREE.Mesh;
    return (first.userData.door as Clickable) ?? null;
  }

  private tryToggleDoor(at?: THREE.Vector2, reach?: number): void {
    const door = this.aimedDoor(at, reach);
    if (door) {
      door.toggle();
    }
  }

  start(): void {
    if (this.running || this.disposed) {
      return;
    }
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private tick(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.adaptScale(dt);
    const locked = document.pointerLockElement === this.canvas;

    let moved = false;
    for (const door of this.doors) {
      moved = door.update(dt) || moved;
    }
    moved = this.cafe.update(this.player.x, this.player.z, dt) || moved;
    if (moved) {
      this.shadowFrames = 1;
    }
    this.ambient.update(dt, this.sky.night, this.player.yaw, this.player.pitch);

    // collision set: statics + closed doors + the animated fountain
    this.frameBoxes.length = 0;
    for (const box of this.staticBoxes) {
      this.frameBoxes.push(box);
    }
    for (const door of this.doors) {
      for (const c of door.colliders()) {
        this.frameBoxes.push(c);
      }
    }

    const active = locked || this.still || this.touchStarted;
    const jumpTapped = this.touch.takeJump();
    const stick = this.touch.axes();
    const drag = this.touch.takeLook();
    if (drag.x !== 0 || drag.y !== 0) {
      this.player.look(drag.x, drag.y);
    }
    const forward =
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) +
      stick.forward;
    const right =
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0) +
      stick.right;
    // the terrain plane falls away over the fountain hole and underground
    const dx = this.player.x - SHAFT.x;
    const dz = this.player.z - SHAFT.z;
    const overHole = dx * dx + dz * dz < SHAFT.r * SHAFT.r;
    const baseY = overHole || this.player.y < -0.5 ? -60 : 0;
    this.player.update(
      dt,
      {
        forward: active ? forward : 0,
        right: active ? right : 0,
        sprint: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || stick.sprint,
        jump: active && (this.keys.has("Space") || jumpTapped),
      },
      this.frameBoxes,
      baseY,
    );

    this.camera.position.set(this.player.x, this.player.eyeY, this.player.z);
    this.camera.rotation.y = this.player.yaw;
    this.camera.rotation.x = this.player.pitch;

    this.lights.update(this.camera.position);

    // A tap opens what the finger landed on, not what the camera aims at.
    // The reach is generous because a fingertip is not a crosshair.
    const tap = this.touch.takeTap();
    if (tap) {
      this.tryToggleDoor(new THREE.Vector2(tap.x, tap.y), TOUCH_REACH);
    }

    this.hud.setPlace(placeLabel(this.player.x, this.player.y, this.player.z));
    if (locked || this.still) {
      const door = this.aimedDoor();
      this.hud.setPrompt(door ? `${door.open ? "Close" : "Open"} — ${door.spec.label}` : null);
    } else if (this.touchStarted) {
      // No crosshair to hover with, so the prompt would only ever flicker.
      this.hud.setPrompt(null);
    }

    if (this.shadowFrames > 0) {
      this.shadowFrames -= 1;
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Display ratio, capped at 2, then knocked down by the current notch. */
  private pixelRatio(): number {
    return Math.min(window.devicePixelRatio, SCALE_STEPS[this.scaleStep]);
  }

  /**
   * Trade resolution for frame rate, slowly. A notch only moves after
   * `SCALE_FRAMES` frames agree, and then not again for as many more, so
   * a single hitch (a shader compile, a tab switch) never resizes the
   * buffer and the scale cannot oscillate.
   */
  private adaptScale(dt: number): void {
    const ms = dt * 1000;
    // A frame at the 50 ms clamp is a stall, not a slow frame.
    if (ms >= 49) {
      return;
    }
    this.frameAvgMs += (ms - this.frameAvgMs) * 0.1;
    if (this.scaleHold > 0) {
      this.scaleHold -= 1;
      return;
    }
    const want =
      this.frameAvgMs > SCALE_DOWN_MS ? 1 : this.frameAvgMs < SCALE_UP_MS ? -1 : 0;
    if (want === 0 || Math.sign(this.scaleVotes) !== want) {
      this.scaleVotes = want;
      return;
    }
    this.scaleVotes += want;
    if (Math.abs(this.scaleVotes) < SCALE_FRAMES) {
      return;
    }
    this.scaleVotes = 0;
    const next = this.scaleStep + want;
    if (next < 0 || next >= SCALE_STEPS.length) {
      return;
    }
    // Already at the display's own ratio: climbing further buys nothing.
    if (want < 0 && this.renderer.getPixelRatio() >= window.devicePixelRatio) {
      return;
    }
    this.scaleStep = next;
    this.scaleHold = SCALE_FRAMES;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.shadowFrames = 1;
  }

  hide(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.canvas.style.display = "none";
    this.hud.hidden = true;
    this.touch.hidden = true;
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  show(): void {
    if (this.disposed) {
      return;
    }
    this.canvas.style.display = "block";
    this.hud.hidden = false;
    this.touch.hidden = false;
    this.start();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.hide();
    this.disposed = true;
    for (const off of this.detach) {
      off();
    }
    this.detach.length = 0;
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
    });
    this.renderer.dispose();
    this.hud.dispose();
    this.touch.dispose();
    this.canvas.remove();
  }
}
