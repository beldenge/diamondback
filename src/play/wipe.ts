import { STAGE_WIDTH } from "./stage";

/**
 * DF.EXE `FUN_0040eec0` / `FUN_0040edf0`: barn-door wipes always run
 * **8** blits. Strip width is `width/16 + 1` (33px on the 512 stage).
 * `visualeffect (barndooropen, 30)` waits `n/8` ticks (min 1) per blit.
 */
export const BARN_DOOR_STEPS = 8;

export function barnDoorStripPx(width = STAGE_WIDTH): number {
  return (Math.trunc(width) >> 4) + 1;
}

export function barnDoorStepTicks(ticks: number): number {
  return Math.max(1, Math.trunc(Math.max(1, ticks) / BARN_DOOR_STEPS));
}

/**
 * Visible overlay band after `step` blits (0 = start, 8 = done).
 *
 * Open (`FUN_0040eec0`): new still grows from the center.
 * Close (`FUN_0040edf0`): old overlay shrinks; the dest shows at the edges.
 */
export function barnDoorOverlayRange(
  kind: "open" | "close",
  step: number,
  width = STAGE_WIDTH,
): { left: number; right: number } {
  const w = Math.max(1, Math.trunc(width) || STAGE_WIDTH);
  const strip = barnDoorStripPx(w);
  const mid = w / 2;
  const s = Math.max(0, Math.min(BARN_DOOR_STEPS, Math.trunc(step) || 0));
  if (kind === "open") {
    const half = s * strip;
    return { left: Math.max(0, mid - half), right: Math.min(w, mid + half) };
  }
  const band = s * strip;
  return { left: Math.min(mid, band), right: Math.max(mid, w - band) };
}

/** CSS `clip-path` for the painted overlay (new on open, old on close). */
export function barnDoorClipPath(
  kind: "open" | "close",
  step: number,
  width = STAGE_WIDTH,
): string {
  const { left, right } = barnDoorOverlayRange(kind, step, width);
  if (right <= left) {
    return "inset(0 50% 0 50%)";
  }
  const l = (left / width) * 100;
  const r = ((width - right) / width) * 100;
  return `inset(0 ${r}% 0 ${l}%)`;
}

export function applyBarnDoorClip(
  el: HTMLElement,
  kind: "open" | "close",
  step: number,
): void {
  const path = barnDoorClipPath(kind, step);
  el.style.clipPath = path;
  el.style.setProperty("-webkit-clip-path", path);
}

export function clearBarnDoorClip(el: HTMLElement): void {
  el.style.clipPath = "none";
  el.style.setProperty("-webkit-clip-path", "none");
}
