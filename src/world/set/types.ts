export type Dir = "N" | "S" | "E" | "W";

export const DIRS: readonly Dir[] = ["N", "S", "E", "W"];

export const DIR_FROM_CODE: Record<number, Dir> = {
  1: "N",
  2: "S",
  3: "E",
  4: "W",
};

/** Turn left / right as Dust's arrow keys do (N→W left, N→E right). */
export const TURN_LEFT: Record<Dir, Dir> = { N: "W", W: "S", S: "E", E: "N" };
export const TURN_RIGHT: Record<Dir, Dir> = { N: "E", E: "S", S: "W", W: "N" };
export const FACE_OPPOSITE: Record<Dir, Dir> = { N: "S", S: "N", E: "W", W: "E" };

/** +x east, +y south (SET tile space). */
export const WALK_DELTA: Record<Dir, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
};

export interface SceneRecord {
  x: number;
  y: number;
  interact: number;
  unknown_c: number;
  blocked: number;
  unknown_e: number;
  name: string;
  script_container: number;
}

export interface TransitionRecord {
  x_from: number;
  y_from: number;
  dir_from: number;
  x_to: number;
  y_to: number;
  dir_to: number;
  dir_from_name: string;
  dir_to_name: string;
  frame0: number;
}

export interface SetTransition {
  xFrom: number;
  yFrom: number;
  dirFrom: Dir;
  xTo: number;
  yTo: number;
  dirTo: Dir;
  frame0: number;
  /** Play the clockwise strip backwards (hub only films right turns). */
  reverse?: boolean;
}

export interface WalkerPose {
  x: number;
  y: number;
  facing: Dir;
}

export interface SetGraph {
  scenes: Map<string, SceneRecord>;
  /** Camera nodes that have at least one filmed transition. */
  cameraTiles: Set<string>;
  transitions: SetTransition[];
  byFrom: Map<string, SetTransition[]>;
  /** SET header +48 camera spawn (framelist space). */
  spawn?: WalkerPose;
  /** SET header +26 camera Z. Town/nite 62; interiors 90–260. */
  cameraZ?: number;
}

/** One still inside a 6-frame strip (`FRAMES/{frame0}_{offset}.png`). */
export interface FrameRef {
  frame0: number;
  offset: number;
}

/** South gate under the Diamondback sign, looking into town. */
export const TOWN_SPAWN_SCENE = "scene o7";
export const TOWN_SPAWN_FACING: Dir = "N";
export const TOWN_SPAWN_FALLBACK: WalkerPose = { x: 6, y: 14, facing: "N" };

export const STILL_WIDTH = 512;
export const STILL_HEIGHT = 264;
/**
 * One SET motion plate. DF.EXE `0x40dd90` increments `[0x4493dc]` once
 * per display pump, and that pump waits boot `framerate (3)` ticks of
 * the 60 Hz `timeGetTime*3/50` counter (`0x40e1d2`). Five plates = 250 ms.
 * Not 24 fps. Dest HQ is the standing blit after index hits 5, not a
 * sixth timed plate.
 */
export const STILL_FRAME_SEC = 3 / 60;
/** Containers in a framelist record: 5 motion + 1 HQ still. */
export const FRAMES_PER_TRANSITION = 6;

/**
 * Motion only. The 6th container is a HQ still of the *from* pose on
 * walks (playing it snaps you back). After the 5 motion frames Dust
 * copies dest and sets index `-1`; we blit the landing pose’s HQ then.
 */
export function framesToPlay(_tr: SetTransition): number {
  return FRAMES_PER_TRANSITION - 1;
}
