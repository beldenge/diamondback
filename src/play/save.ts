/**
 * Remake save blobs. Dust `savegame` / `opengame` write `*.rtd`; that
 * layout is unknown, so we store JSON the VM can restore (globals,
 * actors, props, pose). Browser slot is localStorage; Save also
 * downloads a `.rtd` and Open can import one.
 */

import type { Value } from "../vm/runtime";
import type { Dir } from "../world/set/types";

export const SAVE_FORMAT = 1;
export const SAVE_ENGINE = "diamondback";
export const DEFAULT_SAVE_TITLE = "dust 0.3";
export const SAVE_STORAGE_PREFIX = "diamondback.save.";
export const SAVE_LATEST_KEY = "diamondback.save.latest";

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
  write(title: string, blob: SaveBlob): Promise<void>;
  read(title: string): Promise<SaveBlob | undefined>;
  latest?(): Promise<SaveBlob | undefined>;
}

export function saveSlotId(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ") || DEFAULT_SAVE_TITLE;
}

export function saveFileName(title: string): string {
  const stem = saveSlotId(title).replace(/[^\w.]+/g, "-");
  return `${stem || "dust-0.3"}.rtd`;
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

export class MemorySavePort implements SavePort {
  readonly slots = new Map<string, SaveBlob>();
  latestId = "";

  async write(title: string, blob: SaveBlob): Promise<void> {
    const id = saveSlotId(title);
    this.slots.set(id, blob);
    this.latestId = id;
  }

  async read(title: string): Promise<SaveBlob | undefined> {
    return this.slots.get(saveSlotId(title));
  }

  async latest(): Promise<SaveBlob | undefined> {
    return this.latestId ? this.slots.get(this.latestId) : undefined;
  }
}

export class BrowserSavePort implements SavePort {
  async write(title: string, blob: SaveBlob): Promise<void> {
    const id = saveSlotId(title);
    const text = encodeSaveBlob(blob);
    localStorage.setItem(`${SAVE_STORAGE_PREFIX}${id}`, text);
    localStorage.setItem(SAVE_LATEST_KEY, id);
  }

  async read(title: string): Promise<SaveBlob | undefined> {
    const text = localStorage.getItem(`${SAVE_STORAGE_PREFIX}${saveSlotId(title)}`);
    return text ? decodeSaveText(text) : undefined;
  }

  async latest(): Promise<SaveBlob | undefined> {
    const id = localStorage.getItem(SAVE_LATEST_KEY);
    if (!id) {
      return undefined;
    }
    const text = localStorage.getItem(`${SAVE_STORAGE_PREFIX}${id}`);
    return text ? decodeSaveText(text) : undefined;
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
    const id = localStorage.getItem(SAVE_LATEST_KEY);
    return Boolean(id && localStorage.getItem(`${SAVE_STORAGE_PREFIX}${id}`));
  } catch {
    return false;
  }
}

export function downloadSaveBlob(blob: SaveBlob): void {
  if (typeof document === "undefined") {
    return;
  }
  const href = URL.createObjectURL(
    new Blob([encodeSaveBlob(blob)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = href;
  link.download = saveFileName(blob.title);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export function pickSaveFile(): Promise<SaveBlob | undefined> {
  if (typeof document === "undefined") {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".rtd,.json,application/json";
    let settled = false;
    const finish = (blob?: SaveBlob): void => {
      if (settled) {
        return;
      }
      settled = true;
      window.removeEventListener("focus", onFocus);
      input.remove();
      resolve(blob);
    };
    const onFocus = (): void => {
      window.setTimeout(() => finish(undefined), 400);
    };
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        finish(undefined);
        return;
      }
      void file.text().then((text) => finish(decodeSaveText(text)));
    });
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
