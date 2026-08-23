import { frameUrl, hqFrame } from "./graph";
import { applyTransition, transitionForInput, type WalkInput } from "./walker";
import { framesToPlay, type SetGraph, type SetTransition, type WalkerPose } from "./types";

const NEIGHBOR_INPUTS: readonly WalkInput[] = ["left", "right", "forward"];

/** Motion plates only (`framesToPlay`). Dest HQ is a separate lookup. */
export function transitionStillUrls(tr: SetTransition, folder: string): string[] {
  const urls: string[] = [];
  const count = framesToPlay(tr);
  for (let i = 0; i < count; i += 1) {
    urls.push(frameUrl(folder, tr.frame0, i));
  }
  return urls;
}

export function poseHqUrl(graph: SetGraph, pose: WalkerPose, folder: string): string | undefined {
  const frame = hqFrame(graph, pose);
  return frame ? frameUrl(folder, frame.frame0, frame.offset) : undefined;
}

/**
 * Standing HQ plus filmed left / right / forward strips out to `depth`.
 * Depth 1 is the move you can start now; depth 2 is the move after that
 * (so a chained turn/walk does not wait on a cold PNG).
 */
export function neighborStillUrls(
  graph: SetGraph,
  origin: WalkerPose,
  folder: string,
  depth: number,
): string[] {
  const urls: string[] = [];
  const seenPose = new Set<string>();
  const seenUrl = new Set<string>();
  const queue: { pose: WalkerPose; depth: number }[] = [{ pose: origin, depth: 0 }];
  const push = (url: string): void => {
    if (seenUrl.has(url)) {
      return;
    }
    seenUrl.add(url);
    urls.push(url);
  };
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) {
      break;
    }
    const key = `${item.pose.x},${item.pose.y},${item.pose.facing}`;
    if (seenPose.has(key)) {
      continue;
    }
    seenPose.add(key);
    const hq = poseHqUrl(graph, item.pose, folder);
    if (hq) {
      push(hq);
    }
    if (item.depth >= depth) {
      continue;
    }
    for (const input of NEIGHBOR_INPUTS) {
      const tr = transitionForInput(graph, item.pose, input);
      if (!tr) {
        continue;
      }
      for (const url of transitionStillUrls(tr, folder)) {
        push(url);
      }
      queue.push({ pose: applyTransition(tr), depth: item.depth + 1 });
    }
  }
  return urls;
}
