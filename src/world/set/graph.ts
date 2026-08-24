import {
  DIR_FROM_CODE,
  TOWN_SPAWN_FALLBACK,
  TOWN_SPAWN_FACING,
  TOWN_SPAWN_SCENE,
  TURN_RIGHT,
  type Dir,
  type FrameRef,
  type SceneRecord,
  type SetGraph,
  type SetTransition,
  type TransitionRecord,
  type WalkerPose,
} from "./types";
import { extractUrl } from "./extract";

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

const DIR_FROM_WORD: Record<string, Dir> = {
  N: "N",
  S: "S",
  E: "E",
  W: "W",
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
};

export function parseDir(value: number | string): Dir | null {
  if (typeof value === "number") {
    return DIR_FROM_CODE[value] ?? null;
  }
  return DIR_FROM_WORD[value.trim().toUpperCase()] ?? null;
}

/**
 * SET header +48/+50/+52 (1=N 2=S 3=E 4=W). Camera / framelist space,
 * not the scene table (interiors may transpose names onto these tiles).
 * `gotointerior` does not pass a scene; Dust stands here.
 */
export const WORLD_TOWN = "town";

export const SET_SPAWN: Record<string, WalkerPose> = {
  _APOTH: { x: 2, y: 1, facing: "W" },
  _BANK: { x: 3, y: 1, facing: "W" },
  _CHIN: { x: 0, y: 1, facing: "E" },
  _COURT: { x: 2, y: 4, facing: "N" },
  _DOCTOR1: { x: 1, y: 0, facing: "W" },
  _DOCTOR2: { x: 0, y: 0, facing: "W" },
  _FLUTE: { x: 1, y: 3, facing: "N" },
  _HOTLOWER: { x: 0, y: 0, facing: "E" },
  _HOTROOM: { x: 1, y: 0, facing: "W" },
  _HOTUPPER: { x: 3, y: 0, facing: "N" },
  _HUB: { x: 3, y: 6, facing: "N" },
  _JAIL: { x: 0, y: 0, facing: "E" },
  _LIVERY: { x: 3, y: 1, facing: "W" },
  _MAYDINE: { x: 3, y: 1, facing: "E" },
  _MAYHALL: { x: 2, y: 3, facing: "N" },
  _MAYROOM: { x: 0, y: 1, facing: "N" },
  _MAYSTUDY: { x: 1, y: 1, facing: "W" },
  _MAYUPPER: { x: 2, y: 0, facing: "N" },
  _MINE: { x: 2, y: 4, facing: "N" },
  _NITE: { x: 6, y: 14, facing: "N" },
  _NITECOUR: { x: 2, y: 4, facing: "N" },
  _NITESCHO: { x: 1, y: 1, facing: "N" },
  _PADRE: { x: 0, y: 1, facing: "W" },
  _PAPER: { x: 1, y: 1, facing: "W" },
  _SALLOWER: { x: 3, y: 0, facing: "W" },
  _SALROOM: { x: 1, y: 0, facing: "W" },
  _SALUPPER: { x: 0, y: 3, facing: "W" },
  _SCHOOL: { x: 1, y: 1, facing: "N" },
  _SNAKE: { x: 1, y: 3, facing: "N" },
  _STAGE: { x: 0, y: 1, facing: "E" },
  _STORE: { x: 3, y: 1, facing: "W" },
  _TARGET: { x: 10, y: 11, facing: "S" },
  _TBIRD: { x: 1, y: 3, facing: "N" },
  _TOWN: { x: 6, y: 14, facing: "N" },
  _UNDERTAK: { x: 0, y: 1, facing: "E" },
};

/**
 * `sallower` / `_SALLOWER` / `sallower.set` are one SET. Town and nite
 * share the street grid (`propset "town"`).
 */
export function setFolderKey(name: string): string {
  const lower = name.trim().replace(/\.set$/i, "").toLowerCase();
  if (!lower) {
    return "";
  }
  if (lower === WORLD_TOWN || lower === "nite" || lower === "_nite" || lower === "_town") {
    return "town";
  }
  return lower.replace(/^_/, "");
}

export function setNamesEqual(a: string, b: string): boolean {
  const left = setFolderKey(a);
  const right = setFolderKey(b);
  return Boolean(left) && left === right;
}

export function setFolderFromWorld(world: string): string {
  const trimmed = world.trim();
  if (!trimmed || trimmed === WORLD_TOWN || /^town(\.set)?$/i.test(trimmed)) {
    return "_TOWN";
  }
  if (/^_?nite(\.set)?$/i.test(trimmed)) {
    return "_NITE";
  }
  const key = setFolderKey(trimmed);
  return key ? `_${key.toUpperCase()}` : "_TOWN";
}

/** SET header +26. Used as camZ in `0x40dcd0` Y. */
export const SET_CAMERA_Z: Record<string, number> = {
  _APOTH: 140,
  _BANK: 140,
  _CHIN: 230,
  _COURT: 90,
  _DOCTOR1: 95,
  _DOCTOR2: 95,
  _FLUTE: 100,
  _HOTLOWER: 160,
  _HOTROOM: 150,
  _HOTUPPER: 140,
  _HUB: 115,
  _JAIL: 140,
  _LIVERY: 160,
  _MAYDINE: 120,
  _MAYHALL: 130,
  _MAYROOM: 130,
  _MAYSTUDY: 130,
  _MAYUPPER: 130,
  _MINE: 150,
  _NITE: 62,
  _NITECOUR: 90,
  _NITESCHO: 115,
  _PADRE: 115,
  _PAPER: 260,
  _SALLOWER: 180,
  _SALROOM: 140,
  _SALUPPER: 150,
  _SCHOOL: 115,
  _SNAKE: 64,
  _STAGE: 150,
  _STORE: 160,
  _TARGET: 72,
  _TBIRD: 150,
  _TOWN: 62,
  _UNDERTAK: 220,
};

/**
 * World→still Y camZ. Prefer the SET map from `world` so a stale town
 * graph cannot drop interior door overlays (z ≈ camZ) off the still.
 */
export function cameraZOf(world: string, graph?: { cameraZ?: number }): number {
  const mapped = SET_CAMERA_Z[setFolderFromWorld(world)];
  if (mapped != null) {
    return mapped;
  }
  if (graph?.cameraZ != null && graph.cameraZ > 0) {
    return graph.cameraZ;
  }
  return SET_CAMERA_Z._TOWN;
}

export function buildSetGraph(
  scenes: SceneRecord[],
  records: TransitionRecord[],
  spawn?: WalkerPose,
  cameraZ?: number,
): SetGraph {
  const transitions: SetTransition[] = [];
  const byFrom = new Map<string, SetTransition[]>();
  const cameraTiles = new Set<string>();

  for (const rec of records) {
    const dirFrom = parseDir(rec.dir_from) ?? parseDir(rec.dir_from_name);
    const dirTo = parseDir(rec.dir_to) ?? parseDir(rec.dir_to_name);
    if (!dirFrom || !dirTo) {
      continue;
    }
    const tr: SetTransition = {
      xFrom: rec.x_from,
      yFrom: rec.y_from,
      dirFrom,
      xTo: rec.x_to,
      yTo: rec.y_to,
      dirTo,
      frame0: rec.frame0,
    };
    transitions.push(tr);
    const from = tileKey(tr.xFrom, tr.yFrom);
    const list = byFrom.get(from);
    if (list) {
      list.push(tr);
    } else {
      byFrom.set(from, [tr]);
    }
    cameraTiles.add(from);
    cameraTiles.add(tileKey(tr.xTo, tr.yTo));
  }

  const aligned = transposeInteriorScenes(scenes, cameraTiles);
  const sceneMap = new Map<string, SceneRecord>();
  for (const scene of aligned) {
    sceneMap.set(tileKey(scene.x, scene.y), scene);
  }

  return { scenes: sceneMap, cameraTiles, transitions, byFrom, spawn, cameraZ };
}

/**
 * Town / NITE / TARGET (225-cell) framelists use the same axes as the scene
 * table. Smaller interior SETs often store the framelist transposed. Detect
 * that by counting how many unblocked scenes land on filmed tiles.
 */
export function transposeInteriorScenes(
  scenes: SceneRecord[],
  cameraTiles: Set<string>,
): SceneRecord[] {
  if (scenes.length >= 200) {
    return scenes;
  }
  let native = 0;
  let swapped = 0;
  for (const scene of scenes) {
    if (scene.blocked) {
      continue;
    }
    if (cameraTiles.has(tileKey(scene.x, scene.y))) {
      native += 1;
    }
    if (cameraTiles.has(tileKey(scene.y, scene.x))) {
      swapped += 1;
    }
  }
  if (swapped <= native) {
    return scenes;
  }
  return scenes.map((scene) => ({ ...scene, x: scene.y, y: scene.x }));
}

export function sceneByName(graph: SetGraph, name: string): SceneRecord | undefined {
  const want = name.trim().toLowerCase();
  for (const scene of graph.scenes.values()) {
    if (scene.name.toLowerCase() === want) {
      return scene;
    }
  }
  return undefined;
}

export function findTransition(
  graph: SetGraph,
  x: number,
  y: number,
  dirFrom: Dir,
  xTo: number,
  yTo: number,
  dirTo: Dir,
): SetTransition | undefined {
  const list = graph.byFrom.get(tileKey(x, y));
  if (!list) {
    return undefined;
  }
  return list.find(
    (tr) =>
      tr.dirFrom === dirFrom && tr.xTo === xTo && tr.yTo === yTo && tr.dirTo === dirTo,
  );
}

/**
 * HQ still for a standing pose.
 *
 * Walks hang that keyframe on the 6th container of a walk *leaving*
 * this pose. Dead-end facings have no such walk; Dust put the same
 * keyframe on the clockwise (right) turn from this pose instead.
 * Using a turn that *ends* here is wrong — that slot is the other
 * facing’s from-still, which is how G11 sharpened to the wrong wall.
 */
export function hqFrame(graph: SetGraph, pose: WalkerPose): FrameRef | undefined {
  const outgoing = graph.byFrom.get(tileKey(pose.x, pose.y)) ?? [];
  const fromHere = outgoing.filter((tr) => tr.dirFrom === pose.facing);
  const walk = fromHere.find((tr) => tr.xTo !== tr.xFrom || tr.yTo !== tr.yFrom);
  if (walk) {
    return { frame0: walk.frame0, offset: 5 };
  }
  const rightFacing = TURN_RIGHT[pose.facing];
  const rightTurn = fromHere.find(
    (tr) => tr.xTo === pose.x && tr.yTo === pose.y && tr.dirTo === rightFacing,
  );
  if (rightTurn) {
    return { frame0: rightTurn.frame0, offset: 5 };
  }
  const anyTurn = fromHere.find((tr) => tr.xTo === pose.x && tr.yTo === pose.y);
  return anyTurn ? { frame0: anyTurn.frame0, offset: 0 } : holdFrame(graph, pose);
}

/** Last frame of a transition that ends in this pose (LQ dest, not HQ). */
export function holdFrame(graph: SetGraph, pose: WalkerPose): FrameRef | undefined {
  let best: SetTransition | undefined;
  for (const tr of graph.transitions) {
    if (tr.xTo !== pose.x || tr.yTo !== pose.y || tr.dirTo !== pose.facing) {
      continue;
    }
    const inplace = tr.xFrom === pose.x && tr.yFrom === pose.y;
    if (!best) {
      best = tr;
      continue;
    }
    const bestInplace = best.xFrom === pose.x && best.yFrom === pose.y;
    if (inplace && !bestInplace) {
      best = tr;
    }
  }
  return best ? { frame0: best.frame0, offset: 5 } : undefined;
}

export function resolveSpawn(graph: SetGraph): WalkerPose {
  if (graph.spawn && graph.cameraTiles.has(tileKey(graph.spawn.x, graph.spawn.y))) {
    if (hqFrame(graph, graph.spawn) !== undefined) {
      return graph.spawn;
    }
  }
  const named = sceneByName(graph, TOWN_SPAWN_SCENE);
  if (named && graph.cameraTiles.has(tileKey(named.x, named.y))) {
    const pose = { x: named.x, y: named.y, facing: TOWN_SPAWN_FACING };
    if (hqFrame(graph, pose) !== undefined) {
      return pose;
    }
  }
  return { ...TOWN_SPAWN_FALLBACK };
}

export function framesFolder(world: string, night: boolean): string {
  if (world === WORLD_TOWN) {
    return night ? "_NITE" : "_TOWN";
  }
  return world;
}

export function extractSetUrls(folder: string): { scenes: string; transitions: string } {
  return {
    scenes: extractUrl(`SET/${folder}/scenes.json`),
    transitions: extractUrl(`SET/${folder}/transitions.json`),
  };
}

export async function loadSetGraph(
  folder: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SetGraph> {
  const urls = extractSetUrls(folder);
  const [scenesRes, transRes] = await Promise.all([
    fetchImpl(urls.scenes),
    fetchImpl(urls.transitions),
  ]);
  if (!scenesRes.ok || !transRes.ok) {
    throw new Error(
      `SET extract missing for ${folder} (${scenesRes.status}/${transRes.status}). Re-dump that SET.`,
    );
  }
  const scenes = (await scenesRes.json()) as SceneRecord[];
  const transitions = (await transRes.json()) as TransitionRecord[];
  const header = SET_SPAWN[folder] && SET_CAMERA_Z[folder] != null
    ? undefined
    : await loadSetHeader(folder, fetchImpl);
  return buildSetGraph(
    scenes,
    transitions,
    SET_SPAWN[folder] ?? header?.spawn,
    SET_CAMERA_Z[folder] ?? header?.cameraZ,
  );
}

async function loadSetHeader(
  folder: string,
  fetchImpl: typeof fetch,
): Promise<{ spawn?: WalkerPose; cameraZ?: number } | undefined> {
  try {
    const res = await fetchImpl(extractUrl(`SET/${folder}/header.json`));
    if (!res.ok) {
      return undefined;
    }
    const raw = (await res.json()) as {
      x?: unknown;
      y?: unknown;
      facing?: unknown;
      cameraZ?: unknown;
    };
    const facing = parseDir(String(raw.facing ?? ""));
    const spawn =
      typeof raw.x === "number" && typeof raw.y === "number" && facing
        ? { x: raw.x, y: raw.y, facing }
        : undefined;
    const cameraZ = typeof raw.cameraZ === "number" && raw.cameraZ > 0 ? raw.cameraZ : undefined;
    return { spawn, cameraZ };
  } catch {
    /* optional sidecar */
  }
  return undefined;
}

export async function loadTownGraph(fetchImpl: typeof fetch = fetch): Promise<SetGraph> {
  return loadSetGraph("_TOWN", fetchImpl);
}

export function frameUrl(folder: string, frame0: number, offset: number): string {
  return extractUrl(`SET/${folder}/FRAMES/${frame0}_${offset}.png`);
}

export function zUrl(folder: string, frame0: number, offset: number): string {
  return extractUrl(`SET/${folder}/FRAMES/z/${frame0}_${offset}.png`);
}

export function zUrlFromStill(stillUrl: string): string {
  return stillUrl.replace("/FRAMES/", "/FRAMES/z/");
}

export function poseLabel(graph: SetGraph, pose: WalkerPose, world: string = WORLD_TOWN): string {
  const scene = graph.scenes.get(tileKey(pose.x, pose.y));
  const name = scene?.name ?? `Tile ${pose.x},${pose.y}`;
  if (world === WORLD_TOWN) {
    return `${name} · ${pose.facing}`;
  }
  const place = world.startsWith("_") ? world.slice(1) : world;
  return `${place} · ${name} · ${pose.facing}`;
}
