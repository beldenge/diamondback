import type { ClockSlot } from "../../core/time";
import { tileKey, WORLD_TOWN } from "./graph";
import type { Dir, SetGraph } from "./types";

/** Dust `pointx`/`pointy` box. Tests use the original exclusive bounds (`>` / `<`). */
export interface HitBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface DoorLockCtx {
  day: number;
  clock: ClockSlot;
  phase: number;
  fightOn: boolean;
}

export type DoorGo =
  | {
      kind: "set";
      world: string;
      /** Court / school swap SET files at night. */
      worldNight?: string;
      scene: string;
      facing: Dir;
    }
  | { kind: "town"; facing: Dir };

export type DoorSfx =
  | "knock1"
  | "knock2"
  | "dooropen1"
  | "dooropen2"
  | "dooropen3"
  | "gate"
  | "doorclose1"
  | "doorclose2"
  | "doorclose3";

export interface DoorDef {
  id: string;
  world: string;
  scene: string;
  facing: Dir;
  hitbox: HitBox;
  /** `PRP/_HOUSE/FRAMES/door/<sprite>/`. Empty if that state was never dumped. */
  sprite: string;
  spriteNight?: string;
  openSound: DoorSfx;
  knockSound: DoorSfx;
  locked: (ctx: DoorLockCtx) => boolean;
  go: DoorGo;
}

/** PRP door PNG filenames (`00_c<container>.png`). */
const DOOR_PNG: Record<string, string> = {
  apoth: "00_c563.png",
  bank: "00_c565.png",
  store: "00_c567.png",
  hotel: "00_c569.png",
  chin: "00_c571.png",
  doctor: "00_c573.png",
  back: "00_c575.png",
  saloon: "00_c577.png",
  jail: "00_c579.png",
  livery: "00_c581.png",
  paper: "00_c583.png",
  stage: "00_c585.png",
  undertak: "00_c587.png",
  mayor: "00_c589.png",
  nitemayo: "00_c591.png",
  doc1: "00_c629.png",
  doc2: "00_c631.png",
  doc4: "00_c633.png",
  padre: "00_c649.png",
  padreout: "00_c655.png",
  courtout: "00_c657.png",
  court: "00_c659.png",
  schoolin: "00_c661.png",
  schoolout: "00_c663.png",
  courtoutnite: "00_c665.png",
  courtinnite: "00_c667.png",
  schoolinnite: "00_c669.png",
  schooloutnite: "00_c671.png",
};

export function closeSfx(door: DoorDef): DoorSfx {
  if (door.openSound === "dooropen2") {
    return "doorclose2";
  }
  if (door.openSound === "dooropen3") {
    return "doorclose3";
  }
  if (door.openSound === "gate") {
    return "gate";
  }
  return "doorclose1";
}

export function doorSpriteUrl(state: string): string | undefined {
  const file = DOOR_PNG[state];
  if (!file) {
    return undefined;
  }
  return `/extract/PRP/_HOUSE/FRAMES/door/${state}/${file}`;
}

export function hitTest(box: HitBox, x: number, y: number): boolean {
  return x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1;
}

export function hitCenter(box: HitBox): { x: number; y: number } {
  return { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
}

/** Sandbox: every door is openable. Quest locks stay in the file for a later story pass. */
export function neverLocked(_ctx: DoorLockCtx): boolean {
  return false;
}

/** Apoth / store / doctor / stage / undertaker / livery / paper daytime shops. */
export function lockDaytimeShop(ctx: DoorLockCtx): boolean {
  if (ctx.day === 5 || ctx.fightOn) {
    return true;
  }
  if (ctx.clock === 3) {
    return true;
  }
  if ((ctx.day === 2 || ctx.day === 3) && ctx.clock === 1 && ctx.phase < 2) {
    return true;
  }
  if (ctx.day === 4) {
    return true;
  }
  return false;
}

export function lockBank(ctx: DoorLockCtx): boolean {
  return lockDaytimeShop(ctx);
}

export function lockHotel(ctx: DoorLockCtx): boolean {
  return ctx.day === 5 || ctx.day === 4 || ctx.fightOn;
}

export function lockSaloon(ctx: DoorLockCtx): boolean {
  if (ctx.day === 5 || ctx.fightOn) {
    return true;
  }
  if (ctx.clock === 1 && ctx.day !== 4) {
    return true;
  }
  if (ctx.day === 1 && ctx.phase >= 7) {
    return true;
  }
  return false;
}

export function lockCourt(ctx: DoorLockCtx): boolean {
  if (ctx.day === 5 || ctx.fightOn) {
    return true;
  }
  return false;
}

export function lockJail(ctx: DoorLockCtx): boolean {
  if (ctx.day === 5 || ctx.fightOn) {
    return true;
  }
  if (ctx.day < 2) {
    return true;
  }
  if (ctx.day === 2 && ctx.clock < 3) {
    return true;
  }
  return false;
}

export function lockChin(ctx: DoorLockCtx): boolean {
  if (ctx.day === 5 || ctx.fightOn) {
    return true;
  }
  if (ctx.day === 1 && ctx.phase < 2) {
    return true;
  }
  if (ctx.day === 2 && ctx.clock === 2 && ctx.phase > 0) {
    return true;
  }
  if (ctx.day === 4) {
    return true;
  }
  return false;
}

export function lockMayor(ctx: DoorLockCtx): boolean {
  if (ctx.day === 3 && ctx.clock === 3) {
    return false;
  }
  return true;
}

export function lockBack(_ctx: DoorLockCtx): boolean {
  return true;
}

export function lockPaper(ctx: DoorLockCtx): boolean {
  if (ctx.day === 5 || ctx.fightOn) {
    return true;
  }
  if (ctx.clock === 3) {
    return true;
  }
  if (ctx.day === 2 && ctx.clock === 1 && ctx.phase < 2) {
    return true;
  }
  if (ctx.day === 3 && ctx.clock === 1) {
    return true;
  }
  if (ctx.day === 4) {
    return true;
  }
  return false;
}

/**
 * Street doors + matching interior exits. Hand-ported from TOWN/NITE scene
 * scripts and each SET’s `gototown` / `gotointerior` handlers. We do not
 * interpret DreamFactory at runtime.
 *
 * Opposite facades share a tile (L7 jail/chin, E7 hotel/doctor, H7
 * saloon/stage). Original `gototown` facing is the other door. We step
 * out on `townPose.facing` (the door you used) and only enter when open.
 */
export const DOORS: readonly DoorDef[] = [
  {
    id: "town-apoth",
    world: WORLD_TOWN,
    scene: "scene i7",
    facing: "E",
    hitbox: { x0: 218, y0: 94, x1: 286, y1: 205 },
    sprite: "apoth",
    openSound: "dooropen3",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "set", world: "_APOTH", scene: "scene c2", facing: "W" },
  },
  {
    id: "apoth-out",
    world: "_APOTH",
    scene: "scene c2",
    facing: "E",
    hitbox: { x0: 163, y0: 33, x1: 336, y1: 263 },
    sprite: "pharm",
    openSound: "dooropen3",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "town", facing: "W" },
  },
  {
    id: "town-bank",
    world: WORLD_TOWN,
    scene: "scene f7",
    facing: "W",
    hitbox: { x0: 200, y0: 81, x1: 306, y1: 232 },
    sprite: "bank",
    openSound: "dooropen2",
    knockSound: "knock2",
    locked: neverLocked,
    go: { kind: "set", world: "_BANK", scene: "scene d2", facing: "W" },
  },
  {
    id: "bank-out",
    world: "_BANK",
    scene: "scene d2",
    facing: "E",
    hitbox: { x0: 177, y0: 30, x1: 339, y1: 263 },
    sprite: "dollar",
    openSound: "dooropen2",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "town", facing: "E" },
  },
  {
    id: "town-saloon",
    world: WORLD_TOWN,
    scene: "scene h7",
    facing: "W",
    hitbox: { x0: 241, y0: 92, x1: 307, y1: 201 },
    sprite: "saloon",
    openSound: "dooropen1",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "set", world: "_SALLOWER", scene: "scene d1", facing: "W" },
  },
  {
    id: "saloon-out",
    world: "_SALLOWER",
    scene: "scene d1",
    facing: "E",
    hitbox: { x0: 144, y0: 7, x1: 387, y1: 264 },
    sprite: "salout",
    openSound: "dooropen1",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "town", facing: "E" },
  },
  {
    id: "town-stage",
    world: WORLD_TOWN,
    scene: "scene h7",
    facing: "E",
    hitbox: { x0: 220, y0: 98, x1: 285, y1: 209 },
    sprite: "stage",
    openSound: "dooropen3",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "set", world: "_STAGE", scene: "scene a2", facing: "E" },
  },
  {
    id: "stage-out",
    world: "_STAGE",
    scene: "scene a2",
    facing: "W",
    hitbox: { x0: 176, y0: 63, x1: 336, y1: 261 },
    sprite: "car",
    openSound: "dooropen3",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "town", facing: "W" },
  },
  {
    id: "town-hotel",
    world: WORLD_TOWN,
    scene: "scene e7",
    facing: "E",
    hitbox: { x0: 200, y0: 91, x1: 305, y1: 203 },
    sprite: "hotel",
    openSound: "dooropen2",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "set", world: "_HOTLOWER", scene: "scene a1", facing: "E" },
  },
  {
    id: "hotel-out",
    world: "_HOTLOWER",
    scene: "scene a1",
    facing: "W",
    hitbox: { x0: 128, y0: 73, x1: 394, y1: 262 },
    sprite: "hotout",
    openSound: "dooropen2",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "town", facing: "W" },
  },
  {
    id: "town-doctor",
    world: WORLD_TOWN,
    scene: "scene e7",
    facing: "W",
    hitbox: { x0: 215, y0: 85, x1: 299, y1: 225 },
    sprite: "doctor",
    openSound: "dooropen3",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "set", world: "_DOCTOR1", scene: "scene b1", facing: "W" },
  },
  {
    id: "doctor-out",
    world: "_DOCTOR1",
    scene: "scene b1",
    facing: "E",
    hitbox: { x0: 204, y0: 67, x1: 321, y1: 263 },
    sprite: "doc2",
    openSound: "dooropen1",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "town", facing: "E" },
  },
  {
    id: "town-store",
    world: WORLD_TOWN,
    scene: "scene j7",
    facing: "E",
    hitbox: { x0: 222, y0: 96, x1: 287, y1: 211 },
    sprite: "store",
    openSound: "dooropen3",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "set", world: "_STORE", scene: "scene d2", facing: "W" },
  },
  {
    id: "store-out",
    world: "_STORE",
    scene: "scene d2",
    facing: "E",
    hitbox: { x0: 166, y0: 66, x1: 332, y1: 264 },
    sprite: "shop",
    openSound: "dooropen3",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "town", facing: "W" },
  },
  {
    id: "town-jail",
    world: WORLD_TOWN,
    scene: "scene l7",
    facing: "W",
    hitbox: { x0: 122, y0: 77, x1: 218, y1: 230 },
    sprite: "jail",
    openSound: "dooropen2",
    knockSound: "knock2",
    locked: neverLocked,
    go: { kind: "set", world: "_JAIL", scene: "scene a1", facing: "E" },
  },
  {
    id: "jail-out",
    world: "_JAIL",
    scene: "scene a1",
    facing: "W",
    hitbox: { x0: 183, y0: 34, x1: 361, y1: 263 },
    sprite: "lock",
    openSound: "dooropen2",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "town", facing: "E" },
  },
  {
    id: "town-chin",
    world: WORLD_TOWN,
    scene: "scene l7",
    facing: "E",
    hitbox: { x0: 218, y0: 100, x1: 278, y1: 204 },
    sprite: "chin",
    openSound: "dooropen1",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "set", world: "_CHIN", scene: "scene a2", facing: "E" },
  },
  {
    id: "chin-out",
    world: "_CHIN",
    scene: "scene a2",
    facing: "W",
    hitbox: { x0: 100, y0: 2, x1: 408, y1: 263 },
    sprite: "rice",
    openSound: "dooropen1",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "town", facing: "W" },
  },
  {
    id: "town-court",
    world: WORLD_TOWN,
    scene: "scene d7",
    facing: "N",
    hitbox: { x0: 160, y0: 22, x1: 338, y1: 214 },
    sprite: "court",
    spriteNight: "courtinnite",
    openSound: "dooropen2",
    knockSound: "knock2",
    locked: neverLocked,
    go: {
      kind: "set",
      world: "_COURT",
      worldNight: "_NITECOUR",
      scene: "scene c5",
      facing: "N",
    },
  },
  {
    id: "court-out",
    world: "_COURT",
    scene: "scene c5",
    facing: "S",
    hitbox: { x0: 147, y0: 37, x1: 377, y1: 263 },
    sprite: "courtout",
    spriteNight: "courtoutnite",
    openSound: "dooropen2",
    knockSound: "knock2",
    locked: neverLocked,
    go: { kind: "town", facing: "S" },
  },
  {
    id: "nitecour-out",
    world: "_NITECOUR",
    scene: "scene c5",
    facing: "S",
    hitbox: { x0: 147, y0: 37, x1: 377, y1: 263 },
    sprite: "courtoutnite",
    openSound: "dooropen2",
    knockSound: "knock2",
    locked: neverLocked,
    go: { kind: "town", facing: "S" },
  },
  {
    id: "town-undertak",
    world: WORLD_TOWN,
    scene: "scene d4",
    facing: "W",
    hitbox: { x0: 206, y0: 74, x1: 298, y1: 221 },
    sprite: "undertak",
    openSound: "dooropen3",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "set", world: "_UNDERTAK", scene: "scene a2", facing: "E" },
  },
  {
    id: "undertak-out",
    world: "_UNDERTAK",
    scene: "scene a2",
    facing: "W",
    hitbox: { x0: 99, y0: 0, x1: 477, y1: 262 },
    sprite: "underout",
    openSound: "dooropen3",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "town", facing: "N" },
  },
  {
    id: "town-paper",
    world: WORLD_TOWN,
    scene: "scene d8",
    facing: "W",
    hitbox: { x0: 213, y0: 98, x1: 282, y1: 211 },
    sprite: "paper",
    openSound: "dooropen3",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "set", world: "_PAPER", scene: "scene b2", facing: "W" },
  },
  {
    id: "paper-out",
    world: "_PAPER",
    scene: "scene b2",
    facing: "E",
    hitbox: { x0: 138, y0: 47, x1: 365, y1: 264 },
    sprite: "flipout",
    openSound: "dooropen3",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "town", facing: "E" },
  },
  {
    id: "town-livery",
    world: WORLD_TOWN,
    scene: "scene d9",
    facing: "W",
    hitbox: { x0: 204, y0: 82, x1: 293, y1: 235 },
    sprite: "livery",
    openSound: "dooropen3",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "set", world: "_LIVERY", scene: "scene d2", facing: "W" },
  },
  {
    id: "livery-out",
    world: "_LIVERY",
    scene: "scene d2",
    facing: "E",
    hitbox: { x0: 157, y0: 35, x1: 340, y1: 264 },
    sprite: "horse",
    openSound: "dooropen3",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "town", facing: "W" },
  },
  {
    id: "town-mayor",
    world: WORLD_TOWN,
    scene: "scene j9",
    facing: "E",
    hitbox: { x0: 174, y0: 82, x1: 335, y1: 228 },
    sprite: "mayor",
    spriteNight: "nitemayo",
    openSound: "gate",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "set", world: "_MAYHALL", scene: "scene c4", facing: "N" },
  },
  {
    id: "mayor-out",
    world: "_MAYHALL",
    scene: "scene c4",
    facing: "S",
    hitbox: { x0: 165, y0: 58, x1: 356, y1: 263 },
    sprite: "front",
    openSound: "dooropen3",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "town", facing: "W" },
  },
  {
    id: "town-back",
    world: WORLD_TOWN,
    scene: "scene j4",
    facing: "E",
    hitbox: { x0: 3, y0: 83, x1: 91, y1: 234 },
    sprite: "back",
    openSound: "dooropen1",
    knockSound: "knock1",
    locked: neverLocked,
    go: { kind: "set", world: "_SALLOWER", scene: "scene b4", facing: "E" },
  },
];

export function sceneNameOf(graph: SetGraph, x: number, y: number): string | undefined {
  return graph.scenes.get(tileKey(x, y))?.name;
}

export function doorOnPose(
  world: string,
  sceneName: string | undefined,
  facing: Dir,
): DoorDef | undefined {
  if (!sceneName) {
    return undefined;
  }
  const scene = sceneName.trim().toLowerCase();
  return DOORS.find(
    (door) => door.world === world && door.scene === scene && door.facing === facing,
  );
}

export function doorAt(
  world: string,
  sceneName: string | undefined,
  facing: Dir,
  x: number,
  y: number,
): DoorDef | undefined {
  const door = doorOnPose(world, sceneName, facing);
  if (!door) {
    return undefined;
  }
  if (hitTest(door.hitbox, x, y)) {
    return door;
  }
  // Facade stills: any click in the middle of the plate is the door.
  if (x > 120 && x < 400 && y > 40 && y < 250) {
    return door;
  }
  return undefined;
}

export function doorMatchesPose(
  door: DoorDef | null,
  world: string,
  sceneName: string | undefined,
  facing: Dir,
): boolean {
  if (!door || !sceneName) {
    return false;
  }
  return (
    door.world === world &&
    door.scene === sceneName.trim().toLowerCase() &&
    door.facing === facing
  );
}

export function goWorld(go: DoorGo, night: boolean): string | undefined {
  if (go.kind === "town") {
    return WORLD_TOWN;
  }
  return night && go.worldNight ? go.worldNight : go.world;
}

/** Street doors that share a scene on opposite facings. */
export function oppositeFacadePairs(): { scene: string; a: DoorDef; b: DoorDef }[] {
  const town = DOORS.filter((door) => door.world === WORLD_TOWN);
  const pairs: { scene: string; a: DoorDef; b: DoorDef }[] = [];
  for (let i = 0; i < town.length; i += 1) {
    for (let j = i + 1; j < town.length; j += 1) {
      const a = town[i];
      const b = town[j];
      if (a.scene === b.scene && a.facing !== b.facing) {
        pairs.push({ scene: a.scene, a, b });
      }
    }
  }
  return pairs;
}

export function overlaySprite(door: DoorDef, night: boolean): string | undefined {
  const state = night && door.spriteNight ? door.spriteNight : door.sprite;
  return doorSpriteUrl(state);
}
