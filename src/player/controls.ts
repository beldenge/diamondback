import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import type { Camera } from "three";
import { clampToBounds, resolveCircleAabbs, type Aabb } from "../world/collision";

const SPEED = 7;
const RADIUS = 0.38;
const EYE = 1.65;

export class PlayerController {
  readonly controls: PointerLockControls;
  private readonly keys = new Set<string>();
  private readonly boxes: Aabb[];
  private readonly bounds: Aabb;

  constructor(camera: Camera, canvas: HTMLElement, boxes: Aabb[], bounds: Aabb) {
    this.controls = new PointerLockControls(camera, canvas);
    this.boxes = boxes;
    this.bounds = bounds;
    camera.position.y = EYE;

    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
  }

  get locked(): boolean {
    return this.controls.isLocked;
  }

  lock(): void {
    if (!this.controls.isLocked) this.controls.lock();
  }

  update(dt: number): void {
    if (!this.controls.isLocked) return;
    const cam = this.controls.object;
    const prevX = cam.position.x;
    const prevZ = cam.position.z;

    let forward = 0;
    let right = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) forward += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) forward -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) right += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) right -= 1;

    if (forward !== 0 || right !== 0) {
      const len = Math.hypot(forward, right);
      const step = SPEED * dt;
      this.controls.moveForward((forward / len) * step);
      this.controls.moveRight((right / len) * step);
    }

    const resolved = resolveCircleAabbs(
      cam.position.x,
      cam.position.z,
      prevX,
      prevZ,
      RADIUS,
      this.boxes,
    );
    const clamped = clampToBounds(resolved.x, resolved.z, this.bounds);
    cam.position.x = clamped.x;
    cam.position.z = clamped.z;
    cam.position.y = EYE;
  }
}
