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
  // --- Main Street, west side (the street tile is x 48..56) ---
  /** `_SALLOWER` 3×6 @2.84 + the bar strip. Film H7 W / I7 W / K7 N: wall at x 45.5, the porch to 48.4, the south corner at 77.5. */
  saloon: rect(34.7, 55.8, 45.5, 77.5),
  /** Backlot passage on the west lane; the J4 E back door is its west face. */
  saloonBackshed: rect(32, 55.8, 34.7, 77),
  /** The saloon's one-storey south wing on Day, its bills facing the street (K5 N). */
  /** `_BANK` 1×3 @3.54 lobby on the street. Film F7 W: face on the line, z 40..48. */
  bank: rect(32.7, 40, 48, 48),
  /** `_DOCTOR1` + `_DOCTOR2`. Film E7 W: face on the line, z 32.2..39.8. */
  doctor: rect(38, 32.2, 48, 39.8),
  /** The dark "GRANT" annex whose lane face is the E4 E still. */
  doctorAnnex: rect(32.5, 32.2, 38, 39.8),
  /** `_JAIL` 2×2 @3.54. Film L7 W / K6 S / L5 E: 7.7 × 7.4 m, face on the line. */
  jail: rect(40.3, 88, 48, 95.4),

  // --- Main Street, east side: film faces sit ~1.5 m behind the street line, porches in between ---
  /** `_STAGE` 1×3 @3.3. Film H7 E: wall at 57.4, posts at 56.3. */
  stage: rect(57.4, 56, 63.4, 63.6),
  /** Set 4 m back from Neely with a loading dock in front (G9 S). */
  stageWarehouse: rect(63.4, 60, 72, 63.6),
  /** `_APOTH` 3×1 @3.54. Film I7 E: wall at 57.6, boardwalk from 55.9. */
  watson: rect(57.6, 63.6, 67, 72.3),
  /** `_STORE` 2×1 @3.1. Film J7 E: wall at 57.0, log posts at 56.3. */
  bolivar: rect(57.0, 72.3, 66, 80.3),
  /** The grey one-storey house on Lee's west side (I10 W / G10 S). */
  whiteHouse: rect(67, 63.6, 72, 71.5),
  /** `_CHIN` 2×3 @2.16. Film L7 E: wall at 58.2, red posts at 56.5. */
  curio: rect(58.2, 88, 64, 96),
  /** The tall dark barn hard against Curiosities' east wall (K8 S / K9 S). */
  rangeBarn: rect(64, 88.5, 67.2, 96),
  /** `_HOTLOWER` 4×3 @3.8 + `_HOTUPPER`. Film E7 E / F7 E: wall at 57.6, boardwalk from 55.7. */
  hotel: rect(57.6, 32, 72, 46.9),

  // --- Mission compound (fills the north view; the patio inside). Film D7 N / E7 N: front wall at z 22.7,
  // the west wing steps 1.4 m forward (D6 N / D5 N) and the compound's SW corner is at x 30 (E4 N / D4 N) ---
  mission: rect(30, -6, 66, 22.7),
  /** `_SCHOOL` 2×1 @4.3 across the north side of the patio; its arched windows are in the compound's north wall. */
  school: rect(44.5, -6, 59.5, 2.5),
  /** `_PADRE` 1×2 @4.3 under the bell tower, west of the school, its window on the compound's west wall. */
  padre: rect(30, -6, 44.5, 2.5),

  // --- Neely west ---
  /** `_UNDERTAK` one tile @2.25 + the barber corner: a 7 m storefront. */
  sidewinder: rect(0.5, 56, 7.5, 65),
  /** `_PAPER` 1×2 @1.9 front office + the press room behind. */
  /** Film G3 S / G2 S: the north face runs 11 m along Neely, a porch wraps its east end (G4 S). */
  rattler: rect(12.8, 56.4, 21.6, 63.6),
  /** Shady Acres, a fenced yard you can enter: 46 m deep (E3 W / D4 W / G1 N). */
  cemetery: rect(-24, 24.7, 22.5, 47.5),

  // --- East: Lee street (col 10, world 72..80) stays open D10..K10 ---
  /** `_LIVERY` 1×2 @3.1 office at the street door; stalls behind. */
  livery: rect(80, 33.6, 92, 48),
  mayorFence: rect(80, 56, 101, 80),
  /** `_MAYHALL` hall between `_MAYSTUDY` (north) and `_MAYDINE` (south). Film I10 E / J10 E: the door bay at z 67.9. */
  mansion: rect(86, 60, 100, 75.5),

  // --- Farm south-west (the pale wall east of the well IS the jail) ---
  wheelwright: rect(10.2, 72, 17, 80),
  whiteStable: rect(0, 80.5, 8, 86.3),
  grayBarn: rect(3.8, 87.3, 15.5, 96.3),
  farmhouse: rect(24.3, 88, 31.8, 96.5),
  rockCityShed: rect(11.2, 64, 16, 68),

  // --- North-east farm (clear of the mission footprint + Mission St) ---
  neBarn: rect(80, 22.8, 90, 33.2),
  redStable: rect(66.3, 8, 72.5, 15),
} as const;

export type LotName = keyof typeof LOTS;

/**
 * Gate geometry (film O7 N / N7 S / M7 S): posts 8 m apart just south
 * of the N7/O7 line, each a rough post with fore-and-aft braces, a
 * crossbeam at 5.4 m and the small DIAMONDBACK board hung under it.
 */
export const GATE = {
  z: 111.6,
  westPostX: 48.1,
  eastPostX: 56.1,
  beamY: 5.4,
  signTop: 5.05,
  signBottom: 4.3,
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
export const PATIO = rect(41.5, 2.5, 62.5, 22.2);

/**
 * The gate-yard fence east of Main (film N7 E / O8 N / M7 E): 2.6 m of
 * uneven grey boards, not a palisade. It runs north from the gate's
 * east post to Curiosities' corner and east along the gate line.
 */
export const FENCE = {
  x: 56.3,
  zNorth: 96.8,
  zSouth: GATE.z,
  height: 2.35,
  eastEndX: 72.5,
};

/** The old name, kept for callers; the palisade is the FENCE. */
export const PALISADE = FENCE;

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
  door("watson", "I7 E", "W", LOTS.watson.minX, 67.8, 1.45, 2.75, "Watson's Apothecary", { swing: -1 }),
  door("bolivar", "J7 E", "W", LOTS.bolivar.minX, 75.9, 1.35, 2.7, "Bolivar's Dry Goods", { swing: -1 }),
  door("saloon", "H7 W", "E", LOTS.saloon.maxX, 59.55, 1.5, 3.05, "Hard Drive Saloon"),
  door("saloonBack", "J4 E", "W", LOTS.saloonBackshed.minX, 72.0, 1.85, 2.9, "Saloon back door", { swing: -1 }),
  door("stage", "H7 E", "W", LOTS.stage.minX, 59.95, 1.15, 2.8, "Stagecoach office", { swing: -1 }),
  door("hotel", "E7 E", "W", LOTS.hotel.minX, 35.9, 2.35, 2.75, "Cactus Bed Hotel", { swing: -1, double: true }),
  door("doctor", "E7 W", "E", LOTS.doctor.maxX, 36.0, 1.45, 2.85, "Dr. Rodham"),
  door("bank", "F7 W", "E", LOTS.bank.maxX, 44.1, 1.8, 3.0, "Bank"),
  door("jail", "L7 W", "E", LOTS.jail.maxX, 93.65, 1.75, 2.95, "Sheriff", { swing: -1 }),
  door("curio", "L7 E", "W", LOTS.curio.minX, 91.85, 1.9, 3.2, "Curiosities", { double: true }),
  door("mission", "D7 N", "S", 52, LOTS.mission.maxZ, 4.0, 4.4, "Mission", { double: true }),
  door("rattler", "H4 W", "E", LOTS.rattler.maxX, 60.27, 1.3, 2.45, "The Rattler"),
  door("sidewinder", "G1 S", "N", 4.1, LOTS.sidewinder.minZ, 1.55, 2.9, "Sidewinder Undertaking", { swing: -1, glazed: true, double: true }),
  door("livery", "F10 E", "W", LOTS.livery.minX, 43.9, 1.65, 2.9, "Livery", { swing: -1 }),
  door("mayor", "I10 E", "W", 80, 67.9, 3.1, 3.0, "Mayor's gate", { double: true, gate: true }),
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
  /** Glows at night (the saloon's and hotel's ground-floor street panes, _NITE). */
  lit?: boolean;
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
  // saloon (film H7 W / I7 W): two big 3×3 panes south of the door on
  // the ground floor, small panes on the upper storey, Ruby's on Neely
  saloon: [
    win("E", 63.9, 3.7, 0.8, 2.95, { panes: [3, 3], lit: true }),
    win("E", 71.3, 3.9, 0.8, 2.95, { panes: [3, 3], lit: true }),
    ...[58.6, 63.3, 67.5, 71.6, 75.3].map((z) => win("E", z, 0.9, 5.9, 7.2, { panes: [2, 3] })),
    win("N", 38.2, 1.0, 5.1, 6.4, { panes: [2, 3] }), // Ruby's room, on Neely
    win("W", 63.8, 0.9, 5.1, 6.3, { panes: [2, 2] }),
  ],
  // hotel (film E7 E / F7 E): tall arched panes each side of the door
  hotel: [
    win("W", 33.5, 1.3, 0.65, 3.0, { arched: true, panes: [2, 3] }), // dark in _NITE E7 E
    win("W", 39.1, 1.3, 0.65, 3.0, { arched: true, panes: [2, 3], lit: true }),
    win("W", 43.2, 1.3, 0.65, 3.0, { arched: true, panes: [2, 3], lit: true }),
    ...[34.0, 38.2, 42.0, 45.8].map((z) => win("W", z, 0.95, 5.4, 7.2, { panes: [2, 3] })),
    ...[60.1, 68.9].map((x) => win("S", x, 1.2, 0.7, 3.0, { arched: true, panes: [2, 3] })),
    ...[64.6, 68.9].map((x) => win("S", x, 1.0, 5.9, 8.0, { arched: true, panes: [2, 3] })),
  ],
  // jail (film L7 W): one tall barred pane north of the sign
  jail: [
    win("E", 89.8, 0.9, 0.85, 2.7, { bars: true, panes: [2, 3] }),
    win("W", 92.8, 0.9, 1.7, 2.6, { bars: true }), // the cell's blue window on the well yard
  ],
  // bank (film F7 W): two barred panes flanking the door
  bank: [win("E", 46.5, 1.0, 0.8, 2.7, { bars: true, panes: [1, 3] }), win("E", 41.7, 1.0, 0.8, 2.7, { bars: true, panes: [1, 3] })],
  // Watson's (film I7 E): tall 2×3 panes either side of the door
  watson: [win("W", 65.5, 1.15, 0.45, 2.72, { panes: [2, 3] }), win("W", 71.0, 1.15, 0.45, 2.72, { panes: [2, 3] })],
  // doctor (film E7 W): 2×3 panes, the north one a shade wider
  doctor: [win("E", 38.27, 1.2, 1.08, 2.87, { panes: [2, 3] }), win("E", 33.6, 1.1, 1.08, 2.87, { panes: [2, 3] })],
  // Curiosities (film L7 E): narrow red-framed lattices
  curio: [win("W", 89.2, 0.55, 0.7, 2.8, { panes: [2, 4] }), win("W", 94.4, 0.55, 0.7, 2.8, { panes: [2, 4] })],
  // stage office (film H7 E)
  stage: [win("W", 58.2, 1.0, 1.15, 2.78, { panes: [2, 3] }), win("W", 62.0, 1.0, 1.15, 2.78, { panes: [2, 3] })],
  rattler: [win("E", 58.3, 2.2, 0.69, 3.56, { panes: [2, 3] }), win("E", 62.06, 1.86, 0.69, 3.56, { panes: [2, 3] })],
  // Sidewinder (film G1 S): two 2×2 panes flanking a glazed double door
  sidewinder: [win("N", 6.4, 1.35, 0.65, 2.9, { panes: [2, 2] }), win("N", 1.7, 1.35, 0.65, 2.9, { panes: [2, 2] })],
  livery: [win("W", 41.4, 1.05, 1.3, 2.75), win("W", 46.3, 1.05, 1.3, 2.75)],
  // mansion (film I10 E / J10 E): shuttered sashes flanking the door bay
  mansion: [
    ...[65.6, 70.3].map((z) => win("W", z, 0.95, 0.8, 2.4, { panes: [2, 3] })),
    ...[62.5, 65.6, 70.3, 73.2].map((z) => win("W", z, 0.95, 4.5, 5.9, { panes: [2, 3] })),
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
  zone("Hard Drive Saloon", rect(LOTS.saloonBackshed.minX, 55.8, LOTS.saloon.maxX, 80)),
  upper("Cactus Bed Hotel — upstairs", LOTS.hotel),
  zone("Cactus Bed Hotel", LOTS.hotel),
  upper("Mayor's mansion — upstairs", LOTS.mansion),
  zone("Mayor's mansion", LOTS.mansion),
  zone("Sheriff's office", LOTS.jail),
  zone("Curiosities", LOTS.curio),
  zone("Watson's Apothecary", LOTS.watson),
  zone("Bolivar's Dry Goods", rect(LOTS.bolivar.minX, 72.5, 72, 80)),
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
  zone("Mission Street", rect(60, 22, 82, 24), -2, 30),
  zone("Mission Street", rect(60, 22, 82, 24), -2, 30),
  zone("Mission Street", rect(60, 22, 82, 24), -2, 30),
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
