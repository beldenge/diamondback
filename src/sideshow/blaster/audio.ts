/**
 * Sound effects, straight off the extracted `SND` tree.
 *
 * A cascade can pop thirty birds inside two seconds, so this runs on one
 * `AudioContext` with decoded buffers rather than `Audio` elements —
 * buffer sources are cheap, overlap cleanly, and take a detune per shot
 * so a chain does not sound like one sample stuttering.
 */

import { extractUrl } from "../../world/set/extract";

/** Simultaneous voices. A chain past this many just gets quieter, not louder. */
const MAX_VOICES = 12;

export class Sfx {
  private ctx: AudioContext | null = null;

  private readonly buffers = new Map<string, AudioBuffer>();

  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();

  private readonly missing = new Set<string>();

  private voices = 0;

  private muted = false;

  /** Browsers only allow this after a gesture; the first click calls it. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        return;
      }
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  private key(folder: string, name: string): string {
    return `${folder}/${name}`;
  }

  load(folder: string, name: string): Promise<AudioBuffer | null> {
    const key = this.key(folder, name);
    const hit = this.buffers.get(key);
    if (hit) {
      return Promise.resolve(hit);
    }
    if (this.missing.has(key)) {
      return Promise.resolve(null);
    }
    const pending = this.loading.get(key);
    if (pending) {
      return pending;
    }
    // `folder` is a `SND/` subfolder, or a full extract path when the clip
    // lives elsewhere — PUP dialogue is under `PUP/<cast>/AUDIO`.
    const rel = folder.includes("/") ? `${folder}/${name}.wav` : `SND/${folder}/${name}.wav`;
    const job = fetch(extractUrl(rel))
      .then((res) => {
        if (!res.ok) {
          throw new Error(`${key} ${res.status}`);
        }
        return res.arrayBuffer();
      })
      .then((bytes) => {
        const ctx = this.ctx;
        if (!ctx) {
          throw new Error("no audio context");
        }
        return ctx.decodeAudioData(bytes);
      })
      .then((buffer) => {
        this.buffers.set(key, buffer);
        this.loading.delete(key);
        return buffer;
      })
      .catch(() => {
        this.missing.add(key);
        this.loading.delete(key);
        return null;
      });
    this.loading.set(key, job);
    return job;
  }

  preload(folder: string, names: readonly string[]): void {
    for (const name of names) {
      void this.load(folder, name);
    }
  }

  /**
   * Fire and forget. `detune` is in cents — a chain passes a little
   * random spread so thirty chickens do not sound like one chicken.
   *
   * `important` bypasses the voice cap. The cap exists so a forty-bird
   * cascade does not turn into noise, and dropping one chicken pop out of
   * forty costs nothing — but a boss's one and only line is not
   * interchangeable with a pop, and silently losing it to a busy moment is
   * the kind of bug that only shows up deep in a run.
   */
  play(folder: string, name: string, gain = 1, detune = 0, important = false): void {
    if (this.muted || !this.ctx || (!important && this.voices >= MAX_VOICES)) {
      return;
    }
    const buffer = this.buffers.get(this.key(folder, name));
    if (!buffer) {
      // Not decoded yet: fetch it so the next one lands.
      void this.load(folder, name);
      return;
    }
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (detune !== 0 && source.detune) {
      source.detune.value = detune;
    }
    const amp = ctx.createGain();
    amp.gain.value = Math.max(0, Math.min(1, gain));
    source.connect(amp).connect(ctx.destination);
    this.voices += 1;
    // `onended` alone leaks. A source whose context gets suspended — a
    // backgrounded tab, an autoplay policy kicking in — may never fire it,
    // and every leaked voice permanently lowers the ceiling until nothing
    // plays at all. That is a bug you only notice much later in a run:
    // early sounds work, and by wave ten a one-shot line is silently
    // dropped. The timer guarantees the counter comes back.
    let released = false;
    const release = (): void => {
      if (released) {
        return;
      }
      released = true;
      this.voices = Math.max(0, this.voices - 1);
    };
    source.onended = release;
    window.setTimeout(release, buffer.duration * 1000 + 250);
    source.start();
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.buffers.clear();
    this.loading.clear();
  }
}

/** Everything Chicken Blaster pulls out of `SND/_TARGET`. */
export const TARGET_SOUNDS = [
  "chickenhit",
  "pighit",
  "goathit",
  "birdhit",
  "crowhit",
  "lizardhit",
  "draw",
  "newgun",
  "reach",
  "handgoesforgun",
  "rico1",
  "rico2",
  "hit1",
  "hit2",
  "hit3",
  "thistown",
] as const;
