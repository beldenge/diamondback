/**
 * PRP group → logic-script container, from HOUSE.PRP / INVEN.PRP
 * group table (container 0 +2360, script id at logic+38). Extract
 * files are `{firstProc}_{container}.json`. Fetch only that dump —
 * do not probe the other spelling (S3 403 / Vite 404).
 */

export interface PropGroup {
  name: string;
  shop: "house" | "inven";
  script: number;
}

export const HOUSE_GROUPS: readonly PropGroup[] = [
  { name: "shootingstar", shop: "house", script: 2 },
  { name: "slider", shop: "house", script: 16 },
  { name: "patch", shop: "house", script: 20 },
  { name: "keysel", shop: "house", script: 24 },
  { name: "gunimage", shop: "house", script: 28 },
  { name: "check", shop: "house", script: 33 },
  { name: "inven day", shop: "house", script: 37 },
  { name: "inven time", shop: "house", script: 45 },
  { name: "map day", shop: "house", script: 51 },
  { name: "map time", shop: "house", script: 59 },
  { name: "butbevel", shop: "house", script: 65 },
  { name: "invbevel", shop: "house", script: 69 },
  { name: "avatar", shop: "house", script: 73 },
  { name: "gamblers", shop: "house", script: 165 },
  { name: "tumbleweed", shop: "house", script: 174 },
  { name: "histbord", shop: "house", script: 196 },
  { name: "dung1", shop: "house", script: 202 },
  { name: "townrand", shop: "house", script: 213 },
  { name: "coat", shop: "house", script: 233 },
  { name: "buildrand1", shop: "house", script: 244 },
  { name: "diarybord", shop: "house", script: 260 },
  { name: "pagebord", shop: "house", script: 265 },
  { name: "gunhand", shop: "house", script: 270 },
  { name: "blackjack", shop: "house", script: 498 },
  { name: "table1", shop: "house", script: 507 },
  { name: "curebord", shop: "house", script: 526 },
  { name: "powderkeg1", shop: "house", script: 530 },
  { name: "cross", shop: "house", script: 552 },
  { name: "yunnibord", shop: "house", script: 556 },
  { name: "door", shop: "house", script: 562 },
  { name: "letters", shop: "house", script: 674 },
  { name: "bottles", shop: "house", script: 678 },
];

export const INVEN_GROUPS: readonly PropGroup[] = [
  { name: "bone", shop: "inven", script: 2 },
  { name: "ring", shop: "inven", script: 19 },
  { name: "postcards", shop: "inven", script: 27 },
  { name: "sugarcubes", shop: "inven", script: 35 },
  { name: "cigar", shop: "inven", script: 43 },
  { name: "hrkey", shop: "inven", script: 51 },
  { name: "cards", shop: "inven", script: 59 },
  { name: "hhkey", shop: "inven", script: 67 },
  { name: "bknife", shop: "inven", script: 75 },
  { name: "mask", shop: "inven", script: 83 },
  { name: "jug", shop: "inven", script: 132 },
  { name: "history", shop: "inven", script: 149 },
  { name: "flowers", shop: "inven", script: 157 },
  { name: "hankerchief", shop: "inven", script: 174 },
  { name: "pie", shop: "inven", script: 203 },
  { name: "biscuits", shop: "inven", script: 220 },
  { name: "boots", shop: "inven", script: 228 },
  { name: "harmonica", shop: "inven", script: 248 },
  { name: "bullets", shop: "inven", script: 256 },
  { name: "badge", shop: "inven", script: 264 },
  { name: "hairpin", shop: "inven", script: 286 },
  { name: "yunnibook", shop: "inven", script: 294 },
  { name: "pages", shop: "inven", script: 311 },
  { name: "matchbox", shop: "inven", script: 319 },
  { name: "seed", shop: "inven", script: 330 },
  { name: "flute", shop: "inven", script: 338 },
  { name: "tbird", shop: "inven", script: 346 },
  { name: "tstone", shop: "inven", script: 354 },
  { name: "blade", shop: "inven", script: 362 },
  { name: "apple", shop: "inven", script: 370 },
  { name: "rx", shop: "inven", script: 387 },
  { name: "balm", shop: "inven", script: 398 },
  { name: "gun", shop: "inven", script: 406 },
  { name: "helpbut", shop: "inven", script: 420 },
  { name: "chest", shop: "inven", script: 428 },
];

/**
 * HOUSE containers whose first proc is `setcursor`. Extract names the
 * dump `{firstProc}_{container}.json`, so these are not `initprop_N`.
 * The rest of HOUSE_GROUPS (and every INVEN item) dump as `initprop_N`.
 */
const HOUSE_SETCURSOR_IDS: ReadonlySet<number> = new Set([
  165, 202, 244, 270, 498, 562, 678,
]);

export function propScriptRels(group: PropGroup): string[] {
  const folder = group.shop === "house" ? "PRP/_HOUSE" : "PRP/_INVEN";
  const id = group.script;
  if (group.shop === "house" && HOUSE_SETCURSOR_IDS.has(id)) {
    return [`${folder}/setcursor _arg__${id}.json`];
  }
  return [`${folder}/initprop_${id}.json`];
}

export function shopScriptRels(shop: "house" | "inven"): string[] {
  const folder = shop === "house" ? "PRP/_HOUSE" : "PRP/_INVEN";
  // Shop container 1 is `setcursor`. `initprop_1.json` is never dumped.
  return [`${folder}/setcursor _arg__1.json`];
}

/** Stage-level FLT dumps that exist for this stem. Not the flat table. */
export function stageScriptRels(stem: string): string[] {
  const folder = `FLT/_${stem.toUpperCase()}`;
  if (stem === "credits") {
    return [`${folder}/openstage.json`];
  }
  const files = [`${folder}/setcursor _arg_.json`];
  // Unnumbered `{firstProc}.json` is the first container of that name.
  // TARGET / CHECKERS keep extra stage procs in their own files.
  if (stem === "target") {
    files.push(`${folder}/gototown _dirname_.json`);
  }
  if (stem === "checkers") {
    files.push(`${folder}/playcheckers.json`);
  }
  return files;
}

const PUZZLE_SHOP_DUMP: Readonly<Record<string, string>> = {
  checkers: "automove_1.json",
  credits: "openshop_1.json",
  flute: "setcursor_1.json",
  target: "openshop_1.json",
};

export function puzzleShopScriptRels(stem: string): string[] {
  const folder = `PRP/_${stem.toUpperCase()}`;
  const file = PUZZLE_SHOP_DUMP[stem] ?? "setcursor _arg__1.json";
  return [`${folder}/${file}`];
}

const PUZZLE_PROP_DUMP: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  checkers: {
    2: "setcursor _arg__2.json",
    8: "setcursor _arg__8.json",
  },
  crack: {
    2: "mousedown _arg__2.json",
    47: "mousedown _arg__47.json",
  },
  fight: {
    2: "knife_2.json",
    54: "setcursor _arg__54.json",
    87: "sendquit_87.json",
  },
  salgames: {
    522: "mousedown _arg__522.json",
    534: "mousedown _arg__534.json",
    540: "setcursor _arg__540.json",
    694: "mousedown _arg__694.json",
    760: "mousedown _arg__760.json",
  },
  scorp: {
    2: "setcursor _arg__2.json",
    5: "mousedown _arg__5.json",
    10: "setcursor _arg__10.json",
  },
  target: {
    2: "endball _arg__2.json",
    12: "setcursor _arg__12.json",
    16: "setcursor _arg__16.json",
    29: "endball _arg__29.json",
    33: "endball _arg__33.json",
  },
};

export function puzzlePropScriptRels(stem: string, id: number): string[] {
  const file = PUZZLE_PROP_DUMP[stem]?.[id];
  if (!file) {
    return [];
  }
  return [`PRP/_${stem.toUpperCase()}/${file}`];
}
