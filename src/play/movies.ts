import { extractUrl } from "../world/set/extract";

export interface MovieHotspot {
  /** Mac rect on the 512×264 still (top, left, bottom, right). */
  top: number;
  left: number;
  bottom: number;
  right: number;
  /** 0-based frame index to jump to (DF.EXE last>=2). */
  dest: number;
  /** Group-A channel to play (`A1`…). Empty = dismiss. */
  channel?: string;
  /** Type-4 nested playmovie (`bellmoon.mov` from towertop). */
  movie?: string;
}

export interface MovieFrame {
  container: number;
  hold_ticks: number;
  start_tick: number;
  /** MOV rec+0: DF.EXE command count. 1 on inspect stills (WARNING/BONE). */
  action?: number;
  /** Type-2 slot-0 last=2 with cmd count 1: hold this still until click. */
  wait?: boolean;
  /**
   * rec+0x1A bit 0: after this still's A cue, block until group-A mixer
   * idle (DF.EXE 0x419300 / MOVPLAY 0x40BF6C). dog1 recs 2 and 4.
   */
  wait_audio?: boolean;
  /** bell.mov / grocpots: click rects on a wait still. */
  hotspots?: MovieHotspot[];
  /** Rec+0x16. Kind 3 on a timed window plays timeout_movie if you miss. */
  end_kind?: number;
  /** Type-3 Pascal reel (kiddie.mov → kidwin.mov). */
  timeout_movie?: string;
}

export interface MovieClip {
  container: number;
  start_tick: number;
  channel?: string;
}

export interface MovieTimeline {
  tick_hz?: number;
  duration_ticks: number;
  duration_seconds?: number;
  frames: MovieFrame[];
  clips?: MovieClip[];
  /** Rec+0x16==3 Pascal at rec+0x30. playmovie loads this when the reel ends. */
  next?: string;
}

/** Still-table length in seconds (timeline sidecar, else sum of holds). */
export function movieDurationSec(timeline: MovieTimeline): number {
  if (typeof timeline.duration_seconds === "number" && timeline.duration_seconds > 0) {
    return timeline.duration_seconds;
  }
  const hz = timeline.tick_hz || 60;
  if (timeline.duration_ticks > 0) {
    return timeline.duration_ticks / hz;
  }
  let ticks = 0;
  for (const frame of timeline.frames ?? []) {
    ticks += frame.hold_ticks || 0;
  }
  return ticks / hz;
}

export function formatMovieClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec + 1e-6));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

export function movieFolder(name: string): string {
  const stem = name.replace(/\.mov$/i, "").toUpperCase();
  return `MOV/_${stem}`;
}

/** `towertop.mov` / `TOWERTOP` → `towertop.mov`. Reject leftover header junk. */
export function movieChainName(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  const match = /^([A-Za-z0-9_]+(?:\.mov)?)$/i.exec(trimmed);
  if (!match) {
    return undefined;
  }
  const stem = match[1]!.replace(/\.mov$/i, "");
  if (!stem) {
    return undefined;
  }
  return `${stem.toLowerCase()}.mov`;
}

export function isIntroMovie(name: string): boolean {
  const stem = name.replace(/\.mov$/i, "").toLowerCase();
  return stem === "intro" || stem === "intro2" || stem === "intro3";
}

/**
 * Inspect stills wait for a click. Rec+0 is DF.EXE's *command count*,
 * not a boolean: grocpots/bells use 2–4 for jump/SFX commands. Prefer the
 * extract `wait` flag. Old sidecars: only `action === 1` (WARNING/BONE).
 */
export function movieFrameWaitsForClick(
  action: number | undefined,
  wait?: boolean,
): boolean {
  if (wait === true) {
    return true;
  }
  if (wait === false) {
    return false;
  }
  return action === 1;
}

/** rec+0x1A bit 0: hold this still until group-A mixer channel 0 is idle. */
export function movieFrameWaitsForAudio(waitAudio?: boolean): boolean {
  return waitAudio === true;
}

/**
 * MOVPLAY `mov [0x431310], 0x4000` (`0x40F069`) is WAVEHDR.dwBufferLength.
 * Device is 22050 Hz 8-bit (`0x40F76A` rate-factor 2 × 11025, not 16-bit).
 * One empty-device `waveOutWrite` (`0x40F3B4` Pause/Write/Restart when
 * `[0x43131c]==0`) is therefore 0x4000 / 22050 s. The 0x200/0x400/0x800
 * figures at `0x40F5D6` are mix grains, not the waveOut header.
 */
export const MOV_WAVEHDR_BYTES = 0x4000;
export const MOV_WAVE_RATE = 22050;
export const MOV_A_IDLE_RESTART_SEC = MOV_WAVEHDR_BYTES / MOV_WAVE_RATE;

/** Clip indices whose start matches this rec's start (not a wall-clock window). */
export function movieClipsAtStart(
  startSec: number[],
  atSec: number,
  eps = 1e-6,
): number[] {
  const due: number[] = [];
  for (let i = 0; i < startSec.length; i += 1) {
    if (Math.abs(startSec[i]! - atSec) <= eps) {
      due.push(i);
    }
  }
  return due;
}

export function macRectContains(
  x: number,
  y: number,
  box: { top: number; left: number; bottom: number; right: number },
): boolean {
  return x >= box.left && x < box.right && y >= box.top && y < box.bottom;
}

export function pickMovieHotspot(
  x: number,
  y: number,
  spots: readonly MovieHotspot[],
): MovieHotspot | undefined {
  return spots.find((spot) => macRectContains(x, y, spot));
}

/** CSS `object-fit: contain` → still pixels. */
export function movieClickToStill(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
  srcW: number,
  srcH: number,
): { x: number; y: number } | null {
  if (box.width <= 0 || box.height <= 0 || srcW <= 0 || srcH <= 0) {
    return null;
  }
  const scale = Math.min(box.width / srcW, box.height / srcH);
  const dispW = srcW * scale;
  const dispH = srcH * scale;
  const ox = box.left + (box.width - dispW) / 2;
  const oy = box.top + (box.height - dispH) / 2;
  return {
    x: (clientX - ox) / scale,
    y: (clientY - oy) / scale,
  };
}

export function movieHotspotSegmentEnd(
  dest: number,
  spots: readonly MovieHotspot[],
  frameCount: number,
): number {
  const later = spots
    .map((spot) => spot.dest)
    .filter((value) => value > dest)
    .sort((a, b) => a - b);
  return later[0] ?? frameCount;
}

/**
 * After `actionframe`, swallow a leftover `click` only when we finished
 * on pointerup (the click still fires). `pointerdown` + preventDefault
 * and a captured `click` already consumed that press — skipNextClick
 * would eat the next real EXAMINE / world click.
 */
export function movieWaitSetsSkipClick(eventType: string): boolean {
  return eventType === "pointerup";
}

/**
 * Script `actionframe (n)` after `playmovie` / `spotmovie`. Dust movies
 * that finish (including inspect wait-click) set **1**. Empty / skipped
 * reels stay 0. Every dump site checks `actionframe (1)`.
 */
export function actionFrameAfterPlay(played: boolean, failed = false): number {
  return played && !failed ? 1 : 0;
}

export function frameUrl(folder: string, container: number): string {
  return extractUrl(`${folder}/FRAMES/frame_${container}.png`);
}

export function clipUrl(folder: string, container: number): string {
  return extractUrl(`${folder}/AUDIO/clip_${container}.wav`);
}

/** When extract has no timeline, stills are `frame_1.png`… */
export function fallbackTimeline(frameCount: number, hold = 20): MovieTimeline {
  const frames: MovieFrame[] = [];
  let tick = 0;
  for (let i = 1; i <= frameCount; i += 1) {
    frames.push({ container: i, hold_ticks: hold, start_tick: tick });
    tick += hold;
  }
  return { tick_hz: 60, duration_ticks: tick, frames };
}

/** Frame index at `nowSec` from consecutive holds (60 Hz ticks as seconds). */
export function movieIndexAt(holdSec: number[], nowSec: number): number {
  if (holdSec.length === 0) {
    return 0;
  }
  let acc = 0;
  for (let i = 0; i < holdSec.length; i += 1) {
    acc += holdSec[i]!;
    if (nowSec < acc) {
      return i;
    }
  }
  return holdSec.length - 1;
}

/**
 * Clip indices whose start falls in `(prevSec, nowSec]`.
 * MOVPLAY group A: same channel again restarts that slot (does not stack).
 * Timed playback should prefer `movieClipsAtStart` per rec — wait_audio
 * stretches wall-clock so a global window fires the next A cue too early.
 */
export function movieClipsStarting(
  startSec: number[],
  prevSec: number,
  nowSec: number,
): number[] {
  const due: number[] = [];
  for (let i = 0; i < startSec.length; i += 1) {
    const at = startSec[i]!;
    if (at > prevSec && at <= nowSec) {
      due.push(i);
    }
  }
  return due;
}


