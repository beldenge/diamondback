/**
 * The town plan, as data. Pure module (no three.js) so tests can hold
 * the geometry to the film without a DOM.
 *
 * Streets are the 52 filmed camera-tile lanes of `_TOWN`; buildings
 * sit OFF the street on facade lots. Each enterable lot is sized from
 * its interior SET: the film's camera height (`header +26`, camZ) is
 * the same eye height in every SET, so one interior tile measures
 * `TILE * 62 / camZ` world units (62 is the street camZ). The
 * walkable tile grid plus the furniture strips seen around it give
 * the room, and the exterior is fitted to that — not the other way
 * round. See `src/world/set/doors.ts` for the authoritative door poses.
 */

import { TILE, type Facing } from "./coords";

/** Wall slab thickness. Street-face decorations must clear this. */
export const WALL_T = 0.3;

/** Ground-floor storey height (upper floors sit on top of this). */
export const STOREY = 3.7;

/** Street camZ from the `_TOWN` header; interior tiles scale off it. */
const STREET_CAM_Z = 62;

/**
 * World units per interior tile for a SET, from its header camZ. The
 * saloon (180) walks 2.8 m steps, the jail (140) 3.5 m, the tiny
 * curiosities shop (230) 2.2 m.
 */
export function interiorTile(camZ: number): number {
  return (TILE * STREET_CAM_Z) / camZ;
}

export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export function rect(minX: number, minZ: number, maxX: number, maxZ: number): Rect {
  return { minX, minZ, maxX, maxZ };
}

/**
 * Building shells (outer footprint, wall to wall). Main Street is
 * column 7 (x tile 6, world 48..56); Neely is row G (z 48..56).
 *
 * Enterable lots carry their derivation in the comment: SET grid
 * (cols × rows of walkable tiles) at that SET's tile size, plus the
 * unwalkable furniture strips the stills show around it.
 */
export const LOTS = {
  // --- Main Street, west side (maxX = 48 faces the street) ---
  /** `_SALLOWER` 3×6 @2.84 + the bar strip west: 11 × 19; set back so the porch edge sits on the jail's building line (x 48), porch H7..J7. */
  saloon: rect(34.7, 56, 45.7, 75),
  /** Backlot passage on the west lane; the J4 E back door is its west face. */
  saloonBackshed: rect(32, 60, 34.7, 80),
  /** `_BANK` 1×3 @3.54 lobby on the street; teller/vault rooms run back to the lane. */
  bank: rect(34, 38.5, 48, 48),
  /** `_DOCTOR1` + `_DOCTOR2`, one tile @5.2 each, waiting room east of the office. */
  doctor: rect(38, 32, 48, 38.5),
  /** The dark "GRANT" annex whose lane face is the E4 E still. */
  doctorAnnex: rect(32.5, 32, 38, 38.5),
  /** `_JAIL` 2×2 @3.54 office + the cell strip at the back. */
  jail: rect(38.5, 88, 48, 96),

  // --- Main Street, east side (minX = 56 faces the street) ---
  /** `_STAGE` 1×3 @3.3: a shallow office running along the street. */
  stage: rect(56, 56, 62, 65),
  stageWarehouse: rect(62, 56, 72, 62.5),
  /** `_APOTH` 3×1 @3.54 deep, counters both sides: 7.5 along the street × 11. */
  watson: rect(56, 65, 67, 72.5),
  /** `_STORE` 2×1 @3.1 with the U counter: 7.5 × 10. */
  bolivar: rect(56, 72.5, 66, 80),
  bolivarAnnex: rect(66, 72.5, 72, 80),
  whiteHouse: rect(67, 62.5, 72, 70),
  /** `_CHIN` 2×3 @2.16 — a narrow, shallow shop, not a warehouse. */
  curio: rect(56, 88, 63, 96),
  /** The tall dark barn hard against Curiosities' east wall (K8 S / K9 S); the range's board fence runs east from it. */
  rangeBarn: rect(63, 88.5, 68.5, 96),
  /** `_HOTLOWER` 4×3 @3.8 lobby + dining, `_HOTUPPER` corridor above. */
  hotel: rect(56, 32, 72, 48),
  santaMarta: rect(66, 16, 76, 24),

  // --- Mission compound (fills the north view; the patio inside) ---
  mission: rect(34, -6, 66, 24),
  /** `_SCHOOL` 2×1 @4.3 across the north side of the patio; its arched windows are in the compound's north wall. */
  school: rect(44.5, -6, 59.5, 2.5),
  /** `_PADRE` 1×2 @4.3 under the bell tower, west of the school, its window on the compound's west wall. */
  padre: rect(34, -6, 44.5, 2.5),

  // --- Neely west ---
  /** `_UNDERTAK` one tile @2.25 + the barber corner: a 7 m storefront. */
  sidewinder: rect(0.5, 56, 7.5, 62),
  /** `_PAPER` 1×2 @1.9 front office + the press room behind. */
  rattler: rect(17, 56, 24, 62.5),
  cemetery: rect(1, 29, 22.5, 47.5), // Shady Acres, a fenced yard you can enter

  // --- East: Lee street (col 10, world 72..80) stays open D10..K10 ---
  /** `_LIVERY` 1×2 @3.1 office at the street door; stalls behind. */
  livery: rect(80, 38, 92, 48),
  mayorFence: rect(80, 56, 101, 80),
  /** `_MAYHALL` hall between `_MAYSTUDY` (north) and `_MAYDINE` (south). */
  mansion: rect(86, 56.5, 100, 79),

  // --- Farm south-west (the pale wall east of the well IS the jail) ---
  wheelwright: rect(5, 72, 17, 80),
  whiteStable: rect(0, 80, 8, 88),
  grayBarn: rect(3, 88, 16, 98),
  farmhouse: rect(24, 88, 34, 96.5),
  blackBarn: rect(23.5, 97, 34, 107),
  rockCityShed: rect(12, 65.5, 22, 72),

  // --- North-east farm (clear of the mission footprint + Mission St) ---
  neBarn: rect(80, 20, 90, 34),
  redStable: rect(68, 6.5, 78, 13.5),
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

/**
 * The shaft under the courtyard fountain (Yunni underground): a 2.2 m
 * well with a spiral stair round a centre column. The fountain rides
 * on a square stone plinth that covers the mouth and slides east.
 */
export const SHAFT = { x: 52, z: 12.5, r: 2.2, depth: 7, plinth: 2.4, slide: 4.7 };

/** Square cut out of the ground + courtyard floor over the shaft. */
export const SHAFT_HOLE = rect(SHAFT.x - SHAFT.r, SHAFT.z - SHAFT.r, SHAFT.x + SHAFT.r, SHAFT.z + SHAFT.r);

/** Café half-doors just inside the saloon street door, hung in the vestibule's arched partition (between tiles D1 and C1). */
export const CAFE_DOORS = { x: 42.7, z: 59.0, width: 1.7, side: "E" as Facing };

/** The mission patio (`_COURT` 3×3 @5.5 + arcades), centred on the fountain. */
export const PATIO = rect(41.5, 2.5, 62.5, 22.5);

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
  /** Glazed upper panel (hotel / mansion front doors). */
  glazed?: boolean;
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
 * Hinge X/Z sit on the wall face; each door lands on the interior tile
 * the film spawns you on (saloon row 0 at the north end of the porch,
 * jail row 0 south of centre, curiosities the middle row, …).
 */
export const STREET_DOORS: readonly DoorSpec[] = [
  door("watson", "I7 E", "W", LOTS.watson.minX, 68.8, 1.3, 2.6, "Watson's Apothecary", { swing: -1 }),
  door("bolivar", "J7 E", "W", LOTS.bolivar.minX, 76.3, 1.25, 2.55, "Bolivar's Dry Goods", { swing: -1 }),
  door("saloon", "H7 W", "E", LOTS.saloon.maxX, 59, 1.35, 2.7, "Hard Drive Saloon"),
  door("saloonBack", "J4 E", "W", LOTS.saloonBackshed.minX, 70, 1.2, 2.45, "Saloon back door", { swing: -1 }),
  door("stage", "H7 E", "W", LOTS.stage.minX, 60.5, 1.3, 2.6, "Stagecoach office", { swing: -1 }),
  door("hotel", "E7 E", "W", LOTS.hotel.minX, 34.6, 1.9, 2.75, "Cactus Bed Hotel", { swing: -1, double: true }),
  door("doctor", "E7 W", "E", LOTS.doctor.maxX, 35.3, 1.25, 2.55, "Dr. Rodham"),
  door("bank", "F7 W", "E", LOTS.bank.maxX, 43.3, 1.35, 2.75, "Bank"),
  door("jail", "L7 W", "E", LOTS.jail.maxX, 93.6, 1.3, 2.55, "Sheriff", { swing: -1 }),
  door("curio", "L7 E", "W", LOTS.curio.minX, 92, 1.5, 2.6, "Curiosities", { double: true }),
  door("mission", "D7 N", "S", 52, LOTS.mission.maxZ, 3.4, 3.4, "Mission", { double: true }),
  door("rattler", "H4 W", "E", LOTS.rattler.maxX, 60.2, 1.2, 2.5, "The Rattler"),
  door("sidewinder", "G1 S", "N", 4, LOTS.sidewinder.minZ, 1.3, 2.55, "Sidewinder Undertaking", { swing: -1 }),
  door("livery", "F10 E", "W", LOTS.livery.minX, 43.7, 1.35, 2.6, "Livery", { swing: -1 }),
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
  /** Round-headed (mission school / hotel front). */
  arched?: boolean;
  /** Pane grid: columns × rows of muntins (default 2×2). */
  panes?: [number, number];
}

function win(
  side: Facing,
  at: number,
  w: number,
  bottom: number,
  top: number,
  opts: Partial<WindowSpec> = {},
): WindowSpec {
  return { side, at, w, bottom, top, ...opts };
}

export const WINDOWS: Partial<Record<LotName, readonly WindowSpec[]>> = {
  // saloon: two tall porch panes each side of the door on the H7 half,
  // the big I7/J7 panes, and the room + stairwell windows upstairs
  saloon: [
    win("E", 57.0, 0.9, 1.0, 2.9, { panes: [2, 3] }),
    win("E", 61.4, 1.4, 1.0, 2.9, { panes: [3, 3] }),
    win("E", 65.4, 2.4, 0.95, 2.9, { panes: [4, 3] }),
    win("E", 70.2, 2.4, 0.95, 2.9, { panes: [4, 3] }),
    ...[58.6, 63.3, 66.8, 70.2].map((z) => win("E", z, 1.05, 4.9, 6.4, { panes: [2, 3] })),
    win("E", 73.2, 1.0, 4.9, 6.4, { panes: [2, 3] }), // stairwell top
    win("N", 38.2, 1.0, 4.9, 6.4, { panes: [2, 3] }), // Ruby's room, on Neely
    win("W", 63.8, 0.9, 4.9, 6.2, { panes: [2, 2] }),
  ],
  hotel: [
    win("W", 39.2, 1.1, 1.2, 3.0, { arched: true, panes: [2, 3] }),
    win("W", 45.4, 1.1, 1.2, 3.0, { arched: true, panes: [2, 3] }),
    ...[34.6, 38.2, 41.8, 45.4].map((z) => win("W", z, 0.95, 4.5, 6.0, { panes: [2, 3] })),
    ...[59, 66].map((x) => win("S", x, 1.05, 1.3, 3.0, { arched: true, panes: [2, 3] })),
    ...[58.6, 62.2, 69.8].map((x) => win("S", x, 0.95, 4.5, 6.0, { panes: [2, 3] })),
  ],
  jail: [
    win("E", 90.2, 1.0, 1.15, 2.45, { bars: true }),
    win("W", 92.8, 0.9, 1.7, 2.6, { bars: true }), // the cell's blue window on the well yard
  ],
  bank: [win("E", 40.6, 1.1, 1.05, 2.65, { bars: true }), win("E", 46, 1.1, 1.05, 2.65, { bars: true })],
  watson: [win("W", 66.6, 1.0, 1.1, 2.6), win("W", 71, 1.0, 1.1, 2.6)],
  bolivar: [win("W", 74.1, 1.2, 1.1, 2.6, { panes: [2, 2] }), win("W", 78.5, 1.2, 1.1, 2.6, { panes: [2, 2] })],
  doctor: [win("E", 33.4, 1.05, 1.1, 2.55, { panes: [2, 3] }), win("E", 37.2, 0.85, 1.2, 2.5)],
  curio: [win("W", 89.6, 1.1, 1.15, 2.6, { panes: [2, 3] }), win("W", 94.4, 1.1, 1.15, 2.6, { panes: [2, 3] })],
  stage: [win("W", 57.9, 1.1, 1.05, 2.6, { panes: [2, 3] }), win("W", 63.2, 1.0, 1.05, 2.6, { panes: [2, 3] })],
  rattler: [win("E", 57.9, 1.9, 0.9, 2.7, { panes: [3, 3] })],
  sidewinder: [
    win("N", 2.0, 1.1, 1.05, 2.55),
    win("N", 6.1, 1.1, 1.05, 2.55),
    win("N", 4, 1.2, 2.78, 3.12, { panes: [3, 1] }), // transom over the door
  ],
  livery: [win("W", 40.8, 1.05, 1.1, 2.5), win("W", 46.4, 1.05, 1.1, 2.5)],
  mansion: [
    ...[59.5, 62, 71, 74].map((z) => win("W", z, 0.95, 1.15, 2.65, { panes: [2, 3] })),
    ...[59.5, 62, 66.6, 71, 74].map((z) => win("W", z, 0.95, 4.55, 6.05, { panes: [2, 3] })),
  ],
  school: [
    win("N", 48.5, 1.0, 1.6, 2.8, { arched: true, panes: [1, 1] }),
    win("N", 55.5, 1.0, 1.6, 2.8, { arched: true, panes: [1, 1] }),
  ],
  padre: [win("W", -1.5, 0.9, 1.7, 2.7, { arched: true, panes: [1, 1] })],
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

/** First match wins; underground, then interiors, then streets. */
export const LABEL_ZONES: readonly LabelZone[] = [
  zone("The sundial room", rect(40, 16, 64, 40), -8, -2),
  zone("Snake trial", rect(66, 22, 88, 34), -8, -2),
  zone("Thunderbird trial", rect(46, 38, 58, 60), -8, -2),
  zone("Flute room", rect(24, 21, 38, 35), -8, -2),
  zone("Under the mission", rect(44, 5, 60, 18), -8, -0.3),
  zone("The mine", rect(28, 2, 50, 23), -8, -2),
  upper("Hard Drive Saloon — upstairs", LOTS.saloon),
  zone("Hard Drive Saloon", rect(LOTS.saloonBackshed.minX, 56, LOTS.saloon.maxX, 80)),
  upper("Cactus Bed Hotel — upstairs", LOTS.hotel),
  zone("Cactus Bed Hotel", LOTS.hotel),
  upper("Mayor's mansion — upstairs", LOTS.mansion),
  zone("Mayor's mansion", LOTS.mansion),
  zone("Sheriff's office", LOTS.jail),
  zone("Curiosities", LOTS.curio),
  zone("Watson's Apothecary", LOTS.watson),
  zone("Bolivar's Dry Goods", rect(LOTS.bolivar.minX, 72.5, LOTS.bolivarAnnex.maxX, 80)),
  zone("Stagecoach office", LOTS.stage),
  zone("Diamondback Bank & Trust", LOTS.bank),
  zone("Dr. Rodham's parlour", rect(LOTS.doctorAnnex.minX, 32, LOTS.doctor.maxX, 38.5)),
  zone("Schoolhouse", LOTS.school),
  zone("Padre's room", LOTS.padre),
  zone("Mission courtyard", LOTS.mission),
  zone("The Rattler", rect(LOTS.rattler.minX, 55, 27, 62.5)),
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
export const LT = TILE;
