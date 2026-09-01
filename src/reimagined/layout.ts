/**
 * The town plan, as data. Pure module (no three.js) so tests can hold
 * the geometry to the film without a DOM.
 *
 * Everything here was derived by walking the 52 filmed poses of
 * `_TOWN` (HQ stills + turn frames) and each interior SET's walkable
 * camera tiles. Streets are the camera-tile lanes; buildings sit OFF
 * the street on facade lots. See the door table in the repo spec —
 * `src/world/set/doors.ts` is the authoritative pose list.
 */

import { TILE, type Facing } from "./coords";

/** Wall slab thickness. Street-face decorations must clear this. */
export const WALL_T = 0.3;

/** Ground-floor storey height (upper floors sit on top of this). */
export const STOREY = 3.7;

export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export function rect(minX: number, minZ: number, maxX: number, maxZ: number): Rect {
  return { minX, minZ, maxX, maxZ };
}

const T = TILE;

/**
 * Building shells (outer footprint, wall to wall). Main Street is
 * column 7 (x tile 6, world 48..56); G-street is row G (z 48..56).
 */
export const LOTS = {
  // --- Main Street, west side (maxX = 48 faces the street) ---
  saloon: rect(40, 56, 48, 74.5), // Hard Drive Saloon, H7+I7. Door at H7.
  saloonBackshed: rect(32, 56, 40, 80), // backlot to the west lane; J4 E back door
  bank: rect(40, 40, 48, 48), // F7 W, brick, no porch
  doctor: rect(40, 32, 48, 40), // E7 W
  doctorAnnex: rect(33, 32, 40, 40), // "GRANT" side annex on the west lane
  jail: rect(40, 88, 48, 96), // L7 W, adobe

  // --- Main Street, east side (minX = 56 faces the street) ---
  stage: rect(56, 56, 64, 64), // H7 E
  stageWarehouse: rect(64, 56, 72, 62.5), // dark shed behind, door on Lee
  watson: rect(56, 64, 67, 72), // I7 E
  bolivar: rect(56, 72, 66, 80), // J7 E
  bolivarAnnex: rect(66, 72, 72, 80), // hardware annex (lumber yard implied out back)
  whiteHouse: rect(67, 62.5, 72, 70), // white boarding house, west side of Lee
  curio: rect(56, 88, 72, 96), // L7 E, blackwood + red
  hotel: rect(56, 32, 72, 48), // E7+F7 east, two-story olive
  santaMarta: rect(66, 16, 76, 24), // cream brick cantina, north side of Mission St

  // --- Mission (fills the north view; courtyard inside) ---
  mission: rect(34, -10, 66, 24),
  school: rect(42, -9, 62, 1), // north side inside the mission
  padre: rect(34, -9, 42, -1), // west of the school

  // --- G-street (Neely) west ---
  sidewinder: rect(0, 56, 9, 66), // G1 S, dark wood, barber pole
  rattler: rect(10, 56, 24, 64.5), // H4 W, green storefront on the west lane
  cemetery: rect(1, 29, 22.5, 47.5), // Shady Acres, north of G1..G3

  // --- East: Lee street (col 10, world 72..80) stays open D10..K10 ---
  livery: rect(80, 38, 92, 48), // F10 E; south wall lines the G11 alley
  mayorFence: rect(80, 56, 97, 80), // brick pillars + wood fence, south of Neely
  mansion: rect(86, 57, 100, 75), // set back east of the gate
  redBarnSE: rect(87, 90, 97, 99), // south of the Day-street fence line

  // --- Farm south-west (the pale wall east of the well IS the jail) ---
  wheelwright: rect(5, 72, 17, 80),
  whiteStable: rect(0, 80, 8, 88),
  grayBarn: rect(3, 88, 16, 98), // south of Day street; X-door faces the L3 spur
  farmhouse: rect(24, 88, 34, 96.5),
  blackBarn: rect(23.5, 97, 34, 107),
  rockCityShed: rect(12, 65.5, 22, 72),

  // --- North-east farm (clear of the mission footprint + Mission St) ---
  neBarn: rect(80, 20, 90, 34), // gambrel barn, X-door faces west
  redStable: rect(68, 6.5, 78, 13.5),

  // --- South gate barns (west of the gate) ---
  swBarn: rect(34, 100, 44, 110),
} as const;

export type LotName = keyof typeof LOTS;

/** Gate geometry: posts + hanging DIAMONDBACK sign between N7 and O7. */
export const GATE = {
  z: 112.4,
  westPostX: 48.6,
  eastPostX: 55.4,
  beamY: 6.7,
  signTop: 6.1,
  signBottom: 4.9,
};

/** Tall dark palisade, east of Main at the gate; ends at Curiosities. */
export const PALISADE = {
  x: 56.5,
  zNorth: 103, // black run starts here; weathered gray fence 96..103
  zSouth: GATE.z,
  height: 4.4,
  eastEndX: 66, // the south run turns the yard corner here
};

export interface DoorSpec {
  id: string;
  /** Street pose from the authoritative doors table, e.g. "L7 W". */
  pose: string;
  /** Which way the door leaf faces (the wall's outward normal). */
  side: Facing;
  /** Hinge position (world). The leaf swings from here. */
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  /** Positive swings toward +yaw (left seen from outside). */
  swing: 1 | -1;
  label: string;
  /** Double doors get a mirrored second leaf. */
  double?: boolean;
  /** Iron gate look instead of wood planks. */
  gate?: boolean;
}

function door(
  id: string,
  pose: string,
  side: Facing,
  x: number,
  z: number,
  width: number,
  height: number,
  label: string,
  opts: Partial<DoorSpec> = {},
): DoorSpec {
  return { id, pose, side, x, y: 0, z, width, height, swing: 1, label, ...opts };
}

/**
 * Clickable street doors. One per authoritative pose:
 *
 * | Watson's | I7 E |  | Bolivar's | J7 E |  | Saloon | H7 W (+ J4 E back) |
 * | Stage | H7 E |  | Hotel | E7 E |  | Doctor | E7 W |  | Bank | F7 W |
 * | Jail | L7 W |  | Curiosities | L7 E |  | Mission | D7 N |
 * | Rattler | H4 W |  | Sidewinder | G1 S |  | Livery | F10 E |
 * | Mayor gate | I10 E |
 *
 * Positions: hinge X/Z on the wall face; door tiles are the street
 * poses (facades centre on the pose tile, H7 saloon door offset north
 * because the porch fills I7).
 */
export const STREET_DOORS: readonly DoorSpec[] = [
  door("watson", "I7 E", "W", LOTS.watson.minX, 68.8, 1.3, 2.6, "Watson's Apothecary", { swing: -1 }),
  door("bolivar", "J7 E", "W", LOTS.bolivar.minX, 76.7, 1.25, 2.55, "Bolivar's Dry Goods", { swing: -1 }),
  door("saloon", "H7 W", "E", LOTS.saloon.maxX, 59.6, 1.35, 2.7, "Hard Drive Saloon"),
  door("saloonBack", "J4 E", "W", LOTS.saloonBackshed.minX, 75.6, 1.2, 2.45, "Saloon back door", { swing: -1 }),
  door("stage", "H7 E", "W", LOTS.stage.minX, 60.7, 1.3, 2.6, "Stagecoach office", { swing: -1 }),
  door("hotel", "E7 E", "W", LOTS.hotel.minX, 36.9, 1.9, 2.75, "Cactus Bed Hotel", { swing: -1, double: true }),
  door("doctor", "E7 W", "E", LOTS.doctor.maxX, 35.5, 1.25, 2.55, "Dr. Rodham"),
  door("bank", "F7 W", "E", LOTS.bank.maxX, 43.4, 1.35, 2.75, "Bank"),
  door("jail", "L7 W", "E", LOTS.jail.maxX, 93.6, 1.3, 2.55, "Sheriff", { swing: -1 }),
  door("curio", "L7 E", "W", LOTS.curio.minX, 91.2, 1.5, 2.6, "Curiosities", { double: true }),
  door("mission", "D7 N", "S", 50.3, LOTS.mission.maxZ, 3.4, 3.4, "Mission", { double: true }),
  door("rattler", "H4 W", "E", LOTS.rattler.maxX, 60.7, 1.25, 2.55, "The Rattler"),
  door("sidewinder", "G1 S", "N", 3.6, LOTS.sidewinder.minZ, 1.3, 2.55, "Sidewinder Undertaking", { swing: -1 }),
  door("livery", "F10 E", "W", LOTS.livery.minX, 45.7, 1.35, 2.6, "Livery", { swing: -1 }),
  door("mayor", "I10 E", "W", 80, 66.6, 2.7, 2.5, "Mayor's gate", { double: true, gate: true }),
];

export function streetDoor(id: string): DoorSpec {
  const found = STREET_DOORS.find((d) => d.id === id);
  if (!found) {
    throw new Error(`no street door ${id}`);
  }
  return found;
}

/**
 * Real see-through windows. Each spec cuts a hole in the building
 * shell AND its interior lining (both consume `winGaps`), and the
 * town builder adds frame + clear glass (+ bars where set).
 * `at` is the wall-run coordinate: z for E/W walls, x for N/S walls.
 */
export interface WindowSpec {
  side: Facing;
  at: number;
  w: number;
  bottom: number;
  top: number;
  bars?: boolean;
}

function win(
  side: Facing,
  at: number,
  w: number,
  bottom: number,
  top: number,
  bars?: boolean,
): WindowSpec {
  return { side, at, w, bottom, top, bars };
}

export const WINDOWS: Partial<Record<LotName, readonly WindowSpec[]>> = {
  // saloon ground porch keeps its film-glow panes; upper rooms see out
  saloon: [61.7, 64.4, 67.4, 70.4, 73.2].map((z) => win("E", z, 1.0, 4.85, 6.35)),
  hotel: [
    ...[33.8, 35.2, 39.2, 41.2, 46.4].map((z) => win("W", z, 0.95, 1.25, 2.75)),
    ...[33.8, 38.6, 41, 43.4, 45.8].map((z) => win("W", z, 0.95, 4.45, 5.95)),
    ...[58.4, 69.6].map((x) => win("S", x, 0.95, 1.35, 2.85)),
    ...[58.4, 61.2, 66.8, 69.6].map((x) => win("S", x, 0.95, 4.45, 5.95)),
  ],
  jail: [win("E", 89.9, 1.0, 1.15, 2.45, true), win("W", 92.4, 1.2, 1.5, 2.6)],
  bank: [win("E", 41.4, 1.1, 1.05, 2.65, true), win("E", 46.2, 1.1, 1.05, 2.65, true)],
  watson: [win("W", 66, 1.0, 1.1, 2.6), win("W", 70.6, 1.0, 1.1, 2.6)],
  bolivar: [win("W", 74.2, 1.05, 1.1, 2.6), win("W", 78.6, 1.05, 1.1, 2.6)],
  doctor: [win("E", 32.9, 0.85, 1.1, 2.55), win("E", 34.15, 0.8, 1.1, 2.55), win("E", 37.3, 0.95, 1.1, 2.55)],
  curio: [win("W", 89.3, 1.0, 1.2, 2.6), win("W", 94.4, 1.0, 1.2, 2.6)],
  rattler: [win("E", 58.2, 1.5, 1.05, 2.65), win("E", 62.9, 1.5, 1.05, 2.65)],
  sidewinder: [win("N", 1.6, 1.1, 1.05, 2.55), win("N", 6.4, 1.1, 1.05, 2.55)],
  livery: [win("W", 40.6, 1.05, 1.1, 2.5), win("W", 43.2, 1.05, 1.1, 2.5)],
  mansion: [
    ...[59.5, 62, 70, 72.5].map((z) => win("W", z, 0.95, 1.15, 2.65)),
    ...[59.5, 62, 70, 72.5].map((z) => win("W", z, 0.95, 4.55, 6.05)),
  ],
};

/** Wall gaps (with sill + header) for a lot's windows on one side. */
export function winGaps(
  lot: LotName,
  side: Facing,
): { from: number; to: number; top: number; bottom: number }[] {
  return (WINDOWS[lot] ?? [])
    .filter((w) => w.side === side)
    .map((w) => ({
      from: w.at - w.w / 2 - 0.08,
      to: w.at + w.w / 2 + 0.08,
      top: w.top,
      bottom: w.bottom,
    }));
}

/**
 * Street-face decoration rule: signs / windows / posters on a wall
 * must sit OUTSIDE the wall's AABB, not buried inside its thickness.
 * For a west-side building's east face the decoration plane goes
 * beyond maxX; for an east-side building's west face, before minX.
 */
export const DECOR_GAP = 0.02;

export function decorX(shell: Rect, side: "E" | "W"): number {
  return side === "E" ? shell.maxX + DECOR_GAP : shell.minX - DECOR_GAP;
}

export function decorZ(shell: Rect, side: "N" | "S"): number {
  return side === "N" ? shell.minZ - DECOR_GAP : shell.maxZ + DECOR_GAP;
}

export interface LabelZone {
  name: string;
  box: Rect;
  /** Y band, so upper floors don't steal the ground-floor name. */
  minY: number;
  maxY: number;
}

function zone(name: string, box: Rect, minY = -2, maxY = STOREY - 0.2): LabelZone {
  return { name, box, minY, maxY };
}

function upper(name: string, box: Rect): LabelZone {
  return zone(name, box, STOREY - 0.2, STOREY + 5);
}

/** First match wins; interiors and upper floors before streets. */
export const LABEL_ZONES: readonly LabelZone[] = [
  upper("Hard Drive Saloon — upstairs", LOTS.saloon),
  zone("Hard Drive Saloon", LOTS.saloon),
  upper("Cactus Bed Hotel — upstairs", LOTS.hotel),
  zone("Cactus Bed Hotel", LOTS.hotel),
  upper("Mayor's mansion — upstairs", LOTS.mansion),
  zone("Mayor's mansion", LOTS.mansion),
  zone("Sheriff's office", LOTS.jail),
  zone("Curiosities", LOTS.curio),
  zone("Watson's Apothecary", LOTS.watson),
  zone("Bolivar's Dry Goods", rect(LOTS.bolivar.minX, 72, LOTS.bolivarAnnex.maxX, 80)),
  zone("Stagecoach office", LOTS.stage),
  zone("Diamondback Bank & Trust", LOTS.bank),
  zone("Dr. Rodham's parlour", rect(LOTS.doctorAnnex.minX, 32, LOTS.doctor.maxX, 40)),
  zone("Schoolhouse", LOTS.school),
  zone("Padre's room", LOTS.padre),
  zone("Mission courtyard", LOTS.mission),
  zone("The Rattler", rect(LOTS.rattler.minX, 55, 27, 64.5)),
  zone("Sidewinder Undertaking", LOTS.sidewinder),
  zone("Livery", LOTS.livery),
  zone("Shady Acres", LOTS.cemetery),
  zone("Mayor's yard", rect(80, 56, 86, 80)),
  // Streets. The south gate label covers the gate approach N7..O8.
  zone("South gate", rect(36, 104.5, 68, 126), -2, 30),
  zone("Main Street", rect(46, 22, 58, 100), -2, 30),
  zone("Neely Street", rect(0, 46, 82, 58), -2, 30),
  zone("Day Street", rect(4, 78, 96, 90), -2, 30),
  zone("Mission Street", rect(24, 22, 88, 34), -2, 30),
  zone("Lee Street", rect(70, 22, 82, 90), -2, 30),
  zone("The farm", rect(0, 58, 48, 108), -2, 30),
  zone("Rifle range", rect(56, 88, 100, 116), -2, 30),
  zone("Diamondback", rect(-40, -40, 160, 160), -5, 40),
];

export function placeLabel(x: number, y: number, z: number): string {
  for (const l of LABEL_ZONES) {
    if (
      x >= l.box.minX &&
      x <= l.box.maxX &&
      z >= l.box.minZ &&
      z <= l.box.maxZ &&
      y >= l.minY &&
      y <= l.maxY
    ) {
      return l.name;
    }
  }
  return "Diamondback";
}

/** T alias kept for builders that want tile-unit arithmetic. */
export const LT = T;
