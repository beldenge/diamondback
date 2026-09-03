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
  /** Rec+0x16. Kind 1 stop, kind 3 chain / timeout_movie. */
  end_kind?: number;
  /** Type-3 Pascal reel (kiddie.mov → kidwin.mov). */
  timeout_movie?: string;
}

export interface MovieClip {
  container: number;
  start_tick: number;
  channel?: string;
  /** PCM length in 60 Hz ticks (extract). */
  duration_ticks?: number;
  duration_seconds?: number;
}

export interface MovieTimeline {
  tick_hz?: number;
  duration_ticks: number;
  duration_seconds?: number;
  frames: MovieFrame[];
  clips?: MovieClip[];
  /** Rec+0x16==3 Pascal at rec+0x30. playmovie loads this when the reel ends. */
  next?: string;
  /**
   * Header +0x8BE: playlist entry the last B node links back to
   * (MOVPLAY `0x40B933`). 0 in every Dust reel with a theme.
   */
  bed_wrap?: number;
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

function isGroupAChannel(channel?: string): boolean {
  return (channel ?? "").toUpperCase().startsWith("A");
}

export function movieClipDurationSec(clip: MovieClip, hz = 60): number {
  if (typeof clip.duration_seconds === "number" && clip.duration_seconds > 0) {
    return clip.duration_seconds;
  }
  if ((clip.duration_ticks ?? 0) > 0) {
    return (clip.duration_ticks ?? 0) / hz;
  }
  return 0;
}

function frameHoldSec(frame: MovieFrame, hz: number): number {
  return Math.max(1, frame.hold_ticks || 0) / hz;
}

/**
 * Linear playmovie wall-clock: each rec's A cue, optional wait until
 * group-A mixer idle (`wait_audio` + empty waveOut header), then the
 * still hold. Table `duration_seconds` is only the stills — day-change
 * reels pause on voice-over.
 */
export function moviePlaybackSec(
  timeline: MovieTimeline,
  clipDurations?: readonly number[],
): number {
  const hz = timeline.tick_hz || 60;
  const frames = timeline.frames ?? [];
  const clips = timeline.clips ?? [];
  if (!frames.length) {
    return movieDurationSec(timeline);
  }
  const starts = clips.map((clip) => clip.start_tick / hz);
  let wall = 0;
  let aEnd = 0;
  for (const frame of frames) {
    const at = frame.start_tick / hz;
    for (const index of movieClipsAtStart(starts, at)) {
      const clip = clips[index];
      if (!clip || !isGroupAChannel(clip.channel)) {
        continue;
      }
      const override = clipDurations?.[index];
      const dur =
        typeof override === "number" && override > 0 ? override : movieClipDurationSec(clip, hz);
      aEnd = Math.max(aEnd, wall + dur);
    }
    if (movieFrameWaitsForAudio(frame.wait_audio)) {
      if (aEnd > wall) {
        wall = aEnd;
      }
      wall += MOV_A_IDLE_RESTART_SEC;
    }
    wall += frameHoldSec(frame, hz);
  }
  return wall;
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
 * rec+0x16 == 1 and rec+0 cmd count 0. Ends a hotspot dest *segment*
 * (SAFEBOX take dest 17 → rec 31). Linear reels (DESEREND, INTRO3)
 * use the same kind at scene ends — concatenated stills continue.
 */
export const MOV_END_STOP = 1;

export function movieRecStopsReel(frame: {
  action?: number;
  wait?: boolean;
  endKind?: number;
  end_kind?: number;
}): boolean {
  if (frame.wait) {
    return false;
  }
  if ((frame.action ?? 0) !== 0) {
    return false;
  }
  const kind = frame.endKind ?? frame.end_kind;
  return kind === MOV_END_STOP;
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

export function movieGroupBChannel(channel?: string): boolean {
  return (channel ?? "").toUpperCase() === "B";
}

export type MovieCue = {
  startSec: number;
  channel?: string;
  durationSec?: number;
  url?: string;
};

/** Sequential B playlist: next start is previous start + PCM length. */
export function movieBedContinues(
  prev: MovieCue,
  next: MovieCue,
  tickSec = 1 / 60,
): boolean {
  const dur = prev.durationSec ?? 0;
  if (dur <= 0) {
    return false;
  }
  return Math.abs(prev.startSec + dur - next.startSec) <= tickSec * 2;
}

function previousBedClip(clips: readonly MovieCue[], index: number): MovieCue | undefined {
  const start = clips[index]?.startSec ?? 0;
  let prev: MovieCue | undefined;
  for (let i = 0; i < clips.length; i += 1) {
    const clip = clips[i]!;
    if (i === index || !movieGroupBChannel(clip.channel) || clip.startSec >= start) {
      continue;
    }
    if (!prev || clip.startSec > prev.startSec) {
      prev = clip;
    }
  }
  return prev;
}

/** AudioContext time to start a mixer slot. Queue joins at the previous end. */
export function movieQueueWhen(
  ctxNow: number,
  channelEnd: number | undefined,
  queue: boolean,
): number {
  if (!queue) {
    return ctxNow;
  }
  if (channelEnd !== undefined && channelEnd > ctxNow) {
    return channelEnd;
  }
  return ctxNow;
}

/** Last still-table time (start + hold), not wait_audio wall-clock. */
export function movieTableEndSec(
  frames: readonly { startSec?: number; holdSec: number }[],
): number {
  let t = 0;
  let end = 0;
  for (const frame of frames) {
    const start = frame.startSec ?? t;
    const hold = Math.max(0, frame.holdSec);
    end = Math.max(end, start + hold);
    t = start + hold;
  }
  return end;
}

export function movieFollowBedIndex(
  clips: readonly MovieCue[],
  index: number,
  endSec = Number.POSITIVE_INFINITY,
): number | undefined {
  const cur = clips[index];
  if (!cur || !movieGroupBChannel(cur.channel)) {
    return undefined;
  }
  let next: number | undefined;
  let nextStart = Number.POSITIVE_INFINITY;
  for (let i = 0; i < clips.length; i += 1) {
    const clip = clips[i]!;
    if (i === index || !movieGroupBChannel(clip.channel) || clip.startSec <= cur.startSec) {
      continue;
    }
    if (clip.startSec < nextStart) {
      nextStart = clip.startSec;
      next = i;
    }
  }
  if (next === undefined || nextStart >= endSec) {
    return undefined;
  }
  return movieBedContinues(cur, clips[next]!) ? next : undefined;
}

/**
 * Rec+32 group A and a B playlist *head* fire in this rec's still
 * window. Cross-scene A hold can sit a cue between rec starts
 * (DESEREND goodbye 809 is on rec 807–819). Continuation B is
 * scheduled at the previous buffer end, not rec-fired.
 */
export function movieClipsForRec(
  clips: readonly MovieCue[],
  recStart: number,
  recEnd: number,
  eps = 1e-6,
): number[] {
  const due: number[] = [];
  const end = recEnd > recStart ? recEnd : recStart + eps;
  for (let i = 0; i < clips.length; i += 1) {
    const at = clips[i]!.startSec;
    if (at + eps < recStart || at >= end) {
      continue;
    }
    if (movieGroupBChannel(clips[i]?.channel)) {
      const prev = previousBedClip(clips, i);
      if (prev && movieBedContinues(prev, clips[i]!)) {
        continue;
      }
    }
    due.push(i);
  }
  return due;
}

/**
 * The B playlist is a **circular** list: MOVPLAY links each node to the
 * next and points the last one back at playlist entry `header+0x8BE`
 * (`0x40B933`; that field is 0 in every Dust reel with a theme). Six
 * reels run out of bed before the picture ends and audibly loop — the
 * LUPRE / LUSS attract reels by ~59 s and ~30 s, plus INTRO, INTRO3,
 * D4AD4N and MAIN by a couple of seconds each.
 */
export function movieBedWrapIndex(
  clips: readonly MovieCue[],
  wrapTo = 0,
): number | undefined {
  const beds = clips
    .map((clip, index) => ({ clip, index }))
    .filter((row) => movieGroupBChannel(row.clip.channel) && row.clip.url)
    .sort((a, b) => a.clip.startSec - b.clip.startSec);
  if (!beds.length) {
    return undefined;
  }
  const at = Math.max(0, Math.trunc(wrapTo));
  return (beds[at] ?? beds[0])!.index;
}

export function armMovieBedFollow(
  clips: readonly MovieCue[],
  index: number,
  play: (clip: MovieCue) => Promise<unknown>,
  cancelled: () => boolean,
  endSec = Number.POSITIVE_INFINITY,
  wrapTo?: number,
  atSec?: number,
): void {
  const cur = clips[index];
  const startedAt = atSec ?? cur?.startSec ?? 0;
  const curDur = cur?.durationSec ?? 0;
  // Project the next start instead of trusting authored times: after one
  // lap the table's `startSec` values are all in the past.
  const nextAt = startedAt + curDur;
  let next = movieFollowBedIndex(clips, index, endSec);
  if (next === undefined) {
    // Wrapping needs a known reel end and a real buffer length, or the
    // chain could schedule forever.
    if (!Number.isFinite(endSec) || curDur <= 0 || nextAt >= endSec) {
      return;
    }
    next = movieBedWrapIndex(clips, wrapTo);
    if (next === undefined) {
      return;
    }
  }
  void (async () => {
    if (cancelled()) {
      return;
    }
    const clip = clips[next];
    if (!clip?.url) {
      return;
    }
    await play(clip);
    if (cancelled()) {
      return;
    }
    armMovieBedFollow(clips, next, play, cancelled, endSec, wrapTo, nextAt);
  })();
}

/** Rec A cues plus the B playlist head; continuation B is scheduled. */
export async function playMovieRecAudio(
  clips: readonly MovieCue[],
  recStart: number,
  recEnd: number,
  play: (clip: MovieCue, queue: boolean) => Promise<unknown>,
  cancelled: () => boolean,
  bedToken: { gen: number },
  endSec = Number.POSITIVE_INFINITY,
  wrapTo?: number,
): Promise<void> {
  for (const index of movieClipsForRec(clips, recStart, recEnd)) {
    if (cancelled()) {
      return;
    }
    const clip = clips[index];
    if (!clip?.url) {
      continue;
    }
    const bed = movieGroupBChannel(clip.channel);
    const followGen = bed ? (bedToken.gen += 1) : bedToken.gen;
    await play(clip, false);
    if (cancelled()) {
      return;
    }
    if (bed) {
      armMovieBedFollow(
        clips,
        index,
        (next) => play(next, true),
        () => cancelled() || bedToken.gen !== followGen,
        endSec,
        wrapTo,
      );
    }
  }
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

/**
 * Bell/pots: a real group-A slot plays the clang and a dest segment,
 * then the wait still. Slot 0 or a junk u16 (SAFEBOX 65516) is a
 * playhead jump — take the stone / dismiss, do not return to wait.
 */
export function movieHotspotPlaysClip(
  channel: string | undefined,
  clips: readonly { channel?: string }[],
): boolean {
  const raw = (channel ?? "").trim();
  const slot = /^a(\d+)$/i.exec(raw);
  if (!slot) {
    return false;
  }
  const n = Number(slot[1]);
  if (n < 1 || n > 32) {
    return false;
  }
  const want = `A${n}`;
  return clips.some((clip) => (clip.channel ?? "").toUpperCase() === want);
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


