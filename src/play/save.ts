/**
 * Remake saves are JSON the VM can restore (globals, actors, props, pose).
 * Dust `savegame` / `opengame` used `*.rtd` (DreamFactory RTDO); that
 * binary is unknown, so we write `.json` and still read old `.rtd`
 * downloads (they were JSON with a fake extension). Browser
 * `localStorage` is **autosave only** (refresh / Continue). Explicit
 * Save/Open are files.
 *
 * Blob `format` is 1. Story playback is not fully proven, so a later
 * fix may need a different snapshot — bump `SAVE_FORMAT` on a breaking
 * change rather than silently reading old files. No migration reader
 * until then.
 */

import type { Value } from "../vm/runtime";
import type { Dir } from "../world/set/types";

/** Snapshot shape. Bump on a breaking blob change; no migration yet. */
export const SAVE_FORMAT = 1;
export const SAVE_ENGINE = "diamondback";
export const DEFAULT_SAVE_TITLE = "dust 0.3";
export const SAVE_STORAGE_PREFIX = "diamondback.save.";
export const SAVE_LATEST_KEY = "diamondback.save.latest";
export const AUTOSAVE_KEY = "diamondback.autosave";

export type SaveJson =
  | number
  | string
  | boolean
  | null
  | { k: "p"; x: number; y: number; z: number };

export interface ActorSnap {
  name: string;
  cast: string;
  visible: boolean;
  set: string;
  star: string;
  x: number;
  y: number;
  z: number;
  deg: number;
  scale: number;
  pose: string;
  owner: string;
  value: number;
  variable: number;
  hitboxW: number;
  hitboxH: number;
  speed: number;
  turnSpeed: number;
  zclip: number;
  screen: boolean;
  is3d: boolean;
}

export interface PropSnap {
  name: string;
  shop: string;
  visible: boolean;
  owner: string;
  view: string;
  set: string;
  star: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  deg: number;
  value: number;
  speed: number;
  zclip: number;
  screen: boolean;
  dist: number;
  animTick: number;
  openedAt?: { scene: string; facing: string };
}

export interface SaveBlob {
  format: typeof SAVE_FORMAT;
  engine: typeof SAVE_ENGINE;
  title: string;
  savedAt: string;
  globals: Record<string, SaveJson>;
  globalNames: string[];
  pose: { world: string; x: number; y: number; facing: string };
  setFile: string;
  currentSet: string;
  currentScene: string;
  currentView: string;
  currentFlat: string;
  currentStage: string;
  puzzleShop: string;
  waveVolume: number;
  puppetParams: number[];
  actors: ActorSnap[];
  props: PropSnap[];
}

export interface SavePort {
  writeAutosave(blob: SaveBlob): Promise<void>;
  readAutosave(): Promise<SaveBlob | undefined>;
  clearAutosave(): Promise<void>;
}

export function saveSlotId(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ") || DEFAULT_SAVE_TITLE;
}

/** Clock-based download name: `day-1-night.json`. */
export function saveFileStem(globals: Record<string, SaveJson>): string {
  const day = Math.trunc(Number(globals.day));
  const clock = Math.trunc(Number(globals.clock));
  const slot = clock === 1 ? "morning" : clock === 3 ? "night" : "afternoon";
  if (Number.isFinite(day) && day >= 1) {
    return `day-${day}-${slot}`;
  }
  return "dust";
}

export function saveTitleFromGlobals(globals: Record<string, SaveJson>): string {
  const day = Math.trunc(Number(globals.day));
  const clock = Math.trunc(Number(globals.clock));
  const slot = clock === 1 ? "morning" : clock === 3 ? "night" : "afternoon";
  if (Number.isFinite(day) && day >= 1) {
    return `Day ${day} ${slot}`;
  }
  return "Dust";
}

export function saveFileName(blob: SaveBlob): string {
  return `${saveFileStem(blob.globals)}.json`;
}

export function valueToSaveJson(value: Value): SaveJson {
  if (value && typeof value === "object" && value.kind === "point") {
    return { k: "p", x: value.x, y: value.y, z: value.z };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  return null;
}

export function saveJsonToValue(raw: SaveJson): Value {
  if (raw && typeof raw === "object") {
    return { kind: "point", x: raw.x, y: raw.y, z: raw.z };
  }
  if (typeof raw === "number" || typeof raw === "string" || typeof raw === "boolean") {
    return raw;
  }
  return 0;
}

export function parseSaveBlob(raw: unknown): SaveBlob | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const row = raw as Partial<SaveBlob> & { version?: number };
  const format = row.format ?? row.version;
  if (format !== SAVE_FORMAT || row.engine !== SAVE_ENGINE) {
    return undefined;
  }
  if (!row.globals || typeof row.globals !== "object") {
    return undefined;
  }
  if (!Array.isArray(row.actors) || !Array.isArray(row.props)) {
    return undefined;
  }
  const pose = row.pose;
  if (!pose || typeof pose.world !== "string") {
    return undefined;
  }
  return {
    format: SAVE_FORMAT,
    engine: SAVE_ENGINE,
    title: String(row.title ?? DEFAULT_SAVE_TITLE),
    savedAt: String(row.savedAt ?? ""),
    globals: row.globals as Record<string, SaveJson>,
    globalNames: Array.isArray(row.globalNames) ? row.globalNames.map(String) : [],
    pose: {
      world: pose.world,
      x: Number(pose.x) || 0,
      y: Number(pose.y) || 0,
      facing: String(pose.facing || "N"),
    },
    setFile: String(row.setFile ?? ""),
    currentSet: String(row.currentSet ?? ""),
    currentScene: String(row.currentScene ?? ""),
    currentView: String(row.currentView ?? "north"),
    currentFlat: String(row.currentFlat ?? "mainpanel"),
    currentStage: String(row.currentStage ?? "new"),
    puzzleShop: String(row.puzzleShop ?? ""),
    waveVolume: Number(row.waveVolume) || 5,
    puppetParams: Array.isArray(row.puppetParams)
      ? row.puppetParams.map((n) => Number(n) || 0)
      : [],
    actors: row.actors as ActorSnap[],
    props: row.props as PropSnap[],
  };
}

export function encodeSaveBlob(blob: SaveBlob): string {
  return `${JSON.stringify(blob, null, 2)}\n`;
}

export function decodeSaveText(text: string): SaveBlob | undefined {
  try {
    return parseSaveBlob(JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

export function storyContinueFromSearch(search: string): boolean {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const raw = new URLSearchParams(query).get("continue");
  return raw === "1" || raw === "true" || raw === "";
}

/** `PerformanceNavigationTiming.type`, or `"reload"` from the old API. */
export function navigationType(
  perf: Pick<Performance, "getEntriesByType"> & {
    navigation?: { type?: number };
  } = performance,
): string | undefined {
  const nav = perf.getEntriesByType?.("navigation")?.[0] as { type?: string } | undefined;
  if (nav?.type) {
    return nav.type;
  }
  if (perf.navigation?.type === 1) {
    return "reload";
  }
  return undefined;
}

/**
 * How the play URL was reached. Cards use in-page `pushState`; a landing
 * F5 still reports PerformanceNavigationTiming `reload` for the whole
 * document, so that type must not restore on a later card click.
 */
export type SaveRestoreSource = "document" | "in-page";

/**
 * Continue link always restores. A document reload of the play page
 * restores. An in-page Resurrected card click does not — even after an
 * F5 of the title.
 */
export function shouldRestoreAutosave(
  search: string,
  nav = navigationType(),
  source: SaveRestoreSource = "document",
): boolean {
  if (storyContinueFromSearch(search)) {
    return true;
  }
  return source === "document" && nav === "reload";
}

export class MemorySavePort implements SavePort {
  autosave: SaveBlob | undefined;

  async writeAutosave(blob: SaveBlob): Promise<void> {
    this.autosave = blob;
  }

  async readAutosave(): Promise<SaveBlob | undefined> {
    return this.autosave;
  }

  async clearAutosave(): Promise<void> {
    this.autosave = undefined;
  }
}

export class BrowserSavePort implements SavePort {
  async writeAutosave(blob: SaveBlob): Promise<void> {
    localStorage.setItem(AUTOSAVE_KEY, encodeSaveBlob(blob));
  }

  async readAutosave(): Promise<SaveBlob | undefined> {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    if (text) {
      return decodeSaveText(text);
    }
    return migrateLegacySlot();
  }

  async clearAutosave(): Promise<void> {
    localStorage.removeItem(AUTOSAVE_KEY);
  }
}

function migrateLegacySlot(): SaveBlob | undefined {
  try {
    const id = localStorage.getItem(SAVE_LATEST_KEY);
    if (!id) {
      return undefined;
    }
    const text = localStorage.getItem(`${SAVE_STORAGE_PREFIX}${id}`);
    const blob = text ? decodeSaveText(text) : undefined;
    if (blob) {
      localStorage.setItem(AUTOSAVE_KEY, encodeSaveBlob(blob));
    }
    return blob;
  } catch {
    return undefined;
  }
}

export function defaultSavePort(): SavePort {
  try {
    if (typeof localStorage !== "undefined") {
      return new BrowserSavePort();
    }
  } catch {
    /* sandboxed */
  }
  return new MemorySavePort();
}

export function browserHasSave(): boolean {
  try {
    if (localStorage.getItem(AUTOSAVE_KEY)) {
      return true;
    }
    const id = localStorage.getItem(SAVE_LATEST_KEY);
    return Boolean(id && localStorage.getItem(`${SAVE_STORAGE_PREFIX}${id}`));
  } catch {
    return false;
  }
}

export function downloadSaveBlob(blob: SaveBlob): string {
  const name = saveFileName(blob);
  if (typeof document === "undefined") {
    return name;
  }
  const href = URL.createObjectURL(
    new Blob([encodeSaveBlob(blob)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
  return name;
}

type SaveFilePicker = (opts: {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<{
  name?: string;
  createWritable: () => Promise<{
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

export type SaveToDiskResult =
  | { ok: true; via: "picker" | "download"; name: string }
  | { ok: false; cancelled: true; name: string };

export async function saveBlobToDisk(blob: SaveBlob): Promise<SaveToDiskResult> {
  const name = saveFileName(blob);
  const picker = (globalThis as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName: name,
        types: [
          {
            description: "Dust save",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(encodeSaveBlob(blob));
      await writable.close();
      return { ok: true, via: "picker", name: handle.name || name };
    } catch (err) {
      if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "AbortError") {
        return { ok: false, cancelled: true, name };
      }
    }
  }
  downloadSaveBlob(blob);
  return { ok: true, via: "download", name };
}

export type PickSaveResult =
  | { kind: "ok"; blob: SaveBlob }
  | { kind: "cancel" }
  | { kind: "invalid" };

export function pickSaveFile(): Promise<PickSaveResult> {
  if (typeof document === "undefined") {
    return Promise.resolve({ kind: "cancel" });
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.rtd,application/json";
    let settled = false;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: PickSaveResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (focusTimer !== undefined) {
        clearTimeout(focusTimer);
      }
      window.removeEventListener("focus", onFocus);
      input.remove();
      resolve(result);
    };
    const onFocus = (): void => {
      focusTimer = setTimeout(() => {
        if (!input.files?.length) {
          finish({ kind: "cancel" });
        }
      }, 500);
    };
    input.addEventListener("change", () => {
      if (focusTimer !== undefined) {
        clearTimeout(focusTimer);
        focusTimer = undefined;
      }
      const file = input.files?.[0];
      if (!file) {
        finish({ kind: "cancel" });
        return;
      }
      void file.text().then((text) => {
        const blob = decodeSaveText(text);
        finish(blob ? { kind: "ok", blob } : { kind: "invalid" });
      });
    });
    input.addEventListener("cancel", () => finish({ kind: "cancel" }));
    window.addEventListener("focus", onFocus);
    input.click();
  });
}

export function facingFromSave(value: string): Dir {
  const key = value.trim().toUpperCase();
  if (key === "S" || key === "SOUTH") {
    return "S";
  }
  if (key === "E" || key === "EAST") {
    return "E";
  }
  if (key === "W" || key === "WEST") {
    return "W";
  }
  return "N";
}
