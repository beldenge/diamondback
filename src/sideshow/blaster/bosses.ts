/**
 * The boss roster.
 *
 * The extracted pose sets are wildly uneven, and each boss is designed
 * around what it actually has on disk rather than around what it lacks.
 * A cow with no walk cycle is a stationary siege engine; a horse with
 * nothing but idles just stands there. Do not animate around the gap —
 * the constraint is funnier than the workaround, and it is accurate.
 */

export type BossId =
  | "chicken"
  | "pig"
  | "cow"
  | "horse"
  | "bounty"
  | "robot"
  | "leroy"
  | "kid"
  | "skeleton"
  | "shaman";

export type BossBehaviour =
  /** Ambles toward the camera. */
  | "walk"
  /** Ambles faster. The one boss that really closes distance. */
  | "charge"
  /** Cannot walk. Lies down, then stands up at you. */
  | "siege"
  /** Cannot do anything. Stands there. */
  | "idle"
  /** Walks, stops for a swig, walks again. */
  | "drunk";

export interface BossSpec {
  id: BossId;
  label: string;
  /** Card line under the title when the boss arrives. */
  taunt: string;
  /** Extract cast folder. */
  cast: string;
  /** Key inside that folder's `sprites.json`. */
  actor: string;
  behaviour: BossBehaviour;
  /** Pose cycle. Every name here must exist in the sheet. */
  poses: string[];
  /** Frames each pose is held, index-matched to `poses`. */
  hold: number[];
  /**
   * World units per second — a tile is 256. Zero for the ones that cannot
   * move at all, which is a design choice about their sheets, not a
   * placeholder: see the roster.
   *
   * These match the flock's own pace. A boss that ambles while the birds
   * around it sprint reads as scenery.
   */
  speed: number;
  /**
   * What it makes when you hit it. A `SND/` subfolder plus a basename, or
   * a full extract path for clips that live elsewhere.
   *
   * The animals get the shooting gallery's own per-species impacts. The
   * people get a **voice** — a hit that goes "thump" on a man reads as
   * hitting scenery. Every cry here is that character's own recording.
   */
  hitSound: { folder: string; name: string };
  /**
   * One line, played once when the boss walks in. Bosses do not otherwise
   * talk — a boss that barks every few seconds wears out fast.
   */
  arrivalLine?: { folder: string; name: string };
  /**
   * Where the sheet hangs the sprite relative to its hotspot.
   *
   * Almost every CST actor is drawn standing *above* the hotspot with its
   * feet near it, which is what the engine's projection assumes. The range
   * dummy is not: `dummytarg` is boxed at y=168 with h=156, so it hangs
   * 132px *below* its hotspot — because the hotspot is the point it rises
   * from behind the counter (`robotup` / `robotdown`), not its feet.
   *
   * Left alone it renders below the street and the depth test eats all but
   * a sliver. `"bottom"` re-anchors the sprite so its base sits on the
   * projected point instead.
   */
  anchor?: "hotspot" | "bottom";
}

export const BOSSES: Record<BossId, BossSpec> = {
  chicken: {
    id: "chicken",
    label: "The Big Bird",
    taunt: "It has come for its own.",
    cast: "_EXTRA",
    actor: "chicken1",
    behaviour: "walk",
    poses: ["walk", "peck", "walk"],
    hold: [40, 22, 40],
    speed: 92,
    hitSound: { folder: "_TARGET", name: "chickenhit" },
    // Quist, every time the Big Bird walks in. The extract's own
    // identifier for the clip is literally `scaring chickens`, and it is
    // the line the whole mode is named after.
    arrivalLine: { folder: "PUP/_QUIST/AUDIO", name: "scaring chickens" },
  },
  pig: {
    id: "pig",
    label: "The Hog",
    taunt: "Six hundred pounds and unhappy.",
    cast: "_EXTRA",
    actor: "pig",
    behaviour: "charge",
    poses: ["walk", "grunt"],
    hold: [46, 18],
    speed: 140,
    hitSound: { folder: "_TARGET", name: "pighit" },
  },
  cow: {
    id: "cow",
    label: "The Cow",
    // It has `down` and `up` and nothing else. So it is a siege engine.
    taunt: "It cannot chase you. It does not need to.",
    cast: "_EXTRA",
    actor: "cow",
    behaviour: "siege",
    poses: ["down", "up"],
    hold: [34, 34],
    speed: 0,
    hitSound: { folder: "_TARGET", name: "goathit" },
  },
  horse: {
    id: "horse",
    label: "The Horse",
    // head / stand / tail. No walk anywhere in the sheet.
    taunt: "It is not going to do anything.",
    cast: "_EXTRA",
    actor: "horse1",
    behaviour: "idle",
    poses: ["stand", "tail", "head", "tail"],
    hold: [30, 20, 20, 20],
    speed: 0,
    hitSound: { folder: "_TARGET", name: "hit2" },
  },
  leroy: {
    id: "leroy",
    label: "Leroy",
    taunt: "He has been drinking since Tuesday.",
    cast: "_GANG",
    actor: "Leroy",
    behaviour: "drunk",
    // The 32-frame swig is really in the extract. It is not invented.
    poses: ["walk", "drink", "walk", "stand"],
    hold: [50, 46, 50, 20],
    speed: 108,
    // `PUP/_FEAR/AUDIO/texts.csv` transcribes `fear.83b` as
    // "*leroy screaming" — his own scream, already in the extract.
    hitSound: { folder: "PUP/_FEAR/AUDIO", name: "fear.83b" },
    // `PUP/_LEROY/AUDIO/texts.csv` line 1: "This thing's empty. I'm gonna
    // whip your damn ass!" — his own recorded line, once, on arrival.
    arrivalLine: { folder: "PUP/_LEROY/AUDIO", name: "leroy.1" },
  },
  shaman: {
    id: "shaman",
    label: "The Yunni Shaman",
    taunt: "The desert sent something back.",
    cast: "_EXTRA",
    // `CST/_EXTRA/shaman` — stand and walk. The only Yunni figure in the
    // extract with a walk cycle, so he is the one who can come at you.
    actor: "shaman",
    behaviour: "walk",
    poses: ["walk", "stand", "walk"],
    hold: [44, 16, 44],
    speed: 124,
    // `deadn.3` is "Aagghh!" at 0.79s — short enough to take repeatedly.
    hitSound: { folder: "PUP/_DEAD/AUDIO", name: "deadn.3" },
    // The voice from under the mission, where the Yunni caves start.
    arrivalLine: { folder: "_MISSION", name: "spirit" },
  },
  bounty: {
    id: "bounty",
    label: "The Bounty Hunter",
    taunt: "There is paper on you.",
    // `CST/_EXTRA/bounty1` is the richest sheet in the extract: a 64-frame
    // `lowwalk` in eight directions plus cock, fire, die and dead. It
    // replaced a giant gila monster, which was a 31px sprite with two
    // authored facings and read as a blur at boss scale — blowing a sprite
    // up does not add detail that was never there.
    cast: "_EXTRA",
    actor: "bounty1",
    behaviour: "walk",
    poses: ["lowwalk", "standcock", "standfire"],
    hold: [52, 16, 18],
    speed: 132,
    hitSound: { folder: "PUP/_DEAD/AUDIO", name: "deadn.3" },
  },
  robot: {
    id: "robot",
    label: "The Automaton",
    taunt: "Skiz Sheraton's pride and joy.",
    // `CST/_TARGET/dummytarg` — the range's mechanical gunfighter, with
    // `robotup`/`robotdown` to raise and drop it. No walk cycle anywhere,
    // so it holds the street and works the gun instead: spin, twitch,
    // hat flip, head spin.
    cast: "_TARGET",
    actor: "dummytarg",
    behaviour: "idle",
    poses: ["gunspin", "twitch", "headspin", "hatflip"],
    hold: [40, 18, 22, 20],
    speed: 0,
    hitSound: { folder: "_TARGET", name: "targethit1" },
    // Mechanical, not a voice: the sound of the thing standing up.
    arrivalLine: { folder: "_TARGET", name: "robotup" },
    anchor: "bottom",
  },
  kid: {
    id: "kid",
    label: "The Kid",
    taunt: "Everyone is afraid of the Kid.",
    // `CST/_EXTRA/Kid` — a full 64-frame walk in eight directions.
    cast: "_EXTRA",
    actor: "Kid",
    behaviour: "walk",
    poses: ["walk", "stand", "walk"],
    hold: [48, 16, 48],
    speed: 132,
    // `kid.25` is transcribed "Aaagh!".
    hitSound: { folder: "PUP/_KID/AUDIO", name: "kid.25" },
    // `PUP/_KID/AUDIO/texts.csv` line 2: "You're pathetic!" — his own
    // recorded snark, and the shortest of the good ones at 2.2s.
    arrivalLine: { folder: "PUP/_KID/AUDIO", name: "kid.2" },
  },
  skeleton: {
    id: "skeleton",
    label: "The Skeleton",
    taunt: "The mine kept one.",
    // `CST/_MINE/skeleton` — stand (8) and a full 64-frame walk. It is one
    // of the underground payoffs, so it belongs to the same thread as the
    // shaman rather than the farmyard.
    cast: "_MINE",
    actor: "skeleton",
    behaviour: "walk",
    poses: ["walk", "stand", "walk"],
    hold: [46, 14, 46],
    speed: 116,
    // Bones. A throat would be odd.
    hitSound: { folder: "_TARGET", name: "hit2" },
  },
};

/**
 * Cycle order. **Ten deep**, so ten waves pass before anything repeats.
 *
 * The lap has a shape: the farmyard first (1–4), Leroy at 5, the shooting
 * gallery's oddities next (6–7), then down into the Yunni underground
 * (8–9), and the Kid last. Three of them have a recorded line.
 */
export const BOSS_ORDER: BossId[] = [
  "chicken",
  "pig",
  "cow",
  "horse",
  "leroy",
  "bounty",
  "robot",
  "skeleton",
  "shaman",
  "kid",
];

/**
 * Is this pose one the boss covers ground on?
 *
 * Sheets do not agree on the name: most casts call it `walk`, but the
 * bounty hunter's is `lowwalk` (a crouched advance). Matching on the
 * substring keeps a boss from moonwalking — standing in place while its
 * legs cycle — the moment a new sheet uses its own spelling.
 */
export function isWalkPose(pose: string): boolean {
  return pose.toLowerCase().includes("walk");
}

/** Pose for a boss `frames` into its cycle. */
export function bossPoseAt(spec: BossSpec, frames: number): string {
  const total = spec.hold.reduce((sum, n) => sum + Math.max(1, n), 0);
  let at = ((Math.trunc(frames) % total) + total) % total;
  for (let i = 0; i < spec.poses.length; i += 1) {
    const hold = Math.max(1, spec.hold[i] ?? 1);
    if (at < hold) {
      return spec.poses[i]!;
    }
    at -= hold;
  }
  return spec.poses[0]!;
}
