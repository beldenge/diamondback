/**
 * Town / NITE / TARGET scene strings in Dust *scripts* are
 * column-letter + 1-based row (`scene g15` = x=6, y=14 = filmed O7).
 *
 * SET Pascal names in `scenes.json` are the transpose: row-letter +
 * 1-based column (`Scene O7` at the same cell). Jail handlers live in
 * `Scene G12.txt` (script name) while the filmed facade is L7.
 *
 * Do not look up `scene g15` with `sceneByName` on a 225-cell graph —
 * that matches Pascal `Scene G15` at (14, 6).
 */

import { parseDir, resolveSpawn, sceneByName, tileKey } from "../world/set/graph";
import type { Dir, SetGraph, WalkerPose } from "../world/set/types";

const LETTERS = "abcdefghijklmno";

export function isTownGridSize(sceneCount: number): boolean {
  return sceneCount >= 200;
}

export function parseScriptScene(
  name: string,
): { x: number; y: number } | undefined {
  const match = name
    .trim()
    .toLowerCase()
    .match(/^(?:scene\s+)?([a-o])(\d{1,2})$/);
  if (!match) {
    return undefined;
  }
  const x = LETTERS.indexOf(match[1]!);
  const y = Number(match[2]) - 1;
  if (x < 0 || y < 0 || y > 14) {
    return undefined;
  }
  return { x, y };
}

/** Script-convention name for a filmed town pose (`(6,14)` → `scene g15`). */
export function scriptSceneName(x: number, y: number): string {
  const letter = LETTERS[x] ?? "a";
  return `scene ${letter}${y + 1}`;
}

export function pascalSceneName(x: number, y: number): string {
  const letter = LETTERS[y] ?? "a";
  return `scene ${letter}${x + 1}`;
}

const FACE_WORD: Record<Dir, string> = {
  N: "North",
  S: "South",
  E: "East",
  W: "West",
};

function worldLabel(world: string): string {
  return world.replace(/^_/, "").replace(/\.set$/i, "").toUpperCase() || "TOWN";
}

function shortSceneName(name: string, x: number, y: number): string {
  const match = name.trim().match(/^(?:scene\s+)?([a-o])\s*(\d{1,2})$/i);
  if (match) {
    return `${match[1]!.toUpperCase()}${Number(match[2])}`;
  }
  return `Tile ${x},${y}`;
}

/**
 * Pose line under the 512×384 stage (not inside the still). Town shows
 * filmed Pascal + script `g15` because those grids are transposed.
 */
export function poseReadout(graph: SetGraph, pose: WalkerPose, world: string): string {
  const scene = graph.scenes.get(tileKey(pose.x, pose.y));
  const face = FACE_WORD[pose.facing] ?? pose.facing;
  const place = worldLabel(world);
  if (isTownGridSize(graph.scenes.size)) {
    const filmed = shortSceneName(pascalSceneName(pose.x, pose.y), pose.x, pose.y);
    const script = shortSceneName(scriptSceneName(pose.x, pose.y), pose.x, pose.y);
    return `${place} · ${filmed} (${script}) · ${face}`;
  }
  const named = shortSceneName(scene?.name ?? "", pose.x, pose.y);
  return `${place} · ${named} · ${face}`;
}

/**
 * Camera pose after `opensetfile`. Town script names (`scene g8`) are
 * not tiles on an interior graph — `gotointerior` stands at the SET
 * spawn (header +48), not the street cell you left.
 */
export function isStreetSet(setName: string): boolean {
  const key = setName.replace(/\.set$/i, "").toLowerCase().replace(/^_/, "");
  return key === "town" || key === "nite";
}

export function poseForOpenedSet(
  graph: SetGraph,
  sceneName: string,
  facing: string,
): WalkerPose {
  const dir = parseDir(facing) ?? graph.spawn?.facing ?? "N";
  if (isTownGridSize(graph.scenes.size)) {
    const parsed = parseScriptScene(sceneName);
    if (parsed && graph.cameraTiles.has(tileKey(parsed.x, parsed.y))) {
      return { x: parsed.x, y: parsed.y, facing: dir };
    }
  } else {
    const rec = sceneByName(graph, sceneName);
    if (rec && graph.cameraTiles.has(tileKey(rec.x, rec.y))) {
      return { x: rec.x, y: rec.y, facing: dir };
    }
  }
  if (graph.spawn && graph.cameraTiles.has(tileKey(graph.spawn.x, graph.spawn.y))) {
    return graph.spawn;
  }
  return resolveSpawn(graph);
}

/**
 * `opensetfile` should stand now unless this is a leftover interior
 * script name on a town graph (`gototown` will `currentscene` next).
 * Standing at O7 first is the saloon-exit hitch: `scene d1` parses as
 * town D1, misses the camera grid, falls through to spawn, then the
 * real street cell loads.
 *
 * TARGET dumps a 225-cell table like town. Leftover `scene k11` is the
 * street range tile, not a filmed TARGET pose — always stand interiors.
 */
export function openSetShouldStand(
  graph: SetGraph,
  sceneName: string,
  setName = "",
): boolean {
  if (setName && !isStreetSet(setName)) {
    return true;
  }
  if (!isTownGridSize(graph.scenes.size)) {
    return true;
  }
  const parsed = parseScriptScene(sceneName);
  if (!parsed) {
    return true;
  }
  return graph.cameraTiles.has(tileKey(parsed.x, parsed.y));
}
