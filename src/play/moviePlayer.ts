import { extractUrl } from "../world/set/extract";
import {
  clipUrl,
  frameUrl,
  movieClipDurationSec,
  movieFolder,
  movieFrameWaitsForAudio,
  movieFrameWaitsForClick,
  moviePlaybackSec,
  movieTableEndSec,
  playMovieRecAudio,
  type MovieCue,
  type MovieTimeline,
} from "./movies";
import { playMovieClip, voices } from "./speech";

export interface MovieStatus {
  label: string;
  loaded: number;
  total: number;
}

function preloadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  if (typeof img.decode === "function") {
    return img.decode().then(() => img);
  }
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(url));
  });
}

async function loadTimeline(stem: string): Promise<MovieTimeline> {
  const folder = movieFolder(`${stem}.mov`);
  const res = await fetch(extractUrl(`${folder}/timeline.json`));
  if (!res.ok) {
    throw new Error(`${stem} ${res.status}`);
  }
  return (await res.json()) as MovieTimeline;
}

export class MoviePlayer {
  private gen = 0;
  private readonly bedToken = { gen: 0 };
  private images = new Map<string, HTMLImageElement>();
  private timers: number[] = [];
  private raf = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  stop(): void {
    this.gen += 1;
    this.bedToken.gen += 1;
    this.clearTimers();
    voices.stop();
    voices.stopAllFx();
  }

  async play(
    stem: string,
    opts: {
      onStatus?: (status: MovieStatus) => void;
      onProgress?: (nowSec: number, totalSec: number) => void;
      waitClick?: () => Promise<void>;
    } = {},
  ): Promise<void> {
    const gen = ++this.gen;
    this.bedToken.gen += 1;
    this.clearTimers();
    this.images.clear();
    voices.stop();
    voices.stopAllFx();
    const folder = movieFolder(`${stem}.mov`);
    const timeline = await loadTimeline(stem);
    if (gen !== this.gen) {
      return;
    }
    const hz = timeline.tick_hz || 60;
    const frames = timeline.frames.map((frame) => ({
      url: frameUrl(folder, frame.container),
      holdSec: Math.max(1, frame.hold_ticks || 0) / hz,
      startSec: frame.start_tick / hz,
      action: frame.action ?? 0,
      wait: frame.wait,
      waitAudio: frame.wait_audio,
      endKind: frame.end_kind,
    }));
    const clips = (timeline.clips ?? []).map((clip) => ({
      url: clipUrl(folder, clip.container),
      startSec: clip.start_tick / hz,
      durationSec: movieClipDurationSec(clip, hz),
      channel: clip.channel,
    }));
    if (!frames.length) {
      throw new Error(`no frames in ${stem}`);
    }
    const report = (loaded: number, label: string): void => {
      opts.onStatus?.({ label, loaded, total: frames.length });
    };
    report(0, "Loading");
    const ahead = Math.min(frames.length, 32);
    for (let i = 0; i < ahead; i++) {
      await this.ensureFrame(frames[i]!.url);
      if (gen !== this.gen) {
        return;
      }
      report(i + 1, "Loading");
    }
    void this.fillRest(frames, ahead, gen, report);
    const clipUrls = clips.map((clip) => clip.url);
    await voices.preload(clipUrls);
    if (gen !== this.gen) {
      return;
    }
    report(this.images.size, "Playing");
    const clipDurations = clips.map((clip) => voices.bufferDuration(clip.url));
    const totalSec = moviePlaybackSec(timeline, clipDurations);
    opts.onProgress?.(0, totalSec);
    if (frames.some((frame) => movieFrameWaitsForClick(frame.action, frame.wait))) {
      await this.playAction(frames, clips, gen, totalSec, opts.waitClick, opts.onProgress);
    } else {
      await this.playLinear(frames, clips, gen, totalSec, opts.onProgress, timeline.bed_wrap);
    }
    if (gen === this.gen) {
      opts.onProgress?.(totalSec, totalSec);
    }
  }

  private async fillRest(
    frames: { url: string }[],
    start: number,
    gen: number,
    report: (loaded: number, label: string) => void,
  ): Promise<void> {
    for (let i = start; i < frames.length; i++) {
      if (gen !== this.gen) {
        return;
      }
      await this.ensureFrame(frames[i]!.url);
      report(this.images.size, "Playing");
    }
  }

  private async ensureFrame(url: string): Promise<HTMLImageElement | undefined> {
    const hit = this.images.get(url);
    if (hit) {
      return hit;
    }
    try {
      const img = await preloadImage(url);
      this.images.set(url, img);
      return img;
    } catch {
      return undefined;
    }
  }

  private blit(url: string): void {
    const img = this.images.get(url);
    if (!img) {
      return;
    }
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      return;
    }
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      ctx.imageSmoothingEnabled = false;
    }
    ctx.drawImage(img, 0, 0);
  }

  private async playLinear(
    frames: {
      url: string;
      holdSec: number;
      startSec: number;
      waitAudio?: boolean;
      endKind?: number;
    }[],
    clips: MovieCue[],
    gen: number,
    totalSec: number,
    onProgress?: (nowSec: number, totalSec: number) => void,
    bedWrap?: number,
  ): Promise<void> {
    const total = Math.max(0, totalSec);
    const endSec = movieTableEndSec(frames);
    let wall = 0;
    for (const frame of frames) {
      if (gen !== this.gen) {
        return;
      }
      await this.ensureFrame(frame.url);
      this.blit(frame.url);
      onProgress?.(Math.min(wall, total), total);
      const hold = Math.max(0, frame.holdSec);
      await playMovieRecAudio(
        clips,
        frame.startSec,
        frame.startSec + hold,
        playMovieClip,
        () => gen !== this.gen,
        this.bedToken,
        endSec,
        bedWrap,
      );
      if (movieFrameWaitsForAudio(frame.waitAudio)) {
        wall += await awaitWhile(voices.whenGroupAIdle(), () => gen !== this.gen, (sec) => {
          onProgress?.(Math.min(wall + sec, total), total);
        });
      }
      if (hold > 0) {
        await sleep(hold * 1000, () => gen !== this.gen, (frac) => {
          onProgress?.(Math.min(wall + hold * frac, total), total);
        });
      }
      wall += hold;
    }
  }

  private async playAction(
    frames: {
      url: string;
      holdSec: number;
      startSec: number;
      action?: number;
      wait?: boolean;
      waitAudio?: boolean;
      endKind?: number;
    }[],
    clips: MovieCue[],
    gen: number,
    totalSec: number,
    waitClick?: () => Promise<void>,
    onProgress?: (nowSec: number, totalSec: number) => void,
  ): Promise<void> {
    const total = Math.max(0, totalSec);
    const endSec = movieTableEndSec(frames);
    let wall = 0;
    for (const frame of frames) {
      if (gen !== this.gen) {
        return;
      }
      await this.ensureFrame(frame.url);
      this.blit(frame.url);
      onProgress?.(Math.min(wall, total), total);
      const hold = Math.max(0, frame.holdSec);
      await playMovieRecAudio(
        clips,
        frame.startSec,
        frame.startSec + hold,
        playMovieClip,
        () => gen !== this.gen,
        this.bedToken,
        endSec,
      );
      if (movieFrameWaitsForAudio(frame.waitAudio)) {
        wall += await awaitWhile(voices.whenGroupAIdle(), () => gen !== this.gen, (sec) => {
          onProgress?.(Math.min(wall + sec, total), total);
        });
      }
      if (hold > 0) {
        await sleep(hold * 1000, () => gen !== this.gen, (frac) => {
          onProgress?.(Math.min(wall + hold * frac, total), total);
        });
      }
      wall += hold;
      if (movieFrameWaitsForClick(frame.action, frame.wait) && waitClick) {
        await waitClick();
      }
    }
  }

  private clearTimers(): void {
    for (const id of this.timers) {
      window.clearTimeout(id);
    }
    this.timers = [];
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }
}

async function awaitWhile(
  done: Promise<void>,
  cancelled: () => boolean,
  onElapsed?: (sec: number) => void,
): Promise<number> {
  const t0 = performance.now();
  let settled = false;
  void done.finally(() => {
    settled = true;
  });
  while (!settled) {
    if (cancelled()) {
      return (performance.now() - t0) / 1000;
    }
    onElapsed?.((performance.now() - t0) / 1000);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
  return (performance.now() - t0) / 1000;
}

function sleep(
  ms: number,
  cancelled: () => boolean,
  onFrac?: (frac: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (): void => {
      const elapsed = performance.now() - t0;
      if (cancelled() || elapsed >= ms) {
        resolve();
        return;
      }
      onFrac?.(ms > 0 ? elapsed / ms : 1);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
