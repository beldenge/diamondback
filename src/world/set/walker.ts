import { findTransition } from "./graph";
import {
  TURN_LEFT,
  TURN_RIGHT,
  WALK_DELTA,
  type Dir,
  type SetGraph,
  type SetTransition,
  type WalkerPose,
} from "./types";

export type WalkInput = "left" | "right" | "forward";

export function turnFacing(facing: Dir, side: "left" | "right"): Dir {
  return side === "left" ? TURN_LEFT[facing] : TURN_RIGHT[facing];
}

export function stepPose(pose: WalkerPose): WalkerPose {
  const delta = WALK_DELTA[pose.facing];
  return { x: pose.x + delta.dx, y: pose.y + delta.dy, facing: pose.facing };
}

export function transitionForInput(
  graph: SetGraph,
  pose: WalkerPose,
  input: WalkInput,
): SetTransition | undefined {
  if (input === "forward") {
    const next = stepPose(pose);
    return findTransition(graph, pose.x, pose.y, pose.facing, next.x, next.y, pose.facing);
  }
  const dest = turnFacing(pose.facing, input);
  return findTransition(graph, pose.x, pose.y, pose.facing, pose.x, pose.y, dest);
}

export function applyTransition(tr: SetTransition): WalkerPose {
  return { x: tr.xTo, y: tr.yTo, facing: tr.dirTo };
}

/** Tile change, not an in-place turn. Dust `closescene` / `openscene` are this. */
export function isTileStep(from: WalkerPose, to: WalkerPose): boolean {
  return from.x !== to.x || from.y !== to.y;
}

/**
 * Remake still-click bands (left 22% / right 22% / top 48%).
 * Play and the town sandbox no longer walk from these — Dust used
 * chrome *outside* 0–512, and the bands steal scene hotspots.
 */
export function stillClickInput(nx: number, ny: number): WalkInput | null {
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
    return null;
  }
  if (nx < 0.22) {
    return "left";
  }
  if (nx > 0.78) {
    return "right";
  }
  if (ny < 0.48) {
    return "forward";
  }
  return null;
}

/** Client-pixel swipe: across turns, up walks. Down is not a back step. */
export const SWIPE_THRESHOLD = 48;

export function swipeWalkInput(
  dx: number,
  dy: number,
  threshold = SWIPE_THRESHOLD,
): WalkInput | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < threshold && ay < threshold) {
    return null;
  }
  if (ax > ay) {
    return dx < 0 ? "left" : "right";
  }
  return dy < 0 ? "forward" : null;
}

/** Boot `keydown` names. Chrome clicks used these; swipe does too. */
export function walkInputKey(input: WalkInput): "uparrow" | "leftarrow" | "rightarrow" {
  if (input === "forward") {
    return "uparrow";
  }
  return input === "left" ? "leftarrow" : "rightarrow";
}

/** Arrow keys and WASD. Boot remaps configured keys onto uparrow/left/right. */
export function walkInputFromCode(code: string): WalkInput | null {
  if (code === "ArrowLeft" || code === "KeyA") {
    return "left";
  }
  if (code === "ArrowRight" || code === "KeyD") {
    return "right";
  }
  if (code === "ArrowUp" || code === "KeyW") {
    return "forward";
  }
  return null;
}

/** Hold-to-repeat: Dust `keyrepeat` → `keydown` while the key is still down. */
export function walkInputFromKeys(keys: Iterable<string>): WalkInput | null {
  const set = keys instanceof Set ? keys : new Set(keys);
  if (set.has("ArrowUp") || set.has("KeyW")) {
    return "forward";
  }
  if (set.has("ArrowLeft") || set.has("KeyA")) {
    return "left";
  }
  if (set.has("ArrowRight") || set.has("KeyD")) {
    return "right";
  }
  return null;
}

/** Finger / stylus. Mouse keeps click-to-inspect; keys still walk. */
export function isSwipePointer(pointerType: string): boolean {
  return pointerType === "touch" || pointerType === "pen";
}

/** Dust `pointx` / `pointy` space: 512×264, origin top-left. */
export function stillClickPixel(
  nx: number,
  ny: number,
  width: number,
  height: number,
): { x: number; y: number } | null {
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
    return null;
  }
  return { x: nx * width, y: ny * height };
}
