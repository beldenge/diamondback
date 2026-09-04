/**
 * Ambient life: a meteor across the night sky every so often, and the
 * odd tumbleweed bouncing down a street. Purely visual — nothing here
 * collides with the walker, and the timing is sparse on purpose.
 */
import * as THREE from "three";

const SKY_CENTRE = new THREE.Vector3(52, 0, 60);
const SKY_R = 430; // inside the 480 m dome, well past the fog (fog is off)

/** Street lanes a tumbleweed may roll along: start → end, in the wind. */
const LANES: { x0: number; z0: number; x1: number; z1: number }[] = [
  { x0: 52, z0: 27, x1: 52, z1: 118 }, // Main Street south to the gate
  { x0: 2, z0: 52, x1: 86, z1: 52 }, // Neely Street west to east
  { x0: 10, z0: 84.5, x1: 94, z1: 84.5 }, // Day Street
  { x0: 35, z0: 28.5, x1: 78, z1: 28.5 }, // Mission Street, east of the cage cart
  { x0: 76, z0: 30, x1: 76, z1: 86 }, // Lee Street
  { x0: 28, z0: 32, x1: 28, z1: 86 }, // the west lane
];

const G = 9.8;
const WEED_R = 0.34;

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function streakTex(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (ctx) {
    // head (top row, v = 1) bright, tail fading to nothing
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, "rgba(255,250,235,1)");
    g.addColorStop(0.25, "rgba(220,230,255,0.75)");
    g.addColorStop(1, "rgba(160,180,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 64);
  }
  return new THREE.CanvasTexture(c);
}

class Meteor {
  readonly obj = new THREE.Group();

  private dir = new THREE.Vector3();

  private speed = 0;

  private life = 0;

  private age = 0;

  private mat: THREE.MeshBasicMaterial;

  active = false;

  constructor(tex: THREE.Texture) {
    this.mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    // two crossed strips along +Z so the streak reads from any angle
    for (const roll of [0, Math.PI / 2]) {
      const geom = new THREE.PlaneGeometry(1.1, 30);
      geom.rotateX(Math.PI / 2);
      geom.rotateZ(roll);
      const mesh = new THREE.Mesh(geom, this.mat);
      this.obj.add(mesh);
    }
    this.obj.visible = false;
  }

  fire(yaw: number, pitch: number): void {
    // a point on the dome inside (or just beside) the view, heading
    // mostly downward along the surface: a streak behind the walker is
    // a streak nobody sees
    const viewAz = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
    const az = viewAz + rand(-1.0, 1.0);
    const el = Math.min(1.25, Math.max(0.28, pitch + rand(0.12, 0.6)));
    const pos = new THREE.Vector3(
      Math.cos(el) * Math.cos(az),
      Math.sin(el),
      Math.cos(el) * Math.sin(az),
    );
    const up = pos.clone();
    const east = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    const down = new THREE.Vector3().crossVectors(east, up).normalize();
    if (down.y > 0) {
      down.negate();
    }
    const lean = rand(-0.9, 0.9);
    this.dir.copy(down).addScaledVector(east, lean).normalize();
    this.obj.position.copy(SKY_CENTRE).addScaledVector(pos, SKY_R);
    this.obj.lookAt(this.obj.position.clone().add(this.dir));
    this.obj.scale.set(1, 1, rand(0.7, 1.4));
    this.speed = rand(150, 260);
    this.life = rand(0.45, 0.85);
    this.age = 0;
    this.active = true;
    this.obj.visible = true;
  }

  update(dt: number): void {
    if (!this.active) {
      return;
    }
    this.age += dt;
    if (this.age >= this.life) {
      this.active = false;
      this.obj.visible = false;
      this.mat.opacity = 0;
      return;
    }
    this.obj.position.addScaledVector(this.dir, this.speed * dt);
    const t = this.age / this.life;
    const env = t < 0.15 ? t / 0.15 : t > 0.55 ? (1 - t) / 0.45 : 1;
    this.mat.opacity = env * 0.85;
  }
}

class Tumbleweed {
  readonly obj = new THREE.Group();

  active = false;

  private lane = LANES[0];

  private dir = new THREE.Vector2();

  private perp = new THREE.Vector2();

  private length = 0;

  private dist = 0;

  private speed = 0;

  private y = 0;

  private vy = 0;

  private phase = 0;

  private wobble = 0;

  private axis = new THREE.Vector3();

  constructor() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xb5a068 });
    // a ball of twig hoops at odd angles (lit, so it goes dark at night)
    for (let i = 0; i < 11; i += 1) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(WEED_R * rand(0.72, 1), 0.01, 4, 16), mat);
      hoop.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
      // No shadow: the sun's map is static (see `ReimaginedGame.tick`) and
      // a 0.4-unit twig ball is one texel of a 260-unit / 2048 map anyway.
      this.obj.add(hoop);
    }
    this.obj.visible = false;
  }

  start(): void {
    this.lane = LANES[Math.floor(Math.random() * LANES.length)];
    const dx = this.lane.x1 - this.lane.x0;
    const dz = this.lane.z1 - this.lane.z0;
    this.length = Math.hypot(dx, dz);
    this.dir.set(dx / this.length, dz / this.length);
    this.perp.set(-this.dir.y, this.dir.x);
    // rolling axis is across the direction of travel
    this.axis.set(-this.perp.x, 0, -this.perp.y);
    this.dist = 0;
    this.speed = rand(2.4, 3.8);
    this.y = 0;
    this.vy = rand(1, 2.2);
    this.phase = rand(0, Math.PI * 2);
    this.wobble = rand(0.6, 1.3);
    this.obj.quaternion.identity();
    this.active = true;
    this.obj.visible = true;
  }

  update(dt: number): void {
    if (!this.active) {
      return;
    }
    this.dist += this.speed * dt;
    if (this.dist >= this.length) {
      this.active = false;
      this.obj.visible = false;
      return;
    }
    this.vy -= G * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      // most landings hop again; some roll a moment before the next gust
      this.vy = Math.random() < 0.3 ? 0.35 : rand(0.9, 2.6);
    }
    const side = Math.sin(this.dist * 0.35 + this.phase) * this.wobble;
    this.obj.position.set(
      this.lane.x0 + this.dir.x * this.dist + this.perp.x * side,
      this.y + WEED_R,
      this.lane.z0 + this.dir.y * this.dist + this.perp.y * side,
    );
    this.obj.rotateOnWorldAxis(this.axis, (this.speed * dt) / WEED_R);
  }
}

export class Ambient {
  readonly group = new THREE.Group();

  private meteors: Meteor[] = [];

  private weeds: Tumbleweed[] = [];

  private nextMeteor = rand(1.5, 4);

  private nextWeed = rand(6, 14);

  constructor() {
    const tex = streakTex();
    for (let i = 0; i < 2; i += 1) {
      const m = new Meteor(tex);
      this.meteors.push(m);
      this.group.add(m.obj);
    }
    for (let i = 0; i < 2; i += 1) {
      const w = new Tumbleweed();
      this.weeds.push(w);
      this.group.add(w.obj);
    }
  }

  update(dt: number, night: boolean, yaw = 0, pitch = 0): void {
    if (night) {
      this.nextMeteor -= dt;
      if (this.nextMeteor <= 0) {
        this.nextMeteor = rand(3, 8);
        const free = this.meteors.find((m) => !m.active);
        if (free) {
          free.fire(yaw, pitch);
        }
      }
    }
    for (const m of this.meteors) {
      if (!night && m.active) {
        // dawn: drop any streak mid-flight
        m.update(1e9);
      }
      m.update(dt);
    }

    this.nextWeed -= dt;
    if (this.nextWeed <= 0) {
      this.nextWeed = rand(25, 60);
      const free = this.weeds.find((w) => !w.active);
      if (free) {
        free.start();
      }
    }
    for (const w of this.weeds) {
      w.update(dt);
    }
  }
}
