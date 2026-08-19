import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
} from "three";
import { isNight, type ClockSlot } from "../core/time";
import {
  TOWN_LAYOUT,
  type BuildingSpec,
  type LandmarkSpec,
  type TownLayout,
} from "./layout";

const groundMat = new MeshLambertMaterial({ color: 0xc2a36a });
const roadMat = new MeshLambertMaterial({ color: 0xa88858 });
const nightWindowMat = new MeshLambertMaterial({
  color: 0xffd080,
  emissive: 0xffc060,
  emissiveIntensity: 0.9,
});

export function buildTown(layout: TownLayout = TOWN_LAYOUT): Group {
  const root = new Group();
  root.name = "diamondback";

  const ground = new Mesh(new PlaneGeometry(200, 200), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  const road = new Mesh(new PlaneGeometry(8, 110), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  root.add(road);

  for (const b of layout.buildings) {
    root.add(makeBuilding(b));
  }
  for (const l of layout.landmarks) {
    root.add(makeLandmark(l));
  }
  root.add(makeBed(layout));
  return root;
}

function makeBuilding(b: BuildingSpec): Group {
  const g = new Group();
  g.name = b.id;
  const elev = b.elev ?? 0;
  const mesh = new Mesh(
    new BoxGeometry(b.sx, b.sy, b.sz),
    new MeshLambertMaterial({ color: b.color }),
  );
  mesh.position.set(b.x, elev + b.sy / 2, b.z);
  g.add(mesh);

  if (b.label) {
    const sign = new Mesh(
      new PlaneGeometry(Math.min(b.sx, b.sz, 7.4), 0.7),
      new MeshLambertMaterial({ map: makeSign(b.label), side: DoubleSide }),
    );
    const y = elev + Math.min(b.sy - 0.6, 2.6);
    // Face Main Street (x≈0). Mission/cemetery row faces south.
    if (Math.abs(b.z) > 34) {
      sign.position.set(b.x, y, b.z - b.sz / 2 - 0.03);
    } else if (b.x < 0) {
      sign.position.set(b.x + b.sx / 2 + 0.03, y, b.z);
      sign.rotation.y = Math.PI / 2;
    } else {
      sign.position.set(b.x - b.sx / 2 - 0.03, y, b.z);
      sign.rotation.y = -Math.PI / 2;
    }
    g.add(sign);
  }

  if (b.sy >= 3.4 && b.collide) {
    const win = new Mesh(new PlaneGeometry(0.7, 0.85), nightWindowMat);
    win.name = "window";
    const y = elev + 2.1;
    if (Math.abs(b.z) > 34) {
      win.position.set(b.x, y, b.z - b.sz / 2 - 0.04);
    } else if (b.x < 0) {
      win.position.set(b.x + b.sx / 2 + 0.04, y, b.z);
      win.rotation.y = Math.PI / 2;
    } else {
      win.position.set(b.x - b.sx / 2 - 0.04, y, b.z);
      win.rotation.y = -Math.PI / 2;
    }
    win.visible = false;
    g.add(win);
  }
  return g;
}

function makeLandmark(l: LandmarkSpec): Group {
  const g = new Group();
  g.name = l.id;
  if (l.kind === "well") {
    const well = new Mesh(
      new CylinderGeometry(0.9, 1.05, 1.1, 12),
      new MeshLambertMaterial({ color: 0x6a6258 }),
    );
    well.position.set(l.x, 0.55, l.z);
    g.add(well);
  } else if (l.kind === "fountain") {
    const basin = new Mesh(
      new CylinderGeometry(1.1, 1.3, 0.5, 14),
      new MeshLambertMaterial({ color: 0x7a8a92 }),
    );
    basin.position.set(l.x, 0.25, l.z);
    g.add(basin);
  } else if (l.kind === "tower") {
    const pole = new Mesh(
      new CylinderGeometry(0.15, 0.2, 8, 8),
      new MeshLambertMaterial({ color: 0x5a4030 }),
    );
    pole.position.set(l.x, 4, l.z);
    const tank = new Mesh(
      new CylinderGeometry(1.1, 1.1, 1.4, 10),
      new MeshLambertMaterial({ color: 0x6a5040 }),
    );
    tank.position.set(l.x, 7.4, l.z);
    g.add(pole, tank);
  } else if (l.kind === "dog") {
    const body = new Mesh(
      new BoxGeometry(0.7, 0.45, 1.1),
      new MeshLambertMaterial({ color: 0x1a120c }),
    );
    body.position.set(l.x, 0.35, l.z);
    g.add(body);
  } else if (l.kind === "bone") {
    const bone = new Mesh(
      new BoxGeometry(0.55, 0.12, 0.16),
      new MeshLambertMaterial({ color: 0xe8dcc0 }),
    );
    bone.position.set(l.x, 0.08, l.z);
    g.add(bone);
  } else if (l.kind === "stone") {
    const stone = new Mesh(
      new BoxGeometry(0.5, 0.9, 0.16),
      new MeshLambertMaterial({ color: 0x8a8680 }),
    );
    stone.position.set(l.x, 0.45, l.z);
    g.add(stone);
  } else if (l.kind === "fence") {
    const alongX = l.id.endsWith("-s") || l.id.endsWith("-n");
    const fence = new Mesh(
      new BoxGeometry(alongX ? 12 : 0.12, 1.1, alongX ? 0.12 : 12),
      new MeshLambertMaterial({ color: 0x5a4030 }),
    );
    fence.position.set(l.x, 0.55, l.z);
    g.add(fence);
  }
  return g;
}

function makeBed(layout: TownLayout): Mesh {
  const spec = layout.interactables.find((i) => i.id === "hotel.bed");
  const bed = new Mesh(
    new BoxGeometry(1.8, 0.4, 2.2),
    new MeshLambertMaterial({ color: 0x6a3040 }),
  );
  bed.name = "hotel.bed";
  if (spec) {
    bed.position.set(spec.x, spec.y, spec.z);
  }
  return bed;
}

function makeSign(text: string): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) {
    throw new Error("2d canvas unavailable");
  }
  ctx.fillStyle = "#2a1c10";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#d8c090";
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, c.width - 6, c.height - 6);
  ctx.fillStyle = "#f3e6c8";
  ctx.font = "bold 28px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2);
  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export function setTownNightWindows(root: Object3D, clock: ClockSlot): void {
  const night = isNight(clock);
  root.traverse((obj) => {
    if (obj instanceof Mesh && obj.name === "window") {
      obj.visible = night;
    }
  });
}
