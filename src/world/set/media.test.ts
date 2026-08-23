import { describe, expect, it } from "vitest";
import { MediaGate } from "./media";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}

async function waitIdle(gate: MediaGate): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    if (gate.running === 0 && gate.queued === 0) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error(`gate still busy running=${gate.running} queued=${gate.queued}`);
}

describe("media gate", () => {
  it("starts high-priority jobs before queued low-priority jobs", async () => {
    const started: string[] = [];
    const gate = new MediaGate(1);
    const first = deferred();
    gate.enqueue("low-a", "low", async () => {
      started.push("low-a");
      await first.promise;
    });
    gate.enqueue("low-b", "low", async () => {
      started.push("low-b");
    });
    gate.enqueue("high", "high", async () => {
      started.push("high");
    });
    await Promise.resolve();
    expect(started).toEqual(["low-a"]);
    first.resolve();
    await waitIdle(gate);
    expect(started).toEqual(["low-a", "high", "low-b"]);
  });

  it("promotes a queued low job when prefer() is called", async () => {
    const started: string[] = [];
    const gate = new MediaGate(1);
    const first = deferred();
    gate.enqueue("hold", "low", async () => {
      started.push("hold");
      await first.promise;
    });
    gate.enqueue("later", "low", async () => {
      started.push("later");
    });
    gate.prefer("later");
    first.resolve();
    await waitIdle(gate);
    expect(started).toEqual(["hold", "later"]);
  });

  it("does not start more than maxInflight jobs", async () => {
    const gate = new MediaGate(2);
    const holds = [deferred(), deferred(), deferred()];
    let running = 0;
    let peak = 0;
    for (let i = 0; i < 3; i += 1) {
      const hold = holds[i]!;
      gate.enqueue(`j${i}`, "low", async () => {
        running += 1;
        peak = Math.max(peak, running);
        await hold.promise;
        running -= 1;
      });
    }
    await Promise.resolve();
    expect(peak).toBe(2);
    expect(gate.running).toBe(2);
    expect(gate.queued).toBe(1);
    holds[0]!.resolve();
    holds[1]!.resolve();
    holds[2]!.resolve();
    await waitIdle(gate);
    expect(gate.running).toBe(0);
    expect(peak).toBe(2);
  });
});
