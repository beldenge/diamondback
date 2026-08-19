import type { Aabb } from "./collision";

/**
 * Graybox Diamondback.
 *
 * +Z is north (mission), +X is east, Y is up.
 * Layout is inferred from the Just Adventure Day-1 walk (south entry → dog →
 * town → Hard Drive → hotel), SET names, and the box-art aerial — not from
 * extracted SET grids. Replace when TOWN.SET is parsed.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BuildingSpec {
  id: string;
  label: string;
  /** Center on XZ; floor sits on y=0. */
  x: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  /** Bottom of the box. Default 0 (sits on the ground). */
  elev?: number;
  color: number;
  collide: boolean;
}

export interface LandmarkSpec {
  id: string;
  kind: "well" | "bone" | "dog" | "stone" | "tower" | "fountain" | "fence";
  x: number;
  z: number;
  collide: boolean;
}

export interface InteractableSpec {
  id: string;
  label: string;
  kind: "sleep";
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface TownLayout {
  spawn: Vec3 & { yaw: number };
  playBounds: Aabb;
  buildings: BuildingSpec[];
  landmarks: LandmarkSpec[];
  interactables: InteractableSpec[];
}

const adobe = 0xc4a06a;
const wood = 0x6b4423;
const darkWood = 0x3d2918;
const clapboard = 0xb9a07a;
const mission = 0xb56a4a;
const stone = 0x8a8374;
const hotel = 0x9a7b52;
const jail = 0x6d6a63;

export const TOWN_LAYOUT: TownLayout = {
  spawn: { x: 0, y: 1.65, z: -46, yaw: 0 },
  playBounds: { minX: -42, maxX: 42, minZ: -56, maxZ: 52 },
  buildings: [
    // West side of Main Street, south → north
    { id: "range", label: "SHOOTING RANGE", x: -16, z: -22, sx: 10, sy: 2.4, sz: 6, color: 0x8a6a3c, collide: true },
    { id: "newspaper", label: "THE RATTLER", x: -12, z: -10, sx: 8, sy: 4.2, sz: 6, color: clapboard, collide: true },
    { id: "bank", label: "BANK", x: -13, z: 0, sx: 8, sy: 4.6, sz: 7, color: stone, collide: true },
    { id: "doctor", label: "DR. RODHAM", x: -20, z: 8, sx: 7, sy: 3.8, sz: 6, color: adobe, collide: true },
    { id: "mayor", label: "MAYOR'S HOUSE", x: -22, z: 22, sx: 12, sy: 5.2, sz: 10, color: 0xd8c4a0, collide: true },
    { id: "jail", label: "JAIL", x: -12, z: 32, sx: 8, sy: 3.6, sz: 7, color: jail, collide: true },

    // East side of Main Street, south → north
    { id: "livery", label: "LIVERY", x: 16, z: -20, sx: 12, sy: 4.0, sz: 8, color: wood, collide: true },
    { id: "undertaker", label: "UNDERTAKER", x: 14, z: -10, sx: 7, sy: 3.6, sz: 6, color: 0x4a4036, collide: true },
    { id: "help", label: "HELP'S SHOP", x: 13, z: 0, sx: 8, sy: 4.0, sz: 7, color: 0xc48a4a, collide: true },
    { id: "store", label: "BOLIVAR'S", x: 14, z: 10, sx: 8, sy: 3.8, sz: 6, color: adobe, collide: true },
    { id: "apothecary", label: "APOTHECARY", x: 22, z: 10, sx: 6, sy: 3.6, sz: 6, color: 0xa87850, collide: true },
    { id: "stage", label: "STAGECOACH", x: 16, z: 20, sx: 10, sy: 3.8, sz: 7, color: wood, collide: true },

    // Center / north
    { id: "saloon", label: "HARD DRIVE SALOON", x: -8, z: 10, sx: 10, sy: 6.4, sz: 8, color: darkWood, collide: true },
    { id: "mission", label: "SANTA MARTA MISSION", x: 2, z: 40, sx: 14, sy: 7.2, sz: 10, color: mission, collide: true },
    { id: "mission-tower", label: "BELL", x: 2, z: 36, sx: 3.2, sy: 11, sz: 3.2, color: 0x9a5a3c, collide: true },

    // Hotel: four walls + roof pieces so the south door is walkable.
    { id: "hotel-west", label: "", x: -7.75, z: 22, sx: 0.5, sy: 3.6, sz: 8, color: hotel, collide: true },
    { id: "hotel-east", label: "", x: -0.25, z: 22, sx: 0.5, sy: 3.6, sz: 8, color: hotel, collide: true },
    { id: "hotel-north", label: "", x: -4, z: 25.75, sx: 8, sy: 3.6, sz: 0.5, color: hotel, collide: true },
    { id: "hotel-south-w", label: "", x: -6.4, z: 18.25, sx: 3.2, sy: 3.6, sz: 0.5, color: hotel, collide: true },
    { id: "hotel-south-e", label: "", x: -1.6, z: 18.25, sx: 3.2, sy: 3.6, sz: 0.5, color: hotel, collide: true },
    { id: "hotel-roof", label: "HOTEL", x: -4, z: 22, sx: 8.2, sy: 0.4, sz: 8.2, elev: 3.6, color: 0x6a4030, collide: false },
  ],
  landmarks: [
    { id: "dog", kind: "dog", x: 0, z: -28, collide: false },
    { id: "bone", kind: "bone", x: 6, z: -44, collide: false },
    { id: "well", kind: "well", x: 1, z: 4, collide: true },
    { id: "fountain", kind: "fountain", x: 2, z: 32, collide: true },
    { id: "tower", kind: "tower", x: -6, z: -4, collide: true },
    { id: "grave-1", kind: "stone", x: 20, z: 36, collide: true },
    { id: "grave-2", kind: "stone", x: 23, z: 38, collide: true },
    { id: "grave-3", kind: "stone", x: 18, z: 39, collide: true },
    { id: "grave-4", kind: "stone", x: 22, z: 34, collide: true },
    { id: "mayor-fence-s", kind: "fence", x: -22, z: 16, collide: true },
    { id: "mayor-fence-w", kind: "fence", x: -29, z: 22, collide: true },
  ],
  interactables: [
    {
      id: "hotel.bed",
      label: "Sleep until morning",
      kind: "sleep",
      x: -4,
      y: 0.55,
      z: 23.4,
      radius: 2.2,
    },
  ],
};

export function buildingAabb(b: BuildingSpec): Aabb {
  return {
    minX: b.x - b.sx / 2,
    maxX: b.x + b.sx / 2,
    minZ: b.z - b.sz / 2,
    maxZ: b.z + b.sz / 2,
  };
}

export function landmarkAabb(l: LandmarkSpec): Aabb | null {
  if (!l.collide) return null;
  if (l.kind === "well" || l.kind === "fountain") {
    return { minX: l.x - 0.9, maxX: l.x + 0.9, minZ: l.z - 0.9, maxZ: l.z + 0.9 };
  }
  if (l.kind === "tower") {
    return { minX: l.x - 0.7, maxX: l.x + 0.7, minZ: l.z - 0.7, maxZ: l.z + 0.7 };
  }
  if (l.kind === "stone") {
    return { minX: l.x - 0.35, maxX: l.x + 0.35, minZ: l.z - 0.2, maxZ: l.z + 0.2 };
  }
  if (l.kind === "fence") {
    const alongX = l.id.endsWith("-s") || l.id.endsWith("-n");
    return alongX
      ? { minX: l.x - 6, maxX: l.x + 6, minZ: l.z - 0.12, maxZ: l.z + 0.12 }
      : { minX: l.x - 0.12, maxX: l.x + 0.12, minZ: l.z - 6, maxZ: l.z + 6 };
  }
  return null;
}

export function collisionAabbs(layout: TownLayout = TOWN_LAYOUT): Aabb[] {
  const boxes: Aabb[] = [];
  for (const b of layout.buildings) {
    if (b.collide) boxes.push(buildingAabb(b));
  }
  for (const l of layout.landmarks) {
    const box = landmarkAabb(l);
    if (box) boxes.push(box);
  }
  return boxes;
}

export function findBuilding(id: string, layout: TownLayout = TOWN_LAYOUT): BuildingSpec | undefined {
  return layout.buildings.find((b) => b.id === id);
}

export function findLandmark(id: string, layout: TownLayout = TOWN_LAYOUT): LandmarkSpec | undefined {
  return layout.landmarks.find((l) => l.id === id);
}

export function findInteractable(id: string, layout: TownLayout = TOWN_LAYOUT): InteractableSpec | undefined {
  return layout.interactables.find((i) => i.id === id);
}
