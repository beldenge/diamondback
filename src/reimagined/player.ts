/**
 * Pointer-lock FPS body: AABB vs. world AABBs with slide (not sticky),
 * step-up for boardwalks/stairs, gravity + jump. Feet-based position.
 */
import { wishXZ } from "./coords";
import type { Aabb } from "./geometry";

export const EYE_HEIGHT = 1.62;
const BODY_RADIUS = 0.38;
const BODY_HEIGHT = 1.78;
const STEP_UP = 0.42;
const WALK_SPEED = 4.4;
const SPRINT_SPEED = 7.6;
const JUMP_SPEED = 4.7;
const GRAVITY = 13.5;

export interface MoveInput {
  forward: number; // −1..1
  right: number; // −1..1
  sprint: boolean;
  jump: boolean;
}

function overlapsXZ(box: Aabb, x: number, z: number): boolean {
  return (
    x + BODY_RADIUS > box.minX &&
    x - BODY_RADIUS < box.maxX &&
    z + BODY_RADIUS > box.minZ &&
    z - BODY_RADIUS < box.maxZ
  );
}

function overlapsY(box: Aabb, y: number): boolean {
  return y + BODY_HEIGHT > box.minY && y < box.maxY;
}

export class Player {
  x = 0;

  y = 0;

  z = 0;

  yaw = 0;

  pitch = 0;

  vy = 0;

  onGround = true;

  place(x: number, y: number, z: number, yaw: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.yaw = yaw;
    this.pitch = 0;
    this.vy = 0;
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx * 0.0022;
    this.pitch -= dy * 0.0022;
    const lim = Math.PI / 2 - 0.02;
    if (this.pitch > lim) {
      this.pitch = lim;
    }
    if (this.pitch < -lim) {
      this.pitch = -lim;
    }
  }

  private free(boxes: Aabb[], x: number, y: number, z: number): boolean {
    for (const box of boxes) {
      if (overlapsXZ(box, x, z) && y + BODY_HEIGHT > box.minY && y < box.maxY) {
        return false;
      }
    }
    return true;
  }

  private moveAxis(boxes: Aabb[], dx: number, dz: number): void {
    let nx = this.x + dx;
    let nz = this.z + dz;
    for (let pass = 0; pass < 4; pass += 1) {
      let hit: Aabb | null = null;
      for (const box of boxes) {
        if (overlapsXZ(box, nx, nz) && overlapsY(box, this.y)) {
          hit = box;
          break;
        }
      }
      if (!hit) {
        break;
      }
      // step up onto low ledges (boardwalks, stair treads)
      const rise = hit.maxY - this.y;
      if (rise > 0 && rise <= STEP_UP && this.vy <= 0.01 && this.free(boxes, nx, hit.maxY + 0.001, nz)) {
        this.y = hit.maxY + 0.001;
        continue;
      }
      // push out along the moved axis
      if (dx !== 0) {
        nx = dx > 0 ? hit.minX - BODY_RADIUS - 0.001 : hit.maxX + BODY_RADIUS + 0.001;
      } else if (dz !== 0) {
        nz = dz > 0 ? hit.minZ - BODY_RADIUS - 0.001 : hit.maxZ + BODY_RADIUS + 0.001;
      } else {
        break;
      }
    }
    this.x = nx;
    this.z = nz;
  }

  update(dt: number, input: MoveInput, boxes: Aabb[]): void {
    const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
    const mag = Math.hypot(input.forward, input.right);
    if (mag > 0.001) {
      const wish = wishXZ(this.yaw, input.forward / Math.max(1, mag), input.right / Math.max(1, mag));
      this.moveAxis(boxes, wish.x * speed * dt, 0);
      this.moveAxis(boxes, 0, wish.z * speed * dt);
    }

    // vertical
    if (input.jump && this.onGround) {
      this.vy = JUMP_SPEED;
      this.onGround = false;
    }
    this.vy -= GRAVITY * dt;
    let ny = this.y + this.vy * dt;

    if (this.vy <= 0) {
      // find the highest support below
      let ground = 0;
      for (const box of boxes) {
        if (overlapsXZ(box, this.x, this.z) && box.maxY <= this.y + 0.05 && box.maxY > ground) {
          ground = box.maxY;
        }
      }
      if (ny <= ground) {
        ny = ground;
        this.vy = 0;
        this.onGround = true;
      } else {
        this.onGround = false;
      }
    } else {
      // ceiling
      for (const box of boxes) {
        if (overlapsXZ(box, this.x, this.z) && box.minY >= this.y + BODY_HEIGHT - 0.3) {
          if (ny + BODY_HEIGHT > box.minY) {
            ny = box.minY - BODY_HEIGHT;
            this.vy = 0;
          }
        }
      }
      this.onGround = false;
    }
    this.y = ny;

    // never fall through the world
    if (this.y < -5) {
      this.y = 0;
      this.vy = 0;
    }
    // soft world bounds
    this.x = Math.min(190, Math.max(-70, this.x));
    this.z = Math.min(210, Math.max(-70, this.z));
  }

  get eyeY(): number {
    return this.y + EYE_HEIGHT;
  }
}
