import { extractUrl } from "../world/set/extract";
import { SPRITE_HOTSPOT_X, SPRITE_HOTSPOT_Y } from "./facing";
import type { FlatItem } from "./hud";

/** FLT button Mac rect in 512×384 stage pixels. */
export interface FlatHit {
  name: string;
  top: number;
  left: number;
  bottom: number;
  right: number;
  script?: number;
  file?: string;
}

export interface PuzzleLabel {
  text: string;
  x: number;
  y: number;
  size: number;
}

/**
 * `drawstring` replaces the previous string in that slot. TARGET scores
 * share y=348 (target / bottle / can / %) so match x as well as y.
 */
export function upsertPuzzleLabel(
  labels: readonly PuzzleLabel[],
  next: PuzzleLabel,
  xSlop = 24,
  ySlop = 8,
): PuzzleLabel[] {
  return [
    ...labels.filter(
      (label) => Math.abs(label.y - next.y) > ySlop || Math.abs(label.x - next.x) > xSlop,
    ),
    next,
  ];
}

export interface PuzzleBoard {
  stillUrl: string;
  items: FlatItem[];
  labels: PuzzleLabel[];
  /** Sit above `#play-fade` — these scripts never `blacktoscreen`. */
  reader?: boolean;
}

export function pointInMacRect(
  hit: { top: number; left: number; bottom: number; right: number },
  x: number,
  y: number,
): boolean {
  return x >= hit.left && x < hit.right && y >= hit.top && y < hit.bottom;
}

export function hitFlatButton(hits: readonly FlatHit[], x: number, y: number): FlatHit | undefined {
  return [...hits].reverse().find((hit) => pointInMacRect(hit, x, y));
}

/**
 * Dust `findword`: 1-based split on `sep`. Empty slots count (SALGAMES
 * `putword (…, "")` during shuffle). Do not collapse consecutive seps.
 */
export function findWord(list: string, sep: string, index: number): string {
  const parts = list.split(sep);
  return parts[Math.trunc(index) - 1] ?? "";
}

/**
 * Dust `putword`: replace the 1-based slot, keeping holes. Shuffle does
 * `putword (list, " ", n, "")` then writes the swap; dropping empties
 * shrinks the 52-card deck so hand two has nothing to deal.
 */
export function putWord(list: string, sep: string, index: number, word: string): string {
  const parts = list.split(sep);
  const i = Math.max(1, Math.trunc(index)) - 1;
  while (parts.length <= i) {
    parts.push("");
  }
  parts[i] = word;
  return parts.join(sep);
}

/** Dust `substring`: 1-based index, or -1 if missing (boot uses `= 1`, cards use `>= 0`). */
export function substringIndex(haystack: string, needle: string): number {
  const at = haystack.toLowerCase().indexOf(needle.toLowerCase());
  return at < 0 ? -1 : at + 1;
}

export function shopFileOf(shop: string): string {
  return shop ? `${shop.toLowerCase()}.prp` : "";
}

export function isPuzzleStage(stage: string): boolean {
  const name = stage.toLowerCase().replace(/\.flt$/i, "");
  return name !== "" && name !== "none" && name !== "new" && name !== "target";
}

/** HOUSE chrome around FLT readers. 512×384; page hole is codec skip 255, not pal 0. */
export const READER_BORDER_PROPS = ["diarybord", "histbord", "pagebord", "yunnibord"] as const;

export const READER_STAGES: Readonly<Record<string, (typeof READER_BORDER_PROPS)[number]>> = {
  diary: "diarybord",
  hist: "histbord",
  pages: "pagebord",
  yunni: "yunnibord",
  // flats.json `stage` is the in-file Pascal name, not the disk stem.
  yunnibook: "yunnibord",
  torn: "pagebord",
  dbhist: "histbord",
};

export function readerStageName(stage: string): string {
  return stage.toLowerCase().replace(/\.flt$/i, "");
}

export function isReaderStage(stage: string): boolean {
  return readerStageName(stage) in READER_STAGES;
}

export function readerBorderName(stage: string): string | undefined {
  return READER_STAGES[readerStageName(stage)];
}

export function isReaderBorderProp(name: string): boolean {
  return (READER_BORDER_PROPS as readonly string[]).includes(name.toLowerCase());
}

/**
 * Codec-skip page hole on the dumped HOUSE `*bord` PNG (transparent bbox).
 * Inner click is FLT/stage `mousedown` (left/right page turn). Frame is
 * the bord (close). Do not treat `yunnibord` as the whole sprite — that
 * script always `closestagefile` except the TOC tab. A HUD-height hole
 * (`y < 256`) stole the lower page (hole goes to ~352).
 */
export const READER_BORDER_HOLE: Readonly<
  Record<string, { left: number; top: number; right: number; bottom: number }>
> = {
  yunnibord: { left: 43, top: 24, right: 470, bottom: 352 },
  histbord: { left: 32, top: 24, right: 480, bottom: 367 },
  pagebord: { left: 171, top: 30, right: 365, bottom: 353 },
  diarybord: { left: 30, top: 31, right: 478, bottom: 351 },
};

export function pointHitsReaderBorder(name: string, x: number, y: number): boolean {
  const key = name.toLowerCase();
  if (x < 0 || x > 512 || y < 0 || y >= 384) {
    return false;
  }
  const hole = READER_BORDER_HOLE[key];
  if (
    hole &&
    x >= hole.left &&
    x <= hole.right &&
    y >= hole.top &&
    y <= hole.bottom
  ) {
    return false;
  }
  return true;
}

/** Screen-space PRP blit: `propxy` is the 512×384 hotspot (same as INVEN). */
export function flatPropItem(
  prop: { name: string; x: number; y: number; spriteRoot: string },
  place: { path: string; x: number; y: number; w: number; h: number },
): FlatItem {
  return {
    name: prop.name,
    url: extractUrl(`${prop.spriteRoot}/${place.path}`),
    x: prop.x + place.x - SPRITE_HOTSPOT_X,
    y: prop.y + place.y - SPRITE_HOTSPOT_Y,
    w: place.w,
    h: place.h,
  };
}

export function pointHitsFlatItem(item: FlatItem, x: number, y: number): boolean {
  return x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h;
}
