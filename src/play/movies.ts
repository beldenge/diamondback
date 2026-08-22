import { extractUrl } from "../world/set/extract";

export interface MovieFrame {
  container: number;
  hold_ticks: number;
  start_tick: number;
}

export interface MovieClip {
  container: number;
  start_tick: number;
  channel?: string;
}

export interface MovieTimeline {
  tick_hz?: number;
  duration_ticks: number;
  frames: MovieFrame[];
  clips?: MovieClip[];
}

export function movieFolder(name: string): string {
  const stem = name.replace(/\.mov$/i, "").toUpperCase();
  return `MOV/_${stem}`;
}

export function isIntroMovie(name: string): boolean {
  const stem = name.replace(/\.mov$/i, "").toLowerCase();
  return stem === "intro" || stem === "intro2" || stem === "intro3";
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

export interface MovieClipPlay {
  url?: string;
  startSec: number;
  channel?: string;
  durationSec: number;
}

export interface MoviePass {
  holdSec: number[];
  clips: MovieClipPlay[];
  /** Still table, stretched to let the last one-shot finish. */
  passSec: number;
}

function stillSec(holdSec: number[]): number {
  return holdSec.reduce((sum, hold) => sum + hold, 0);
}

function passLength(holdSec: number[], clips: MovieClipPlay[]): number {
  const audioEnd = clips.reduce(
    (max, clip) => Math.max(max, clip.startSec + clip.durationSec),
    0,
  );
  return Math.max(stillSec(holdSec), audioEnd);
}

/**
 * Short overlays (dog1) stamp the same long A clip twice ~100 ms apart.
 * Playing both in one pass stacks into one blast. Two cues that close
 * on a reel under 2 s become two sequential passes, one cue each.
 */
export function planMoviePasses(
  holdSec: number[],
  clips: MovieClipPlay[],
): MoviePass[] {
  const total = stillSec(holdSec);
  const one = (passClips: MovieClipPlay[]): MoviePass => ({
    holdSec,
    clips: passClips,
    passSec: passLength(holdSec, passClips),
  });
  if (clips.length < 2 || total <= 0 || total > 2) {
    return [one(clips)];
  }
  let copies = 1;
  const byChannel = new Map<string, MovieClipPlay[]>();
  for (const clip of clips) {
    const key = clip.channel || "";
    const list = byChannel.get(key) ?? [];
    list.push(clip);
    byChannel.set(key, list);
  }
  for (const list of byChannel.values()) {
    if (list.length < 2) {
      continue;
    }
    list.sort((a, b) => a.startSec - b.startSec);
    const gap = list[1]!.startSec - list[0]!.startSec;
    const duration = list[0]!.durationSec;
    if (gap < 0.25 && (duration <= 0 || gap < duration)) {
      copies = Math.max(copies, list.length);
    }
  }
  if (copies === 1) {
    return [one(clips)];
  }
  const first: MovieClipPlay[] = [];
  const seen = new Set<string>();
  for (const clip of clips) {
    const key = clip.channel || `clip-${first.length}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    first.push(clip);
  }
  return Array.from({ length: copies }, () => one(first));
}
