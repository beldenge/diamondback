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

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseDir(value: number | string): Dir | null {
  if (typeof value === "number") {
    return DIR_FROM_CODE[value] ?? null;
  }
  const upper = value.toUpperCase();
  if (upper === "N" || upper === "S" || upper === "E" || upper === "W") {
    return upper;
  }
  return null;
}

export function buildSetGraph(scenes: SceneRecord[], records: TransitionRecord[]): SetGraph {
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

  return { scenes: sceneMap, cameraTiles, transitions, byFrom };
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
  const named = sceneByName(graph, TOWN_SPAWN_SCENE);
  if (named && graph.cameraTiles.has(tileKey(named.x, named.y))) {
    const pose = { x: named.x, y: named.y, facing: TOWN_SPAWN_FACING };
    if (hqFrame(graph, pose) !== undefined) {
      return pose;
    }
  }
  return { ...TOWN_SPAWN_FALLBACK };
}

export const WORLD_TOWN = "town";

export function framesFolder(world: string, night: boolean): string {
  if (world === WORLD_TOWN) {
    return night ? "_NITE" : "_TOWN";
  }
  return world;
}

export function extractSetUrls(folder: string): { scenes: string; transitions: string } {
  return {
    scenes: `/extract/SET/${folder}/scenes.json`,
    transitions: `/extract/SET/${folder}/transitions.json`,
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
  return buildSetGraph(scenes, transitions);
}

export async function loadTownGraph(fetchImpl: typeof fetch = fetch): Promise<SetGraph> {
  return loadSetGraph("_TOWN", fetchImpl);
}

export function frameUrl(folder: string, frame0: number, offset: number): string {
  return `/extract/SET/${folder}/FRAMES/${frame0}_${offset}.png`;
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
