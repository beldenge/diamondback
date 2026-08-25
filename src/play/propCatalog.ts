/**
 * PRP group → logic-script container, from HOUSE.PRP / INVEN.PRP
 * group table (container 0 +2360, script id at logic+38). Extract
 * files are `{firstProc}_{container}.json`.
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

export function propScriptRels(group: PropGroup): string[] {
  const folder = group.shop === "house" ? "PRP/_HOUSE" : "PRP/_INVEN";
  const id = group.script;
  const rels = [`${folder}/initprop_${id}.json`];
  // INVEN only dumps shop-level `setcursor _arg__1.json`. Per-item
  // setcursor files exist for some HOUSE props (door, gamblers, …).
  // `setcursor_${id}.json` is never extracted.
  if (group.shop === "house") {
    rels.push(`${folder}/setcursor _arg__${id}.json`);
  }
  return rels;
}

export function shopScriptRels(shop: "house" | "inven"): string[] {
  const folder = shop === "house" ? "PRP/_HOUSE" : "PRP/_INVEN";
  return [`${folder}/setcursor _arg__1.json`, `${folder}/initprop_1.json`];
}
