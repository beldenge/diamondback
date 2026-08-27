import { describe, expect, it } from "vitest";
import { bitsGate, MediaGate, MAX_BITS_INFLIGHT, stillGate } from "./media";

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
  it("keeps film and Z/sprite decode on separate pools", () => {
    expect(stillGate).not.toBe(bitsGate);
    expect(MAX_BITS_INFLIGHT).toBe(3);
  });

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

  it("leaves reserved slots so a high job starts while lows are saturated", async () => {
    const started: string[] = [];
    const gate = new MediaGate(8);
    const holds = Array.from({ length: 8 }, () => deferred());
    for (let i = 0; i < 8; i += 1) {
      const hold = holds[i]!;
      gate.enqueue(`low-${i}`, "low", async () => {
        started.push(`low-${i}`);
        await hold.promise;
      });
    }
    expect(gate.running).toBe(6);
    expect(gate.queued).toBe(2);
    expect(started).not.toContain("strip");
    gate.enqueue("strip", "high", async () => {
      started.push("strip");
    });
    expect(started).toContain("strip");
    expect(gate.running).toBe(7);
    for (const hold of holds) {
      hold.resolve();
    }
    await waitIdle(gate);
  });

  it("prefer() starts a promoted job in a reserved slot", async () => {
    const started: string[] = [];
    const gate = new MediaGate(8);
    const holds = Array.from({ length: 6 }, () => deferred());
    for (let i = 0; i < 6; i += 1) {
      const hold = holds[i]!;
      gate.enqueue(`low-${i}`, "low", async () => {
        started.push(`low-${i}`);
        await hold.promise;
      });
    }
    gate.enqueue("later", "low", async () => {
      started.push("later");
    });
    expect(started).not.toContain("later");
    expect(gate.running).toBe(6);
    gate.prefer("later");
    expect(started).toContain("later");
    for (const hold of holds) {
      hold.resolve();
    }
    await waitIdle(gate);
  });

  it("preferMany starts the first id, not the last, in a reserved slot", async () => {
    const started: string[] = [];
    const gate = new MediaGate(8);
    const lows = Array.from({ length: 6 }, () => deferred());
    for (let i = 0; i < 6; i += 1) {
      const hold = lows[i]!;
      gate.enqueue(`low-${i}`, "low", async () => {
        started.push(`low-${i}`);
        await hold.promise;
      });
    }
    const plates = [deferred(), deferred(), deferred()];
    for (const [i, id] of ["a", "b", "c"].entries()) {
      const hold = plates[i]!;
      gate.enqueue(id, "low", async () => {
        started.push(id);
        await hold.promise;
      });
    }
    gate.preferMany(["a", "b", "c"]);
    const extras = started.filter((name) => name.length === 1);
    expect(extras[0]).toBe("a");
    expect(extras).toEqual(["a", "b"]);
    expect(gate.queued).toBe(1);
    for (const hold of [...lows, ...plates]) {
      hold.resolve();
    }
    await waitIdle(gate);
    expect(started).toContain("c");
  });

  it("a full stills gate does not block a bits gate", async () => {
    const still = new MediaGate(1);
    const bits = new MediaGate(MAX_BITS_INFLIGHT);
    const hold = deferred();
    const started: string[] = [];
    still.enqueue("still", "low", async () => {
      started.push("still");
      await hold.promise;
    });
    bits.enqueue("z", "high", async () => {
      started.push("z");
    });
    await Promise.resolve();
    expect(started).toEqual(["still", "z"]);
    expect(still.running).toBe(1);
    hold.resolve();
    await waitIdle(still);
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
