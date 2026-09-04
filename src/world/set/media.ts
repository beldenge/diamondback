/**
 * Decode gates. Color stills (`stillGate`) must not share a pool with
 * Z/sprites: one 8+8 pool ran 16 `Image.decode`s on the main thread and
 * froze the film. Bits stay on a smaller pool. Do not advance the color
 * still until that plate’s Z is known (cached plane or cached miss).
 *
 * Dust played a strip from RAM; CD seeks were the hitch. We never skip
 * a plate. High jobs (current strip, then dest depth-1) start before
 * queued low jobs. `Image.decode` cannot be aborted once started.
 *
 * The caps are about **two different scarce things**, and they moved:
 *
 * - Colour stills no longer decode on the main thread at all — they go
 *   through `createImageBitmap`, so the eight-slot cap that protected
 *   the film from `Image.decode` is now guarding a cost that left. What
 *   a colour slot costs today is a *request*, and the hosted extract is
 *   HTTP/2, which has no six-connection limit. More slots means fewer
 *   round trips per strip.
 * - Z and sprites still `getImageData` on the main thread, so their pool
 *   stays small — just not as small as three, since the measured
 *   main-thread share of a Z decode is ~0.7 ms.
 *
 * The reserve matters more than the ceiling. A strip needs its five
 * plates inside 250 ms; the dest-neighbourhood warm-up is not needed for
 * at least that long. On a slow link every extra in-flight request steals
 * bandwidth from plate 0, so speculation gets a *third* of the pool, not
 * all-but-two of it.
 */

export const MAX_MEDIA_INFLIGHT = 12;

/** Z + sprite bitmaps. Smaller: these still read pixels on the main thread. */
export const MAX_BITS_INFLIGHT = 6;

/** Share of the pool low-priority prefetch may occupy. */
export const LOW_MEDIA_SHARE = 1 / 3;

export type MediaPriority = "high" | "low";

export class MediaGate {
  private inflight = 0;
  private inflightLow = 0;
  private readonly pending = new Map<string, { priority: MediaPriority; run: () => Promise<void> }>();
  private readonly high: string[] = [];
  private readonly low: string[] = [];

  constructor(private readonly maxInflight = MAX_MEDIA_INFLIGHT) {}

  get queued(): number {
    return this.pending.size;
  }

  get running(): number {
    return this.inflight;
  }

  enqueue(id: string, priority: MediaPriority, run: () => Promise<void>): void {
    const existing = this.pending.get(id);
    if (existing) {
      if (priority === "high" && existing.priority === "low") {
        this.prefer(id);
      }
      return;
    }
    this.pending.set(id, { priority, run });
    if (priority === "high") {
      this.high.push(id);
    } else {
      this.low.push(id);
    }
    this.pump();
  }

  /** Move a queued (not yet started) job to the front of the high list. */
  prefer(id: string): void {
    this.promote(id);
    this.pump();
  }

  /**
   * Front of the high list, first id first. Call after enqueue so a new
   * strip outruns leftover dest-neighborhood jobs from the previous step.
   */
  preferMany(ids: readonly string[]): void {
    for (let i = ids.length - 1; i >= 0; i -= 1) {
      this.promote(ids[i]!);
    }
    this.pump();
  }

  private promote(id: string): void {
    const task = this.pending.get(id);
    if (!task) {
      return;
    }
    if (task.priority === "low") {
      const at = this.low.indexOf(id);
      if (at >= 0) {
        this.low.splice(at, 1);
      }
      task.priority = "high";
    } else {
      const at = this.high.indexOf(id);
      if (at >= 0) {
        this.high.splice(at, 1);
      }
    }
    this.high.unshift(id);
  }

  private pump(): void {
    while (this.inflight < this.maxInflight) {
      const id = this.takeNext();
      if (!id) {
        return;
      }
      const task = this.pending.get(id);
      this.pending.delete(id);
      if (!task) {
        continue;
      }
      const priority = task.priority;
      this.inflight += 1;
      if (priority === "low") {
        this.inflightLow += 1;
      }
      void task.run().finally(() => {
        this.inflight -= 1;
        if (priority === "low") {
          this.inflightLow -= 1;
        }
        this.pump();
      });
    }
  }

  private takeNext(): string | undefined {
    if (this.high.length > 0) {
      return this.high.shift();
    }
    if (this.low.length > 0 && this.inflightLow < this.lowCap()) {
      return this.low.shift();
    }
    return undefined;
  }

  /** How many of the pool's slots speculative prefetch may hold at once. */
  private lowCap(): number {
    // Always leave room for at least one speculative job, and never let
    // speculation take more than its share of the pool.
    return Math.max(1, Math.min(this.maxInflight - 1, Math.floor(this.maxInflight * LOW_MEDIA_SHARE)));
  }
}

/** SET color stills (filmstrip PNGs). */
export const stillGate = new MediaGate();

/** Z planes and CST/PRP sprite bitmaps. */
export const bitsGate = new MediaGate(MAX_BITS_INFLIGHT);
