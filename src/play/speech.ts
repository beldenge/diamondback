/**
 * Visemes: wall-clock from speak start (do not drive these from audio playhead).
 * Sound: Web Audio PCM. Firefox/Windows often takes ~10s after the first
 * resume() before the context runs — start that on the first pointerdown so
 * greetings overlap the wait, and later lines can fire in sync (offset).
 */

import { MOV_A_IDLE_RESTART_SEC } from "./movies";

const Ctor: typeof AudioContext | undefined =
  typeof window !== "undefined"
    ? window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    : undefined;

export class VoiceBank {
  private ctx: AudioContext | null = null;
  private keep: AudioBufferSourceNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private t0 = 0;
  private lineDur = 0;
  private outGen = 0;
  private queued: string[] = [];
  private readonly raw = new Map<string, ArrayBuffer>();
  private readonly pendingRaw = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly buffers = new Map<string, AudioBuffer>();
  /** MOVPLAY group A: same channel restarts (does not stack). */
  private readonly fxSlots = new Map<string, () => void>();
  private readonly fxEnded = new Map<string, Promise<void>>();
  private readonly fxEndedResolve = new Map<string, () => void>();
  /** performance.now() when this A/B channel's current one-shot should end. */
  private readonly fxUntil = new Map<string, number>();
  /** Looping beds / `soundloop` nodes. Host can drop them on SET change. */
  private readonly looping = new Set<() => void>();

  currentTime(): number {
    if (!this.t0) {
      return 0;
    }
    return Math.max(0, (performance.now() - this.t0) / 1000);
  }

  outputLive(): boolean {
    return this.t0 > 0 && (performance.now() - this.t0) / 1000 < this.lineDur + 0.05;
  }

  stop(): void {
    this.outGen += 1;
    this.haltSpeech();
    this.t0 = 0;
    this.lineDur = 0;
  }

  queue(urls: string[]): void {
    this.queued = urls.filter(Boolean);
  }

  unlock(): void {
    this.engage();
  }

  prime(urls: string[]): void {
    this.queue(urls);
    this.engage();
  }

  async preload(urls: string[]): Promise<void> {
    await Promise.all([...new Set(urls.filter(Boolean))].map((url) => this.fetchRaw(url)));
  }

  /** Seconds of a preloaded WAV, or 0. */
  bufferDuration(url: string): number {
    if (!url) {
      return 0;
    }
    this.engage();
    const raw = this.raw.get(url);
    if (!raw) {
      return 0;
    }
    return this.decodeRaw(url, raw)?.duration ?? 0;
  }

  /** Kill looping beds and `soundloop` FX (town saw/saloon leaking into the cave). */
  stopAllLooping(): void {
    for (const stop of [...this.looping]) {
      stop();
    }
    this.looping.clear();
  }

  private groupAUntil(): number {
    let until = 0;
    for (const [channel, at] of this.fxUntil) {
      if (channel.startsWith("A") && at > until) {
        until = at;
      }
    }
    return until;
  }

  /** DF.EXE 0x4026F0: block until mixer channel 0 (all group-A slots) is idle. */
  async whenGroupAIdle(): Promise<void> {
    const waits = [...this.fxEnded.entries()]
      .filter(([channel]) => channel.startsWith("A"))
      .map(([, ended]) => ended);
    const until = this.groupAUntil();
    if (!waits.length && until <= performance.now()) {
      return;
    }
    if (waits.length) {
      await Promise.all(waits);
    }
    const remain = this.groupAUntil() - performance.now();
    if (remain > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, remain);
      });
    }
    // Empty waveOut ring: Pause/Write/Restart of one 0x4000-byte header.
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, MOV_A_IDLE_RESTART_SEC * 1000);
    });
  }

  private settleFx(channel?: string): void {
    if (!channel) {
      return;
    }
    const resolve = this.fxEndedResolve.get(channel);
    this.fxEndedResolve.delete(channel);
    this.fxEnded.delete(channel);
    this.fxUntil.delete(channel);
    resolve?.();
  }

  /** One-shot world/UI WAV. Does not stop speech or set the viseme clock. */
  async playFx(
    url: string,
    volume = 0.8,
    loop = false,
    channel?: string,
  ): Promise<() => void> {
    this.engage();
    if (channel) {
      this.fxSlots.get(channel)?.();
      this.fxSlots.delete(channel);
      this.settleFx(channel);
    }
    let cancelled = false;
    let started = false;
    let source: AudioBufferSourceNode | null = null;
    let gain: GainNode | null = null;
    const stop = (): void => {
      cancelled = true;
      this.looping.delete(stop);
      if (started && source) {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        source?.disconnect();
        gain?.disconnect();
      } catch {
        /* already disconnected */
      }
      if (channel && this.fxSlots.get(channel) === stop) {
        this.fxSlots.delete(channel);
      }
      this.settleFx(channel);
    };
    if (loop) {
      this.looping.add(stop);
    }
    const raw = this.raw.get(url) ?? (await this.fetchRaw(url));
    const ctx = this.ctx;
    if (cancelled || !raw || !ctx) {
      stop();
      return stop;
    }
    const buffer = this.decodeRaw(url, raw);
    if (cancelled || !buffer) {
      stop();
      return stop;
    }
    gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(gain);
    gain.connect(ctx.destination);
    try {
      if (ctx.state !== "running") {
        await ctx.resume();
      }
      if (cancelled) {
        stop();
        return stop;
      }
      source.start();
      started = true;
      if (cancelled) {
        stop();
        return stop;
      }
    } catch {
      stop();
      return stop;
    }
    if (channel) {
      this.fxSlots.set(channel, stop);
      this.settleFx(channel);
      this.fxUntil.set(channel, performance.now() + buffer.duration * 1000);
      let resolveEnded: () => void = () => undefined;
      this.fxEnded.set(
        channel,
        new Promise<void>((resolve) => {
          resolveEnded = resolve;
        }),
      );
      this.fxEndedResolve.set(channel, resolveEnded);
      source.onended = () => {
        if (this.fxSlots.get(channel) === stop) {
          this.fxSlots.delete(channel);
        }
        this.settleFx(channel);
      };
    }
    return stop;
  }

  async play(url: string): Promise<number> {
    const raw = this.raw.get(url) ?? (await this.fetchRaw(url));
    const duration = raw ? wavDurationSec(raw) : 0;
    this.haltSpeech();
    this.t0 = performance.now();
    this.lineDur = duration;
    if (!raw) {
      return 0;
    }
    const gen = ++this.outGen;
    const ctx = this.ctx;
    const buffer = ctx ? this.decodeRaw(url, raw) : null;
    const go = (): void => {
      if (gen !== this.outGen || !buffer || !this.ctx || this.ctx.state !== "running" || this.source) {
        return;
      }
      this.fire(buffer);
    };
    go();
    if (ctx && ctx.state !== "running") {
      void ctx.resume().then(go);
    }
    return duration;
  }

  private engage(): void {
    const ctx = this.context();
    if (!ctx) {
      return;
    }
    try {
      this.armKeepAlive(ctx);
    } catch {
      /* start() on a suspended context is allowed; Firefox may delay resume anyway */
    }
    void ctx.resume().then(() => {
      try {
        this.armKeepAlive(ctx);
      } catch {
        /* still suspended */
      }
    });
    for (const url of this.queued) {
      const raw = this.raw.get(url);
      if (raw) {
        this.decodeRaw(url, raw);
      }
    }
  }

  private haltSpeech(): void {
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        /* already stopped */
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  private fire(buffer: AudioBuffer): void {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }
    const offset = Math.min(Math.max(0, this.currentTime()), Math.max(0, buffer.duration - 0.05));
    if (offset >= buffer.duration) {
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      if (this.source === source) {
        this.source = null;
      }
    };
    this.source = source;
    try {
      source.start(0, offset);
    } catch {
      this.source = null;
    }
  }

  private armKeepAlive(ctx: AudioContext): void {
    if (this.keep) {
      return;
    }
    const n = 128;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i += 1) {
      data[i] = (i & 1 ? 1 : -1) * 0.00003;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(ctx.destination);
    src.start();
    this.keep = src;
  }

  private context(): AudioContext | null {
    if (!Ctor) {
      return null;
    }
    if (!this.ctx) {
      try {
        this.ctx = new Ctor({ latencyHint: "interactive" });
      } catch {
        this.ctx = new Ctor();
      }
    }
    return this.ctx;
  }

  private decodeRaw(url: string, raw: ArrayBuffer): AudioBuffer | null {
    const hit = this.buffers.get(url);
    if (hit) {
      return hit;
    }
    if (!this.ctx) {
      return null;
    }
    const buffer = decodePcmWav(this.ctx, raw);
    if (buffer) {
      this.buffers.set(url, buffer);
    }
    return buffer;
  }

  private fetchRaw(url: string): Promise<ArrayBuffer | null> {
    const cached = this.raw.get(url);
    if (cached) {
      return Promise.resolve(cached);
    }
    const inflight = this.pendingRaw.get(url);
    if (inflight) {
      return inflight;
    }
    const job = (async () => {
      try {
        const res = await fetch(url, { signal: abortAfter(2500) });
        if (!res.ok) {
          return null;
        }
        const data = await res.arrayBuffer();
        this.raw.set(url, data);
        return data;
      } catch {
        return null;
      } finally {
        this.pendingRaw.delete(url);
      }
    })();
    this.pendingRaw.set(url, job);
    return job;
  }
}

export const voices = new VoiceBank();
export function unlockVoices(): void {
  voices.unlock();
}

function abortAfter(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

interface WavPcm {
  rate: number;
  channels: number;
  width: number;
  dataOff: number;
  dataLen: number;
}

function parseWav(raw: ArrayBuffer): WavPcm | null {
  const bytes = new Uint8Array(raw);
  const view = new DataView(raw);
  if (bytes.length < 12 || String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) !== "RIFF") {
    return null;
  }
  let offset = 12;
  let channels = 1;
  let rate = 11025;
  let width = 1;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(
      bytes[offset]!,
      bytes[offset + 1]!,
      bytes[offset + 2]!,
      bytes[offset + 3]!,
    );
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      channels = view.getUint16(body + 2, true) || 1;
      rate = view.getUint32(body + 4, true) || 11025;
      width = (view.getUint16(body + 14, true) || 8) / 8;
    } else if (id === "data") {
      return { rate, channels, width, dataOff: body, dataLen: size };
    }
    offset = body + size + (size & 1);
  }
  return null;
}

export function wavDurationSec(raw: ArrayBuffer): number {
  const wav = parseWav(raw);
  if (!wav || wav.rate <= 0) {
    return 0;
  }
  const samples = Math.floor(wav.dataLen / Math.max(1, wav.width * wav.channels));
  return samples / wav.rate;
}

/** Dust speech is 8-bit mono PCM. Some browsers refuse that in decodeAudioData. */
export function decodePcmWav(ctx: AudioContext, raw: ArrayBuffer): AudioBuffer | null {
  const wav = parseWav(raw);
  if (!wav) {
    return null;
  }
  const bytes = new Uint8Array(raw);
  const view = new DataView(raw);
  const samples = Math.floor(wav.dataLen / (wav.width * wav.channels));
  if (samples <= 0) {
    return null;
  }
  const buffer = ctx.createBuffer(1, samples, wav.rate);
  const out = buffer.getChannelData(0);
  if (wav.width === 1) {
    for (let i = 0; i < samples; i += 1) {
      out[i] = (bytes[wav.dataOff + i * wav.channels]! - 128) / 128;
    }
  } else {
    for (let i = 0; i < samples; i += 1) {
      out[i] = view.getInt16(wav.dataOff + i * wav.channels * 2, true) / 32768;
    }
  }
  return buffer;
}
