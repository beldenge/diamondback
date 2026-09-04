import { frameUrl, hqFrame, zUrlFromStill } from "./graph";
import { applyTransition, transitionForInput, type WalkInput } from "./walker";
import { framesToPlay, type SetGraph, type SetTransition, type WalkerPose } from "./types";

const NEIGHBOR_INPUTS: readonly WalkInput[] = ["left", "right", "forward"];

/** Motion plates only (`framesToPlay`). Dest HQ is a separate lookup. */
export function transitionStillUrls(tr: SetTransition, folder: string): string[] {
  const urls: string[] = [];
  const count = framesToPlay(tr);
  if (tr.reverse) {
    for (let i = count - 1; i >= 0; i -= 1) {
      urls.push(frameUrl(folder, tr.frame0, i));
    }
    return urls;
  }
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
 * Idle standing prefetch: the tap you can start now (motion plates).
 * Standing HQ is fetched only after idle — Dust delayed that blit.
 * A walk/turn already high-prefetches the dest pose's depth-1 strips,
 * so depth 2 is not needed for chained input.
 */
export const IDLE_NEIGHBOR_DEPTH = 1;

/**
 * Filmed left / right / forward motion plates out to `depth`.
 * Depth 1 is the move you can start now; depth 2 is the move after that.
 * Does not include standing HQ (`poseHqUrl`) — that is idle-only.
 * Order is plate 0 of each strip, then plate 1, … so the first still of
 * any tap is queued before the rest of those flipbooks.
 */
export function neighborStillUrls(
  graph: SetGraph,
  origin: WalkerPose,
  folder: string,
  depth: number,
): string[] {
  const strips: string[][] = [];
  const seenPose = new Set<string>();
  const queue: { pose: WalkerPose; depth: number }[] = [{ pose: origin, depth: 0 }];
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
    if (item.depth >= depth) {
      continue;
    }
    for (const input of NEIGHBOR_INPUTS) {
      const tr = transitionForInput(graph, item.pose, input);
      if (!tr) {
        continue;
      }
      strips.push(transitionStillUrls(tr, folder));
      queue.push({ pose: applyTransition(tr), depth: item.depth + 1 });
    }
  }
  // Plate 0 of every next move before plate 1, so a tap's first still
  // is warm even if the rest of that strip is still queued.
  const urls: string[] = [];
  const seenUrl = new Set<string>();
  let maxLen = 0;
  for (const strip of strips) {
    maxLen = Math.max(maxLen, strip.length);
  }
  for (let i = 0; i < maxLen; i += 1) {
    for (const strip of strips) {
      const url = strip[i];
      if (!url || seenUrl.has(url)) {
        continue;
      }
      seenUrl.add(url);
      urls.push(url);
    }
  }
  return urls;
}

/**
 * Every filmed plate of a SET, colour and Z, ordered by how far it is
 * from the spawn — breadth-first through the same left/right/forward
 * moves the walker can actually make.
 *
 * This is the list the extract cache warms in the background. Order is
 * the whole point: a player who leaves after thirty seconds should still
 * have got the tiles around the gate, and one who walks the length of
 * Main Street should stay ahead of the fetch.
 */
export function warmUrlsFromSpawn(
  graph: SetGraph,
  spawn: WalkerPose,
  folder: string,
  limit = Number.POSITIVE_INFINITY,
): string[] {
  const urls: string[] = [];
  const seenUrl = new Set<string>();
  const seenPose = new Set<string>();
  const queue: WalkerPose[] = [spawn];
  seenPose.add(`${spawn.x},${spawn.y},${spawn.facing}`);

  const push = (url: string): void => {
    if (seenUrl.has(url)) {
      return;
    }
    seenUrl.add(url);
    urls.push(url, zUrlFromStill(url));
  };

  while (queue.length > 0 && urls.length < limit) {
    const pose = queue.shift();
    if (!pose) {
      break;
    }
    // The standing still for this pose, then everything you can do from it.
    const hq = poseHqUrl(graph, pose, folder);
    if (hq) {
      push(hq);
    }
    for (const input of NEIGHBOR_INPUTS) {
      const tr = transitionForInput(graph, pose, input);
      if (!tr) {
        continue;
      }
      for (const url of transitionStillUrls(tr, folder)) {
        push(url);
      }
      const next = applyTransition(tr);
      const key = `${next.x},${next.y},${next.facing}`;
      if (!seenPose.has(key)) {
        seenPose.add(key);
        queue.push(next);
      }
    }
  }
  return urls;
}
