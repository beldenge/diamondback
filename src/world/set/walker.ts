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

/** Click in still-normalized 0–1 coords (origin top-left). */
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
