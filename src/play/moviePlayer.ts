import { extractUrl } from "../world/set/extract";
import {
  clipUrl,
  frameUrl,
  movieClipsStarting,
  movieFolder,
  movieFrameWaitsForClick,
  movieIndexAt,
  planMoviePasses,
  type MovieTimeline,
} from "./movies";
import { voices } from "./speech";

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
  private images = new Map<string, HTMLImageElement>();
  private timers: number[] = [];
  private raf = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  stop(): void {
    this.gen += 1;
    this.clearTimers();
    voices.stop();
  }

  async play(
    stem: string,
    opts: {
      onStatus?: (status: MovieStatus) => void;
      waitClick?: () => Promise<void>;
    } = {},
  ): Promise<void> {
    const gen = ++this.gen;
    this.clearTimers();
    this.images.clear();
    voices.stop();
    const folder = movieFolder(`${stem}.mov`);
    const timeline = await loadTimeline(stem);
    if (gen !== this.gen) {
      return;
    }
    const hz = timeline.tick_hz || 60;
    const frames = timeline.frames.map((frame) => ({
      url: frameUrl(folder, frame.container),
      holdSec: Math.max(1, frame.hold_ticks || 0) / hz,
      action: frame.action ?? 0,
    }));
    const clips = (timeline.clips ?? []).map((clip) => ({
      url: clipUrl(folder, clip.container),
      startSec: clip.start_tick / hz,
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
    const timed = clips.map((clip) => ({
      url: clip.url,
      startSec: clip.startSec,
      channel: clip.channel,
      durationSec: voices.bufferDuration(clip.url),
    }));
    report(this.images.size, "Playing");
    if (frames.some((frame) => movieFrameWaitsForClick(frame.action))) {
      await this.playAction(frames, clips, gen, opts.waitClick);
      return;
    }
    const holds = frames.map((frame) => frame.holdSec);
    const passes = planMoviePasses(holds, timed);
    for (const pass of passes) {
      if (gen !== this.gen) {
        return;
      }
      await this.playPass(
        frames,
        pass.holdSec,
        pass.clips.map((clip) => ({
          url: clip.url ?? "",
          startSec: clip.startSec,
          channel: clip.channel,
        })),
        pass.passSec,
        gen,
      );
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

  private async playAction(
    frames: { url: string; holdSec: number; action?: number }[],
    clips: { url: string; startSec: number; channel?: string }[],
    gen: number,
    waitClick?: () => Promise<void>,
  ): Promise<void> {
    const starts = clips.map((clip) => clip.startSec);
    let t = 0;
    for (const frame of frames) {
      if (gen !== this.gen) {
        return;
      }
      await this.ensureFrame(frame.url);
      this.blit(frame.url);
      const hold = Math.max(0, frame.holdSec);
      for (const index of movieClipsStarting(starts, t - 1e-6, t + hold)) {
        const url = clips[index]?.url;
        if (url) {
          void voices.playFx(url, 0.85, false, clips[index]?.channel);
        }
      }
      if (hold > 0) {
        await sleep(hold * 1000, () => gen !== this.gen);
      }
      t += hold;
      if (movieFrameWaitsForClick(frame.action) && waitClick) {
        await waitClick();
      }
    }
  }

  private playPass(
    frames: { url: string }[],
    holds: number[],
    clips: { url: string; startSec: number; channel?: string }[],
    passSec: number,
    gen: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      let shown = -1;
      const show = (nowSec: number): void => {
        const index = movieIndexAt(holds, nowSec);
        if (index === shown) {
          return;
        }
        shown = index;
        const url = frames[index]?.url;
        if (url) {
          const img = this.images.get(url);
          if (img) {
            this.blit(url);
          } else {
            void this.ensureFrame(url).then((loaded) => {
              if (loaded && gen === this.gen && shown === index) {
                this.blit(url);
              }
            });
          }
        }
      };
      show(0);
      for (const clip of clips) {
        const delay = Math.max(0, clip.startSec * 1000);
        this.timers.push(
          window.setTimeout(() => {
            if (gen === this.gen) {
              void voices.playFx(clip.url, 0.85, false, clip.channel);
            }
          }, delay),
        );
      }
      const t0 = performance.now();
      const totalMs = Math.max(0, passSec) * 1000;
      const finish = (): void => {
        this.clearTimers();
        resolve();
      };
      if (totalMs <= 0) {
        finish();
        return;
      }
      const step = (): void => {
        if (gen !== this.gen) {
          finish();
          return;
        }
        const now = performance.now() - t0;
        if (now >= totalMs) {
          show(Math.max(0, passSec - 1e-4));
          finish();
          return;
        }
        show(now / 1000);
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    });
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

function sleep(ms: number, cancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (): void => {
      if (cancelled() || performance.now() - t0 >= ms) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
