/** Timed playback of a 6-frame walk/turn. One displayed frame per interval. */

export interface StillAnim {
  urls: string[];
  index: number;
  elapsed: number;
  /** False until the first frame is on screen. Later frames may still be loading. */
  ready: boolean;
}

export function createStillAnim(urls: string[]): StillAnim {
  return { urls, index: 0, elapsed: 0, ready: false };
}

export function tickStillAnim(
  anim: StillAnim,
  dt: number,
  frameSec: number,
): { frameChanged: boolean; done: boolean } {
  if (!anim.ready || anim.urls.length === 0 || frameSec <= 0) {
    return { frameChanged: false, done: false };
  }
  anim.elapsed += dt;
  if (anim.elapsed < frameSec) {
    return { frameChanged: false, done: false };
  }
  // Consume one slot only. Catch-up would skip the walk.
  anim.elapsed = 0;
  if (anim.index < anim.urls.length - 1) {
    anim.index += 1;
    return { frameChanged: true, done: false };
  }
  return { frameChanged: false, done: true };
}
