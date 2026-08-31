import type { Expr, Proc, Stmt } from "../vm/ast";
import { isClockSlot, isNight, type ClockSlot } from "../core/time";
import { scriptSceneName } from "./sceneName";

/** World actors Unlocked keeps so minigames have an opponent. */
export const SANDBOX_ACTORS = new Set(["leroy", "bolivar", "dell", "kid"]);

/** Street shootout extras. Hidden until a top-bar spawn or `openfight`. */
const SANDBOX_FIGHT_ACTOR = /^(bounty|kidgang)\d+$/;

export type SandboxFightKind = "bounty" | "gang";

export type SandboxToyKind = "kid" | "dell" | "bounty" | "gang";

/** Click-to-start stand-ins. Top-bar icons spawn these in the current view. */
export const SANDBOX_FIGHT_SCOUTS: ReadonlyArray<{
  name: string;
  fight: SandboxFightKind;
}> = [
  { name: "bounty1", fight: "bounty" },
  { name: "kidgang1", fight: "gang" },
];

/** Unlocked top-bar portraits. Click spawns the actor; world click still starts play. */
export const SANDBOX_TOYS: ReadonlyArray<{
  kind: SandboxToyKind;
  actor: string;
  label: string;
  portrait: string;
}> = [
  {
    kind: "kid",
    actor: "kid",
    label: "The Kid",
    portrait: "CST/_EXTRA/Kid/stand/frame_268.png",
  },
  {
    kind: "dell",
    actor: "dell",
    label: "Dell",
    portrait: "CST/_GANG/Dell/stand/frame_896.png",
  },
  {
    kind: "bounty",
    actor: "bounty1",
    label: "Bounty hunters",
    portrait: "CST/_EXTRA/bounty1/stand/frame_288.png",
  },
  {
    kind: "gang",
    actor: "kidgang1",
    label: "The Kid's gang",
    portrait: "CST/_EXTRA/kidgang1/stand/frame_451.png",
  },
];

const TOWN_SPAN = 15;

/** Look-deg 0=E, 64=S, 128=W, 192=N. Actor faces the camera (`look + 128`). */
const FACE_STEP: Record<string, { dx: number; dy: number; look: number }> = {
  N: { dx: 0, dy: -1, look: 192 },
  S: { dx: 0, dy: 1, look: 64 },
  E: { dx: 1, dy: 0, look: 0 },
  W: { dx: -1, dy: 0, look: 128 },
};

/**
 * Park the toy on the tile the still is looking at, facing the lens.
 * Off the 15×15 grid (south gate looking south) stays on the camera tile.
 */
export function sandboxToyLookPose(pose: {
  x: number;
  y: number;
  facing: string;
}): { scene: string; deg: number } {
  const face = FACE_STEP[pose.facing] ?? FACE_STEP.N;
  let x = pose.x + face.dx;
  let y = pose.y + face.dy;
  if (x < 0 || x >= TOWN_SPAN || y < 0 || y >= TOWN_SPAN) {
    x = pose.x;
    y = pose.y;
  }
  return {
    scene: scriptSceneName(x, y),
    deg: (face.look + 128) % 256,
  };
}

export function sandboxToyKind(value: unknown): SandboxToyKind | undefined {
  const key = String(value ?? "").trim().toLowerCase();
  return SANDBOX_TOYS.some((row) => row.kind === key) ? (key as SandboxToyKind) : undefined;
}

export function sandboxStreetToy(name: string): boolean {
  const key = name.toLowerCase();
  return key === "dell" || key === "kid" || sandboxFightActor(key);
}

/** Hub shaman + mine skeleton. Story extras stay hidden. */
export const SANDBOX_CAVE_ACTORS = new Set(["skeleton", "shaman"]);

const SANDBOX_UNDERGROUND_SET = /^(hub|mine|flute|snake|tbird)$/;

/** Town livestock Unlocked keeps. Not the dog (lunge movie / Help beat). */
const SANDBOX_FARM_ACTOR = /^(pig|cow|chicken|bird|horse)\d*$/;

/**
 * EXTRA `initactors` only puts the pig out at `clock = 3`. Unlocked is
 * afternoon by default, so settle has to `setupactor("town")` itself.
 * Chickens / birds are day-only in extract (`clock < 3`); seed them at
 * night so `N` does not empty the street.
 */
export const SANDBOX_TOWN_ANIMAL_SETUPS: ReadonlyArray<{ name: string; where: string }> = [
  { name: "pig", where: "town" },
  { name: "cow", where: "pen" },
  { name: "chicken1", where: "chick" },
  { name: "chicken2", where: "chick" },
  { name: "chicken3", where: "chick" },
  { name: "bird1", where: "sky" },
  { name: "horse1", where: "street" },
  { name: "horse2", where: "street" },
  { name: "horse3", where: "street" },
];

/**
 * TARGET `initactors` places the range chicken on day 2 and the pig on
 * day 2|3. Unlocked stays on `day = 1`. Crows start hidden; original
 * `initbird` waits until all three cans are hit. Unlocked seeds them
 * on-camera (`birdstar1` is off the still while `pausewalk` is on).
 * `z` is world height so they sit in the sky (waypoints are z=0).
 */
export const SANDBOX_RANGE_ANIMAL_SEEDS: ReadonlyArray<{
  name: string;
  star: string;
  speed: number;
  pose: string;
  z?: number;
}> = [
  { name: "chicken1targ", star: "chickenstar1", speed: 8, pose: "walk" },
  { name: "pigtarg", star: "pigstar2", speed: 2, pose: "walk" },
  { name: "birdtarg", star: "birdstar2", speed: 6, pose: "flight", z: 180 },
  { name: "birdtarg2", star: "birdstar4", speed: 6, pose: "flight", z: 180 },
  { name: "birdtarg3", star: "birdstar5", speed: 6, pose: "flight", z: 180 },
];

/**
 * Story phases that steal ↑ until the talk is "done." Hiding the actor is
 * not enough — sallower D5 / mayhall C3 `exitcode` before the stair walk.
 * These are Dust's own completion values, not remake gates.
 */
export const SANDBOX_STORY_FLAGS: Readonly<Record<string, number>> = {
  oonaphase: 3,
  mwifephase: 1,
};

/**
 * Story `initprops` only `addinven`s these on later days. Unlocked stays
 * on `day = 1`, so grant them at boot. Cave tools first; every satchel
 * reader (`history` / `pages` / `yunnibook`) after that. `yunnibook`
 * last so it is the held HUD item (EXAMINE opens `yunni.flt`). No gun —
 * Leroy still loans that at the range. `tstone` is not needed: Unlocked
 * fakes the fountain. Postcards stay in the mayor's study. Mrs Mayor's
 * diary is a mayroom hotspot, not INVEN.
 */
export const SANDBOX_INVEN_SEEDS: readonly string[] = [
  "mask",
  "flute",
  "blade",
  "tbird",
  "history",
  "pages",
  "yunnibook",
];

/**
 * Yunni / history / pages `moveyoself` has no `day = 1` branch (`error()`).
 * Day 4 is the extracted board that places those plus flute / blade /
 * tbird / mask. Do not set story `day = 4` — only the avatar-flat layout
 * uses this.
 */
export const SANDBOX_INVEN_LAYOUT_DAY = 4;

export function sandboxInventoryToSeed(
  props: Iterable<{ name: string; owner: string }>,
): string[] {
  const owned = new Set<string>();
  for (const prop of props) {
    if (prop.owner.toLowerCase() === "stranger") {
      owned.add(prop.name.toLowerCase());
    }
  }
  return SANDBOX_INVEN_SEEDS.filter((name) => !owned.has(name));
}

export function applySandboxStoryFlags(
  globals: { set(name: string, value: number): void },
  globalNames: { add(name: string): void },
): void {
  for (const [name, value] of Object.entries(SANDBOX_STORY_FLAGS)) {
    globals.set(name, value);
    globalNames.add(name);
  }
}

export function sandboxFightActor(name: string): boolean {
  return SANDBOX_FIGHT_ACTOR.test(name.toLowerCase());
}

export function sandboxFightScout(name: string): boolean {
  const key = name.toLowerCase();
  return SANDBOX_FIGHT_SCOUTS.some((row) => row.name === key);
}

export function sandboxFightKindOf(name: string): SandboxFightKind | undefined {
  const key = name.toLowerCase();
  return SANDBOX_FIGHT_SCOUTS.find((row) => row.name === key)?.fight;
}

export function sandboxFightKind(value: unknown): SandboxFightKind | undefined {
  const key = String(value ?? "").trim().toLowerCase();
  return key === "bounty" || key === "gang" ? key : undefined;
}

export function sandboxFightFromSearch(search: string): SandboxFightKind | undefined {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return sandboxFightKind(new URLSearchParams(query).get("fight"));
}

export function sandboxKeepActor(actor: { name: string; cast: string }): boolean {
  const name = actor.name.toLowerCase();
  const cast = actor.cast.toLowerCase();
  if (name === "dog") {
    return false;
  }
  if (cast === "target" || name.endsWith("targ")) {
    return true;
  }
  if (SANDBOX_CAVE_ACTORS.has(name)) {
    return true;
  }
  if (SANDBOX_FARM_ACTOR.test(name)) {
    return true;
  }
  if (sandboxFightActor(name)) {
    return true;
  }
  return SANDBOX_ACTORS.has(name);
}

/** Dell / Kid / bounty / gang stay off the street until a top-bar spawn. */
export function hideSandboxIdleFighters(
  actors: Iterable<{
    name: string;
    visible: boolean;
    walking: boolean;
    turning: boolean;
    route: unknown[];
  }>,
  fighton: boolean,
  spawned: { has(name: string): boolean } = new Set(),
): string[] {
  if (fighton) {
    return [];
  }
  const hidden: string[] = [];
  for (const actor of actors) {
    const key = actor.name.toLowerCase();
    if (!sandboxStreetToy(key) || spawned.has(key)) {
      continue;
    }
    if (actor.visible || actor.walking || actor.turning) {
      hidden.push(actor.name);
    }
    actor.visible = false;
    actor.walking = false;
    actor.turning = false;
    actor.route = [];
  }
  return hidden;
}

function visibleActorNames(actors: Iterable<{ name: string; visible: boolean }>): Set<string> {
  const names = new Set<string>();
  for (const actor of actors) {
    if (actor.visible) {
      names.add(actor.name.toLowerCase());
    }
  }
  return names;
}

export function sandboxTownAnimalsToSeed(
  set: string,
  actors: Iterable<{ name: string; visible: boolean }>,
): Array<{ name: string; where: string }> {
  if (set !== "town") {
    return [];
  }
  const seen = visibleActorNames(actors);
  return SANDBOX_TOWN_ANIMAL_SETUPS.filter((row) => !seen.has(row.name));
}

export function sandboxRangeAnimalsToSeed(
  set: string,
  actors: Iterable<{ name: string; visible: boolean }>,
): Array<(typeof SANDBOX_RANGE_ANIMAL_SEEDS)[number]> {
  if (set !== "target") {
    return [];
  }
  const seen = visibleActorNames(actors);
  return SANDBOX_RANGE_ANIMAL_SEEDS.filter((row) => !seen.has(row.name));
}

/**
 * Ground pickups are INVEN `small` (jug, bone, flowers, …). HOUSE doors,
 * saloon tables, tumbleweeds, the held HUD item, and hub/cave INVEN
 * (chest, mask) stay.
 */
export function sandboxKeepWorldProp(
  prop: { name: string; shop: string; view: string; set?: string },
  handitem: string,
): boolean {
  const name = prop.name.toLowerCase();
  const held = handitem.toLowerCase();
  if (name === held || name === "gunhand" || name === "helpbut") {
    return true;
  }
  if (SANDBOX_UNDERGROUND_SET.test((prop.set ?? "").toLowerCase())) {
    return true;
  }
  return !(prop.shop.toLowerCase() === "inven" && prop.view.toLowerCase() === "small");
}

export function sandboxIsMineSet(set: string): boolean {
  return set.replace(/\.set$/i, "").toLowerCase() === "mine";
}

/**
 * Skeleton `initxyz` only chases when `handitem = "mask"`. Unlocked
 * `addinven`s the mask at boot, but the player may be holding the book.
 * Set `handitem` *before* mine `openset`.
 */
export function sandboxEquipMineMask(
  set: string,
  globals: { set(name: string, value: string | number): void },
  globalNames?: { add(name: string): void },
): boolean {
  if (!sandboxIsMineSet(set)) {
    return false;
  }
  globals.set("handitem", "mask");
  globalNames?.add("handitem");
  return true;
}

/**
 * Mine `openset` assigns the mask (`eyes`) but never `propvisible`.
 * Show the compass HUD overlay. Equip `handitem` first so the skeleton
 * chase runs.
 */
export function sandboxShowMineMask(set: string, mask: { view: string; visible: boolean; screen: boolean; x: number; y: number; owner: string }): boolean {
  if (!sandboxIsMineSet(set)) {
    return false;
  }
  mask.owner = "stranger";
  mask.view = "eyes";
  mask.visible = true;
  mask.screen = true;
  if (mask.x === 0 && mask.y === 0) {
    mask.x = 256;
    mask.y = 132;
  }
  return true;
}

export function hideSandboxGroundPickups(
  props: Iterable<{
    name: string;
    shop: string;
    view: string;
    set?: string;
    visible: boolean;
  }>,
  handitem: string,
): string[] {
  const hidden: string[] = [];
  for (const prop of props) {
    if (sandboxKeepWorldProp(prop, handitem)) {
      continue;
    }
    if (prop.visible) {
      hidden.push(prop.name);
    }
    prop.visible = false;
  }
  return hidden;
}

/**
 * Unlocked settle keeps TARGET livestock while you are *on* the range.
 * After EXIT, `opensetfile ("town.set")` must not leave bottles / cans /
 * plates / the vane painted on the street.
 */
export function hideRangeCastOffSet(
  set: string,
  actors: Iterable<{
    name: string;
    cast: string;
    visible: boolean;
    walking: boolean;
    turning: boolean;
    route: unknown[];
  }>,
): string[] {
  if (set === "target") {
    return [];
  }
  const hidden: string[] = [];
  for (const actor of actors) {
    if (!sandboxKeepActor({ name: actor.name, cast: actor.cast })) {
      continue;
    }
    const range =
      actor.cast.toLowerCase() === "target" || actor.name.toLowerCase().endsWith("targ");
    if (!range) {
      continue;
    }
    if (actor.visible || actor.walking || actor.turning) {
      hidden.push(actor.name);
    }
    actor.visible = false;
    actor.walking = false;
    actor.turning = false;
    actor.route = [];
  }
  return hidden;
}

/** Hide story extras. Leroy / Bolivar / TARGET / farm animals stay. */
export function hideSandboxStoryActors(
  actors: Iterable<{
    name: string;
    cast: string;
    visible: boolean;
    walking: boolean;
    turning: boolean;
    route: unknown[];
  }>,
): string[] {
  const hidden: string[] = [];
  for (const actor of actors) {
    if (sandboxKeepActor(actor)) {
      continue;
    }
    if (actor.visible || actor.walking || actor.turning) {
      hidden.push(actor.name);
    }
    actor.visible = false;
    actor.walking = false;
    actor.turning = false;
    actor.route = [];
  }
  return hidden;
}

export function sandboxClockFromSearch(search: string): ClockSlot | undefined {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const clock = Number(new URLSearchParams(query).get("clock"));
  return isClockSlot(clock) ? clock : undefined;
}

export function sandboxTownSetFile(clock: ClockSlot): "nite.set" | "town.set" {
  return isNight(clock) ? "nite.set" : "town.set";
}

export function sandboxGraphFolder(clock: ClockSlot): "_NITE" | "_TOWN" {
  return isNight(clock) ? "_NITE" : "_TOWN";
}

/**
 * Leroy's extracted `day1` `runyoself` is the south-gate intro, and at
 * `town.leroy2` (x>2432) it says the range is closed. Unlocked keeps
 * `day = 1` so the town stays empty; this proc uses the real range
 * talk (`beforetarget` loans a gun, `aftertarget` takes it back).
 * No starting gun/bullets — TARGET reload allows ammo on that SET.
 */
export function sandboxLeroyRangeRunyoself(): Proc {
  return {
    name: "runyoself",
    params: [],
    body: [
      { type: "global", names: ["leroyphase"] },
      {
        type: "if",
        cond: {
          type: "binary",
          op: "=",
          left: { type: "var", name: "leroyphase" },
          right: { type: "num", value: 3 },
        },
        then: [
          { type: "call", call: { type: "call", name: "aftertarget", args: [] } },
          {
            type: "assign",
            target: { type: "var", name: "leroyphase" },
            value: { type: "num", value: 0 },
          },
          { type: "exitcode" },
        ],
      },
      { type: "call", call: { type: "call", name: "beforetarget", args: [] } },
    ],
  };
}

export function sandboxLeroyRangeTalk(puppet: string, object: string, me: string): boolean {
  if (!puppet.toLowerCase().includes("leroy")) {
    return false;
  }
  return object === "puppet" && me.toLowerCase() === "day1";
}

/**
 * Court `fountain()` only opens `hub.set` on day-4 night with `tstone`
 * in the box. Unlocked keeps `day = 1`; this is the same click, without
 * that story gate. Day-court `gotospecial` hub D5 **west** (table;
 * north is the side chamber) plus nitecour's `mine.snd` bed.
 */
export function sandboxFountainOpensHub(set: string): boolean {
  const name = set.replace(/\.set$/i, "").toLowerCase();
  return name === "court" || name === "nitecour";
}

export function sandboxFountainProc(): Proc {
  const lit = (value: string): { type: "str"; value: string } => ({ type: "str", value });
  const n = (value: number): { type: "num"; value: number } => ({ type: "num", value });
  return {
    name: "fountain",
    params: [],
    body: [
      {
        type: "call",
        call: {
          type: "call",
          name: "screentoblack",
          args: [lit("set"), n(10)],
        },
      },
      { type: "call", call: { type: "call", name: "blackscreen", args: [] } },
      {
        type: "call",
        call: { type: "call", name: "playmovie", args: [lit("openfoun.mov")] },
      },
      { type: "call", call: { type: "call", name: "blackscreen", args: [] } },
      {
        type: "call",
        call: {
          type: "call",
          name: "sendtostage",
          args: [
            {
              type: "call",
              name: "gotospecial",
              args: [lit("hub.set"), lit("scene d5"), lit("west")],
            },
          ],
        },
      },
      {
        type: "call",
        call: {
          type: "call",
          name: "stoploop",
          args: [lit("scene"), lit("all")],
        },
      },
      { type: "call", call: { type: "call", name: "haltsound", args: [] } },
      { type: "call", call: { type: "call", name: "halttheme", args: [] } },
      {
        type: "call",
        call: { type: "call", name: "opentrackfile", args: [lit("mine.snd")] },
      },
      {
        type: "call",
        call: { type: "call", name: "playtheme", args: [lit("mine")] },
      },
      { type: "exitcode" },
    ],
  };
}

/** Tiles around the blocked hub center. Table still faces that center. */
const HUB_SUNDIAL_SCENES = new Set(["scene d5", "scene d3", "scene c4", "scene e4"]);

export function sandboxHubSundialScene(scene: string): boolean {
  return HUB_SUNDIAL_SCENES.has(scene.trim().toLowerCase());
}

/**
 * Extract D5 requires `currentview () = "north"`, but the table still is
 * D5 west. Skip the facing check; `pointinsundial` is still the dump rect.
 */
export function sandboxHubSundialSetcursor(): Proc {
  return {
    name: "setcursor",
    params: ["arg"],
    body: [
      {
        type: "if",
        cond: {
          type: "call",
          name: "pointinsundial",
          args: [{ type: "var", name: "arg" }],
        },
        then: [
          {
            type: "call",
            call: { type: "call", name: "cursor", args: [{ type: "str", value: "touch" }] },
          },
          { type: "exitcode" },
        ],
      },
      { type: "passcode" },
    ],
  };
}

export function sandboxHubSundialMousedown(): Proc {
  return {
    name: "mousedown",
    params: ["arg"],
    body: [
      {
        type: "if",
        cond: {
          type: "call",
          name: "pointinsundial",
          args: [{ type: "var", name: "arg" }],
        },
        then: [
          { type: "call", call: { type: "call", name: "dosundial", args: [] } },
          { type: "exitcode" },
        ],
      },
      { type: "passcode" },
    ],
  };
}

const strLit = (value: string): { type: "str"; value: string } => ({ type: "str", value });
const numLit = (value: number): { type: "num"; value: number } => ({ type: "num", value });
const boolLit = (value: boolean): { type: "bool"; value: boolean } => ({ type: "bool", value });
const varRef = (name: string): { type: "var"; name: string } => ({ type: "var", name });
const fn = (name: string, args: Expr[] = []): Extract<Expr, { type: "call" }> => ({
  type: "call",
  name,
  args,
});
const run = (name: string, args: Expr[] = []): Stmt => ({
  type: "call",
  call: fn(name, args),
});

export function sandboxIsBank(set: string): boolean {
  return set.replace(/\.set$/i, "").toLowerCase() === "bank";
}

export function sandboxBankCrackClick(set: string, object: string, me: string): boolean {
  return sandboxIsBank(set) && object === "scene" && me.toLowerCase() === "scene d1";
}

/** Bank D1 west sign: skip teller.pup / night no-op, run extracted `docrack`. */
export function sandboxBankSignMousedown(): Proc {
  return {
    name: "mousedown",
    params: ["arg"],
    body: [
      {
        type: "if",
        cond: {
          type: "binary",
          op: "&",
          left: {
            type: "binary",
            op: "=",
            left: fn("currentview", []),
            right: strLit("west"),
          },
          right: fn("pointinsign", [varRef("arg")]),
        },
        then: [run("docrack"), { type: "exitcode" }],
      },
      { type: "passcode" },
    ],
  };
}

export function sandboxIsApoth(set: string): boolean {
  return set.replace(/\.set$/i, "").toLowerCase() === "apoth";
}

/** Apoth `openset` only places bottles on day 3 afternoon. */
export function sandboxPuzzletime(): Proc {
  return {
    name: "puzzletime",
    params: [],
    body: [{ type: "return", value: boolLit(true) }],
  };
}

export function sandboxApothBottlesClick(set: string, object: string, me: string): boolean {
  return sandboxIsApoth(set) && object === "prop" && me.toLowerCase() === "bottles";
}

/**
 * Extracted `setupprop("apoth")` does `propset "drugs"`. Play then hides
 * the sprite (`nearbyProps` wants `apoth`). Bind it to the open SET.
 */
export function sandboxBindApothBottles(set: string, bottles: { set: string }): boolean {
  if (!sandboxIsApoth(set)) {
    return false;
  }
  bottles.set = set.replace(/\.set$/i, "").toLowerCase() || "apoth";
  return true;
}

/** Skip `realdist < 500` — spawn is ~540 from the authored xyz. */
export function sandboxBottlesSetcursor(): Proc {
  return {
    name: "setcursor",
    params: ["arg"],
    body: [run("cursor", [strLit("touch")]), { type: "exitcode" }],
  };
}

export function sandboxBottlesMousedown(): Proc {
  return {
    name: "mousedown",
    params: ["arg"],
    body: [run("dodrugs"), { type: "exitcode" }],
  };
}

export function sandboxDellTownClick(set: string, object: string, me: string): boolean {
  return (
    set.replace(/\.set$/i, "").toLowerCase() === "town" &&
    object === "actor" &&
    me.toLowerCase() === "dell"
  );
}

/** Click Dell at D7: skip Jones / `dell1.pup`, open extracted `FIGHT.FLT`. */
export function sandboxDellMousedown(): Proc {
  return {
    name: "mousedown",
    params: ["arg"],
    body: [
      {
        type: "if",
        cond: {
          type: "binary",
          op: "=",
          left: fn("actorpose", [{ type: "me" }]),
          right: strLit("dead"),
        },
        then: [
          {
            type: "if",
            cond: {
              type: "binary",
              op: "<",
              left: fn("random", [numLit(100)]),
              right: numLit(50),
            },
            then: [run("singlesound", [strLit("dellgrunt")])],
          },
          { type: "exitcode" },
        ],
      },
      {
        type: "if",
        cond: {
          type: "binary",
          op: "<",
          left: fn("realdist", [{ type: "me" }]),
          right: fn("hotdist", []),
        },
        then: [
          run("sendtoscene", [strLit("scene d7"), fn("fight", [])]),
          { type: "exitcode" },
        ],
      },
    ],
  };
}

export function sandboxKidTownClick(set: string, object: string, me: string): boolean {
  return (
    set.replace(/\.set$/i, "").toLowerCase() === "town" &&
    object === "actor" &&
    me.toLowerCase() === "kid"
  );
}

export function sandboxFightOn(value: unknown): boolean {
  return Number(value) > 0;
}

/**
 * During a street fight, EXTRA/GANG Cast `hit()` is the hanging murder
 * death (`playerdeath = "shot kidgang1"`). Use only the walker script.
 */
export function sandboxFightActorHit(
  object: string,
  me: string,
  fighton: unknown,
): boolean {
  return object === "actor" && sandboxFightActor(me) && sandboxFightOn(fighton);
}

export function sandboxFightWavePrefix(me: string): "bounty" | "kidgang" {
  return me.toLowerCase().startsWith("kidgang") ? "kidgang" : "bounty";
}

/**
 * Extracted `deadexits` waits until all five poses are `dead` and off the
 * still. Unspawned hunters stay `stand` (initxyz hides them on-camera),
 * so killing the ones you can see never `closefight`s. Count only living
 * *visible* hunters; `todie` is already dying. Skip the off-still wait
 * so a corpse in view does not hold the wave.
 */
export function sandboxFightDeadExits(me: string): Proc {
  const prefix = sandboxFightWavePrefix(me);
  const nameExpr: Expr = {
    type: "binary",
    op: "@",
    left: strLit(prefix),
    right: fn("numtostring", [varRef("count")]),
  };
  const stillAlive: Expr = {
    type: "binary",
    op: "&",
    left: {
      type: "binary",
      op: "&",
      left: {
        type: "binary",
        op: "!=",
        left: fn("actorpose", [varRef("name")]),
        right: strLit("dead"),
      },
      right: {
        type: "binary",
        op: "!=",
        left: fn("actorpose", [varRef("name")]),
        right: strLit("todie"),
      },
    },
    right: fn("actorvisible", [varRef("name")]),
  };
  const putdownWave: Stmt = {
    type: "for",
    name: "count",
    from: numLit(1),
    to: numLit(5),
    step: numLit(1),
    body: [
      { type: "assign", target: varRef("name"), value: nameExpr },
      run("sendtoactor", [varRef("name"), fn("putdownactor", [])]),
    ],
  };
  const body: Stmt[] = [
    { type: "local", names: ["name"] },
    {
      type: "for",
      name: "count",
      from: numLit(1),
      to: numLit(5),
      step: numLit(1),
      body: [
        { type: "assign", target: varRef("name"), value: nameExpr },
        { type: "if", cond: stillAlive, then: [{ type: "exitcode" }] },
      ],
    },
    putdownWave,
  ];
  if (prefix === "kidgang") {
    body.push(
      { type: "global", names: ["fightphase"] },
      {
        type: "assign",
        target: varRef("fightphase"),
        value: {
          type: "binary",
          op: "+",
          left: varRef("fightphase"),
          right: numLit(1),
        },
      },
      {
        type: "if",
        cond: {
          type: "binary",
          op: "<=",
          left: varRef("fightphase"),
          right: numLit(3),
        },
        then: [
          {
            type: "for",
            name: "count",
            from: numLit(1),
            to: numLit(5),
            step: numLit(1),
            body: [
              { type: "assign", target: varRef("name"), value: nameExpr },
              run("sendtoactor", [varRef("name"), fn("setupactor", [strLit("fight")])]),
            ],
          },
        ],
        else: [run("sendtoset", [fn("closefight", [])])],
      },
    );
  } else {
    body.push(run("sendtoset", [fn("closefight", [])]));
  }
  return { name: "deadexits", params: [], body };
}

/**
 * Extracted `openfight` `initactor`s every CST. Unlocked must not
 * `putdown` Bolivar in the store (or Help/Jones). Street toys and
 * livestock are restored after `closefight`.
 */
export function sandboxFightPutdown(name: string): boolean {
  const key = name.toLowerCase();
  if (key === "bolivar" || key === "dog") {
    return false;
  }
  if (SANDBOX_ACTORS.has(key) || sandboxFightActor(key)) {
    return true;
  }
  return SANDBOX_FARM_ACTOR.test(key);
}

/**
 * Click a spawned bounty or kid-gang scout. Not Kid (insult duel).
 * Sprite click is enough — CST `hotdist()` without an arg is talk range 384.
 */
export function sandboxFightScoutClick(
  set: string,
  object: string,
  me: string,
  fighton: unknown,
): boolean {
  return (
    set.replace(/\.set$/i, "").toLowerCase() === "town" &&
    object === "actor" &&
    sandboxFightScout(me) &&
    !sandboxFightOn(fighton)
  );
}

function sandboxFightStartBody(kind: SandboxFightKind): Stmt[] {
  return [
    { type: "global", names: ["sandboxfight", "fighton"] },
    {
      type: "assign",
      target: varRef("sandboxfight"),
      value: strLit(kind),
    },
    run("sendtoset", [fn("openfight", [])]),
    { type: "exitcode" },
  ];
}

export function sandboxFightScoutMousedown(kind: SandboxFightKind): Proc {
  return {
    name: "mousedown",
    params: ["arg"],
    body: [
      {
        type: "if",
        cond: {
          type: "binary",
          op: "=",
          left: fn("actorpose", [{ type: "me" }]),
          right: strLit("dead"),
        },
        then: [{ type: "exitcode" }],
      },
      ...sandboxFightStartBody(kind),
    ],
  };
}

/**
 * Extracted `makemove` zeros `actorvalue` on every tile step. Walker
 * `bountyloop` then `walkcloser`s again while you are shooting, so hits
 * never reach `hotdist (4)` (die at 3). Keep landed shots until `setupactor`.
 */
export function keepFightActorHits(
  fighton: unknown,
  name: string,
  current: number,
  next: number,
): boolean {
  return sandboxFightOn(fighton) && sandboxFightActor(name) && next === 0 && current > 0;
}

/** CST `_EXTRA` `hotdist (1..4)`. Cast `hotdist()` is town talk 384 and would never kill. */
export function sandboxFightHotdist(): Proc {
  return {
    name: "hotdist",
    params: ["arg"],
    body: [
      {
        type: "switch",
        expr: varRef("arg"),
        cases: [
          { match: numLit(1), body: [{ type: "return", value: numLit(128 * 8) }] },
          { match: numLit(2), body: [{ type: "return", value: numLit(128 * 6) }] },
          { match: numLit(3), body: [{ type: "return", value: numLit(1) }] },
          { match: numLit(4), body: [{ type: "return", value: numLit(2) }] },
        ],
      },
      { type: "exitcode" },
    ],
  };
}

/** Gun already out: CST `hit()` would run walker AI without `openfight`. */
export function sandboxFightScoutHit(kind: SandboxFightKind): Proc {
  return {
    name: "hit",
    params: [],
    body: sandboxFightStartBody(kind),
  };
}

export function sandboxFightIdleHitProc(): Proc {
  return {
    name: "hit",
    params: [],
    body: [{ type: "exitcode" }],
  };
}

/**
 * Extracted SET `hit()` keys death off `day = 3|4`. Unlocked stays on
 * day 1, so use `sandboxfight` for the same 15 / 30-hit caps.
 */
export function sandboxTownFightHitProc(): Proc {
  return {
    name: "hit",
    params: [],
    body: [
      { type: "global", names: ["playerhits", "playerdeath", "fighton", "sandboxfight"] },
      {
        type: "if",
        cond: {
          type: "binary",
          op: "=",
          left: varRef("fighton"),
          right: numLit(0),
        },
        then: [{ type: "exitcode" }],
      },
      {
        type: "assign",
        target: varRef("playerhits"),
        value: {
          type: "binary",
          op: "+",
          left: varRef("playerhits"),
          right: numLit(1),
        },
      },
      {
        type: "if",
        cond: {
          type: "binary",
          op: "=",
          left: fn("currentflat", []),
          right: strLit("mainpanel"),
        },
        then: [run("sendtoflat", [fn("currentflat", []), fn("makehit", [])])],
      },
      {
        type: "if",
        cond: {
          type: "binary",
          op: "&",
          left: {
            type: "binary",
            op: "=",
            left: varRef("sandboxfight"),
            right: strLit("bounty"),
          },
          right: {
            type: "binary",
            op: ">",
            left: varRef("playerhits"),
            right: numLit(15),
          },
        },
        then: [
          { type: "assign", target: varRef("fighton"), value: numLit(0) },
          {
            type: "for",
            name: "count",
            from: numLit(1),
            to: numLit(20),
            step: numLit(1),
            body: [run("forceupdate")],
          },
          run("closefight"),
          { type: "assign", target: varRef("playerdeath"), value: strLit("by bounty") },
          run("sendtoflat", [strLit("death"), fn("death", [])]),
          { type: "exitcode" },
        ],
      },
      {
        type: "if",
        cond: {
          type: "binary",
          op: "&",
          left: {
            type: "binary",
            op: "=",
            left: varRef("sandboxfight"),
            right: strLit("gang"),
          },
          right: {
            type: "binary",
            op: ">",
            left: varRef("playerhits"),
            right: numLit(30),
          },
        },
        then: [
          { type: "assign", target: varRef("fighton"), value: numLit(0) },
          {
            type: "for",
            name: "count",
            from: numLit(1),
            to: numLit(20),
            step: numLit(1),
            body: [run("forceupdate")],
          },
          run("closefight"),
          { type: "assign", target: varRef("playerdeath"), value: strLit("by gang") },
          run("sendtoflat", [strLit("death"), fn("death", [])]),
          { type: "exitcode" },
        ],
      },
    ],
  };
}

/** Click Kid at G6. Extracted `mousedown` is empty. */
export function sandboxKidMousedown(): Proc {
  return {
    name: "mousedown",
    params: ["arg"],
    body: [
      {
        type: "if",
        cond: {
          type: "binary",
          op: "=",
          left: fn("actorpose", [{ type: "me" }]),
          right: strLit("dead"),
        },
        then: [{ type: "exitcode" }],
      },
      {
        type: "if",
        cond: {
          type: "binary",
          op: "<",
          left: fn("realdist", [{ type: "me" }]),
          right: fn("hotdist", []),
        },
        then: [
          run("sendtoscene", [strLit("scene g5"), fn("openkid", [])]),
          { type: "exitcode" },
        ],
      },
    ],
  };
}

/**
 * Extracted `openkid` walks G10→G6 then `advanceday`s. Unlocked already
 * parks him at G6; skip the walk and the day change.
 */
export function sandboxOpenKidProc(): Proc {
  return {
    name: "openkid",
    params: [],
    body: [
      { type: "global", names: ["cutdowns", "playerdeath"] },
      run("path", [numLit(6), strLit("dust:kid:")]),
      run("cursor", [strLit("watch")]),
      run("puppetgrab", [boolLit(false)]),
      run("sendtocast", [strLit("gang"), fn("runpuppet", [strLit("kid.pup")])]),
      run("puppetgrab", [boolLit(true)]),
      {
        type: "if",
        cond: {
          type: "binary",
          op: "<",
          left: varRef("cutdowns"),
          right: numLit(4),
        },
        then: [
          run("sendtostage", [fn("spotmovie", [strLit("kidinv.mov")])]),
          {
            type: "assign",
            target: varRef("playerdeath"),
            value: strLit("by kid"),
          },
          run("sendtoflat", [strLit("death"), fn("death", [])]),
          { type: "exitcode" },
        ],
      },
      run("screentoblack", [strLit("current"), numLit(10)]),
      run("blackscreen"),
      run("playmovie", [strLit("kiddie.mov")]),
      {
        type: "if",
        cond: {
          type: "binary",
          op: "=",
          left: fn("actionframe", [numLit(1)]),
          right: boolLit(false),
        },
        then: [
          {
            type: "assign",
            target: varRef("playerdeath"),
            value: strLit("by kid"),
          },
          run("sendtoflat", [strLit("death"), fn("death", [])]),
          { type: "exitcode" },
        ],
      },
      run("sendtoactor", [strLit("kid"), fn("setupactor", [strLit("dead")])]),
      run("blacktoscreen", [strLit("set"), numLit(30)]),
    ],
  };
}

/**
 * After Yes, Leroy's CST `mousedown` does `cursor ("watch")` / `while
 * iswalk ("leroy")` then `gotointerior ("target.set")`. `walktopuppet`
 * starts a return-to-star walk first; that wait can stick (hotdist
 * `turntodeg`, a NaN dest) so the range never opens. Unlocked does not
 * wait — the SET swap drops him anyway.
 */
export function sandboxSkipRangeWalkWait(
  sandbox: boolean,
  set: string,
  actor: string,
  leroyphase: unknown,
): boolean {
  return (
    sandbox &&
    set === "town" &&
    actor.toLowerCase() === "leroy" &&
    Number(leroyphase) === 2
  );
}
