/**
 * Decode gate for SET stills, Z planes, and CST/PRP sprites.
 *
 * Dust played a strip from RAM; CD seeks were the hitch. We keep that
 * clock (never skip a plate) and only limit *how many* PNG decodes run
 * at once so a background prefetch cannot starve the frame on screen.
 * High jobs (current strip) always start before queued low jobs.
 */

export const MAX_MEDIA_INFLIGHT = 8;

export type MediaPriority = "high" | "low";

export class MediaGate {
  private inflight = 0;
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
      const id = this.high.shift() ?? this.low.shift();
      if (!id) {
        return;
      }
      const task = this.pending.get(id);
      this.pending.delete(id);
      if (!task) {
        continue;
      }
      this.inflight += 1;
      void task.run().finally(() => {
        this.inflight -= 1;
        this.pump();
      });
    }
  }
}

/** Shared by StillsView and play sprite/Z decode so one pool cannot drown the other. */
export const mediaGate = new MediaGate();
