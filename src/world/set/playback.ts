/** Flipbook: one displayed frame per interval. Never skips ahead. */

export interface StillAnim {
  urls: string[];
  index: number;
  elapsed: number;
  /** False until the current index is on screen. Clock does not run until then. */
  ready: boolean;
}

export function createStillAnim(urls: string[]): StillAnim {
  return { urls, index: 0, elapsed: 0, ready: false };
}

/**
 * Still actually on screen. `tickStillAnim` may step `index` before the
 * next PNG is uploaded; sprites must stay on the previous plate until
 * `ready` so they do not jump a frame ahead of the film.
 */
export function displayedFilmstripIndex(anim: Pick<StillAnim, "index" | "ready">): number {
  if (!anim.ready && anim.index > 0) {
    return anim.index - 1;
  }
  return anim.index;
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
