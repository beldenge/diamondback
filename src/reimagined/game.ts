/**
 * Dust: Reimagined — a 3D free-roam of Diamondback. URL-only mode
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
import { Hud } from "./hud";
import { Player } from "./player";
import { Sky } from "./sky";
import { parseSpawn } from "./spawn";
import { buildTown } from "./town";
import { FountainSecret, buildUnderground } from "./underground";

const REACH = 4.2;

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

  private staticBoxes: Aabb[] = [];

  private frameBoxes: Aabb[] = [];

  private keys = new Set<string>();

  private raycaster = new THREE.Raycaster();

  private clock = new THREE.Clock();

  private running = false;

  private disposed = false;

  /** Debug `still=1`: no start shade; clicks work without pointer lock. */
  private still = false;

  private detach: (() => void)[] = [];

  constructor(search: string) {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "reimagined-viewport";
    this.canvas.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;display:block;background:#0a0604;z-index:20;cursor:crosshair;";
    document.body.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // The film projects with focal 310 on a 512-wide still: 79° across,
    // 46° tall. A 58° vertical field keeps that feel at 16:9 without
    // the fisheye stretch a wider lens gives the porches.
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 900);
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

    for (const l of [...interiors.lights, ...under.lights]) {
      const light = new THREE.PointLight(l.color, l.intensity, l.distance, 2);
      light.position.set(l.x, l.y, l.z);
      this.scene.add(light);
    }

    this.sky = new Sky(this.scene, nightGroup);
    this.scene.add(this.sky.group);
    // meteors at night, the odd tumbleweed down the streets
    this.ambient = new Ambient();
    this.scene.add(this.ambient.group);

    this.hud = new Hud();
    // Debug `still=1`: start without the click-to-enter shade so pose
    // screenshots compare cleanly against the film stills.
    const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    this.still = query.get("still") !== null;
    this.hud.setPaused(!this.still);

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

    on(this.canvas, "click", () => {
      if (!this.still && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }
    });
    on(document, "pointerlockchange", () => {
      this.hud.setPaused(document.pointerLockElement !== this.canvas);
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
        this.sky.toggle(this.scene);
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
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
    on(window, "blur", () => {
      this.keys.clear();
    });
  }

  private aimedDoor(): Clickable | null {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = REACH;
    const meshes: THREE.Mesh[] = [];
    for (const door of this.doors) {
      for (const hm of door.hitMeshes) {
        meshes.push(hm);
      }
    }
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) {
      return null;
    }
    const first = hits[0].object as THREE.Mesh;
    return (first.userData.door as Clickable) ?? null;
  }

  private tryToggleDoor(): void {
    const door = this.aimedDoor();
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
    const locked = document.pointerLockElement === this.canvas;

    for (const door of this.doors) {
      door.update(dt);
    }
    this.cafe.update(this.player.x, this.player.z, dt);
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

    const active = locked || this.still;
    const forward =
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    const right =
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
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
        sprint: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
        jump: active && this.keys.has("Space"),
      },
      this.frameBoxes,
      baseY,
    );

    this.camera.position.set(this.player.x, this.player.eyeY, this.player.z);
    this.camera.rotation.y = this.player.yaw;
    this.camera.rotation.x = this.player.pitch;

    this.hud.setPlace(placeLabel(this.player.x, this.player.y, this.player.z));
    if (locked || this.still) {
      const door = this.aimedDoor();
      this.hud.setPrompt(door ? `${door.open ? "Close" : "Open"} — ${door.spec.label}` : null);
    }

    this.renderer.render(this.scene, this.camera);
  }

  hide(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.canvas.style.display = "none";
    this.hud.hidden = true;
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
    this.canvas.remove();
  }
}
