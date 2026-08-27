import type { Proc } from "../vm/ast";
import { isClockSlot, isNight, type ClockSlot } from "../core/time";

/** World actors Unlocked keeps so minigames have an opponent. */
export const SANDBOX_ACTORS = new Set(["leroy", "bolivar"]);

/** Hub shaman + mine skeleton. Story extras stay hidden. */
export const SANDBOX_CAVE_ACTORS = new Set(["skeleton", "shaman"]);

const SANDBOX_UNDERGROUND_SET = /^(hub|mine|flute|snake|tbird)$/;

/** Town livestock Unlocked keeps. Not the dog (lunge movie / Help beat). */
const SANDBOX_FARM_ACTOR = /^(pig|cow|chicken|bird)\d*$/;

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
  return SANDBOX_ACTORS.has(name);
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
