import { describe, expect, it } from "vitest";
import { VM } from "../vm/runtime";
import { DustHost } from "./host";
import {
  dustIdleInterval,
  dustTick,
  PUPPET_IDLE_BLINK_SCALE,
  PUPPET_IDLE_GESTURE_SCALE,
  PUPPET_IDLE_SPEAK_FALLBACK_MS,
  PUPPET_IDLE_SPEAK_MIN_TICKS,
  puppetIdleCaption,
  puppetIdleDurationUnits,
  puppetIdleKind,
  puppetTicksToMs,
  puppetUiCursor,
  type PuppetUi,
} from "./ui";

function mockUi(waitEvent: PuppetUi["waitEvent"]): PuppetUi & {
  spoken: string[];
  fidgeted: string[];
  speaking: boolean;
  fidgeting: boolean;
} {
  const spoken: string[] = [];
  const fidgeted: string[] = [];
  const ui = {
    spoken,
    fidgeted,
    speaking: false,
    fidgeting: false,
    async speak(_text: string, _wav?: string, _viseme?: unknown, ident?: string) {
      spoken.push(ident ?? _text);
    },
    async fidget(_wav?: string, _viseme?: unknown, ident?: string) {
      fidgeted.push(ident ?? "");
      ui.fidgeting = true;
    },
    open() {},
    close() {},
    preloadVoices: async () => undefined,
    setViseme() {},
    clear() {},
    addBevel() {},
    waitEvent,
    root: {} as HTMLDivElement,
  };
  return ui as unknown as PuppetUi & {
    spoken: string[];
    fidgeted: string[];
    speaking: boolean;
    fidgeting: boolean;
  };
}

describe("DF.EXE idle interval (0x40B060)", () => {
  it("is (rand15 * duration / 0x7FFF) + 1", () => {
    expect(dustIdleInterval(2600, 0)).toBe(1);
    expect(dustIdleInterval(2600, 0x7fff)).toBe(Math.trunc((0x7ffe * 2600) / 0x7fff) + 1);
    expect(dustIdleInterval(2600, 0x3fff)).toBe(Math.trunc((0x3fff * 2600) / 0x7fff) + 1);
    expect(dustIdleInterval(0, 100)).toBe(1);
  });

  it("uses WAV milliseconds as the duration unit", () => {
    expect(puppetIdleDurationUnits(2.6)).toBe(2600);
    expect(puppetIdleDurationUnits(0, 77)).toBe(PUPPET_IDLE_SPEAK_FALLBACK_MS);
    expect(puppetIdleDurationUnits(0, 29, "gesture")).toBe(1000 * PUPPET_IDLE_GESTURE_SCALE);
  });

  it("scales blink waits to 1/3 of the clip so blinks beat gestures", () => {
    expect(PUPPET_IDLE_BLINK_SCALE).toBe(1 / 3);
    expect(PUPPET_IDLE_GESTURE_SCALE).toBe(3);
    expect(puppetIdleDurationUnits(0.975, 0, "blink")).toBe(Math.round(975 * PUPPET_IDLE_BLINK_SCALE));
    expect(puppetIdleDurationUnits(0.975, 0, "gesture")).toBe(Math.round(975 * PUPPET_IDLE_GESTURE_SCALE));
    expect(puppetIdleDurationUnits(0.975, 0, "speak")).toBe(975);
    const blink = dustIdleInterval(puppetIdleDurationUnits(0.975, 0, "blink"), 0x3fff);
    const gesture = dustIdleInterval(puppetIdleDurationUnits(0.975, 0, "gesture"), 0x3fff);
    expect(blink).toBeLessThan(gesture);
  });

  it("matches the 60 Hz tick clock (timeGetTime * 3 / 50)", () => {
    expect(dustTick(0)).toBe(0);
    expect(dustTick(1000)).toBe(60);
    expect(dustTick(50 / 3)).toBe(1);
  });
});

describe("puppet idle captions", () => {
  it("hides engine idle 1–4 tags and keeps real dialogue lines", () => {
    expect(puppetIdleCaption("idle 4", "idlespeak")).toBe("");
    expect(puppetIdleCaption("idle 1", "blink")).toBe("");
    expect(puppetIdleCaption("idle 2", "*blinks")).toBe("");
    expect(puppetIdleCaption("mayor.10", "Well?")).toBe("Well?");
    expect(puppetIdleCaption("leroy.12", "You want the gun?")).toBe("You want the gun?");
  });
});

describe("puppet idle kind", () => {
  it("uses CSV tags, then idle-slot defaults", () => {
    expect(puppetIdleKind("idle 1", "blink")).toBe("blink");
    expect(puppetIdleKind("idle 1", "*BLINKS")).toBe("blink");
    expect(puppetIdleKind("idle 2", "gesture 1")).toBe("gesture");
    expect(puppetIdleKind("idle 3", "looks left")).toBe("gesture");
    expect(puppetIdleKind("idle 4", "idlespeak")).toBe("speak");
    expect(puppetIdleKind("idle 4", "idle speak")).toBe("speak");
    expect(puppetIdleKind("idle 3", "idlespeak")).toBe("speak");
    expect(puppetIdleKind("idle 4", "*blink")).toBe("blink");
    expect(puppetIdleKind("idle 1", "")).toBe("blink");
    expect(puppetIdleKind("idle 2", "")).toBe("gesture");
    expect(puppetIdleKind("idle 4", "")).toBe("speak");
  });

  it("hourglass is only for spoken lines, not silent fidgets", () => {
    expect(puppetUiCursor(true)).toBe("watch");
    expect(puppetUiCursor(false)).toBe("arrow");
  });
});

describe("puppetevent idle clips", () => {
  it("fidgets idle 1 without speak, not idlefx, on independent timers", async () => {
    let t = 0;
    let polls = 0;
    const ui = mockUi(async (ms) => {
      polls += 1;
      if (polls === 1 && ms !== undefined) {
        t += puppetTicksToMs(2);
        return undefined;
      }
      return 101;
    });

    const host = new DustHost(ui);
    host.nowMs = () => t;
    host.rng = () => 0;
    const intern = host as unknown as {
      puppetLines: Map<string, { text: string; wav: string }>;
    };
    intern.puppetLines.set("idle 1", { text: "blink", wav: "/idle1.wav" });
    intern.puppetLines.set("idle 2", { text: "gesture 1", wav: "/idle2.wav" });
    host.index.add("puppet:day1", {
      name: "idlefx",
      params: [],
      body: [{
        type: "call",
        call: { type: "call", name: "puppetspeak", args: [{ type: "str", value: "gus.17" }] },
      }],
    }, "day1");

    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await vm.inObject("puppet", "day1", async () => {
      await vm.evalCall("puppetbevel", [
        { type: "str", value: "Yes." },
        { type: "num", value: 101 },
      ]);
      const id = await vm.evalCall("puppetevent", [{ type: "num", value: -1 }]);
      expect(id).toBe(101);
    });
    expect(ui.fidgeted[0]).toBe("idle 1");
    expect(ui.spoken).toEqual([]);
    expect(ui.spoken).not.toContain("gus.17");
  });

  it("awaits spoken idle 4 through speak, not fidget", async () => {
    let t = 0;
    let polls = 0;
    const ui = mockUi(async (ms) => {
      polls += 1;
      if (polls === 1 && ms !== undefined) {
        t += puppetTicksToMs(2);
        return undefined;
      }
      return 101;
    });
    const host = new DustHost(ui);
    host.nowMs = () => t;
    host.rng = () => 0;
    const intern = host as unknown as {
      puppetLines: Map<string, { text: string; wav: string }>;
    };
    intern.puppetLines.set("idle 4", { text: "idlespeak", wav: "/idle4.wav" });
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    await vm.inObject("puppet", "day1", async () => {
      await vm.evalCall("puppetbevel", [
        { type: "str", value: "Yes." },
        { type: "num", value: 101 },
      ]);
      const id = await vm.evalCall("puppetevent", [{ type: "num", value: -1 }]);
      expect(id).toBe(101);
    });
    expect(ui.spoken).toEqual(["idle 4"]);
    expect(ui.fidgeted).toEqual([]);
  });

  it("keeps waitEvent live during a silent blink so a bevel click lands", async () => {
    let t = 0;
    let waits = 0;
    const ui = mockUi(async (ms) => {
      waits += 1;
      if (waits === 1 && ms !== undefined) {
        t += puppetTicksToMs(2);
        return undefined;
      }
      expect(ui.fidgeting).toBe(true);
      expect(ui.speaking).toBe(false);
      return 101;
    });
    const host = new DustHost(ui);
    host.nowMs = () => t;
    host.rng = () => 0;
    const intern = host as unknown as {
      puppetLines: Map<string, { text: string; wav: string }>;
    };
    intern.puppetLines.set("idle 1", { text: "blink", wav: "/idle1.wav" });
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    const id = await vm.inObject("puppet", "day1", async () => {
      await vm.evalCall("puppetbevel", [
        { type: "str", value: "Yes." },
        { type: "num", value: 101 },
      ]);
      return vm.evalCall("puppetevent", [{ type: "num", value: -1 }]);
    });
    expect(id).toBe(101);
    expect(ui.fidgeted).toEqual(["idle 1"]);
    expect(ui.spoken).toEqual([]);
    expect(waits).toBe(2);
  });

  it("returns -2 when puppetevent(240) times out", async () => {
    let t = 0;
    const ui = mockUi(async (ms) => {
      if (ms !== undefined) {
        t += ms;
        return undefined;
      }
      return 101;
    });
    const host = new DustHost(ui);
    host.nowMs = () => t;
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    const id = await vm.inObject("puppet", "day1", async () => {
      await vm.evalCall("puppetbevel", [
        { type: "str", value: "Yes." },
        { type: "num", value: 101 },
      ]);
      return vm.evalCall("puppetevent", [{ type: "num", value: 240 }]);
    });
    expect(id).toBe(-2);
  });

  it("does not dump idle 2 and idle 3 in one wake", async () => {
    let t = 0;
    let polls = 0;
    const ui = mockUi(async (ms) => {
      polls += 1;
      if (polls === 1 && ms !== undefined) {
        t += puppetTicksToMs(2);
        return undefined;
      }
      return 101;
    });
    const host = new DustHost(ui);
    host.nowMs = () => t;
    host.rng = () => 0;
    const intern = host as unknown as {
      puppetLines: Map<string, { text: string; wav: string }>;
    };
    intern.puppetLines.set("idle 2", { text: "gesture 1", wav: "/idle2.wav" });
    intern.puppetLines.set("idle 3", { text: "gesture 2", wav: "/idle3.wav" });
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    const id = await vm.inObject("puppet", "day1", async () => {
      await vm.evalCall("puppetbevel", [
        { type: "str", value: "Yes." },
        { type: "num", value: 101 },
      ]);
      return vm.evalCall("puppetevent", [{ type: "num", value: -1 }]);
    });
    expect(id).toBe(101);
    expect(ui.fidgeted).toEqual(["idle 2"]);
    expect(ui.spoken).toEqual([]);
  });

  it("does not replay spoken idle back to back inside puppetevent(240)", async () => {
    let t = 0;
    const ui = mockUi(async (ms) => {
      if (ms !== undefined) {
        t += ms;
        return undefined;
      }
      return 101;
    });
    const host = new DustHost(ui);
    host.nowMs = () => t;
    host.rng = () => 0;
    const intern = host as unknown as {
      puppetLines: Map<string, { text: string; wav: string }>;
    };
    intern.puppetLines.set("idle 4", { text: "idlespeak", wav: "/idle4.wav" });
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    const id = await vm.inObject("puppet", "day1", async () => {
      await vm.evalCall("puppetbevel", [
        { type: "str", value: "Yes." },
        { type: "num", value: 101 },
      ]);
      return vm.evalCall("puppetevent", [{ type: "num", value: 240 }]);
    });
    expect(id).toBe(-2);
    expect(ui.spoken).toEqual(["idle 4"]);
    expect(PUPPET_IDLE_SPEAK_MIN_TICKS).toBe(240);
  });

  it("does not fire idle 4 in the first 240 ticks when the roll is late", async () => {
    const spoken: string[] = [];
    let t = 0;
    const ui = mockUi(async (ms) => {
      if (ms !== undefined) {
        t += ms;
        return undefined;
      }
      return 101;
    });
    ui.speak = async (_text: string, _wav?: string, _viseme?: unknown, ident?: string) => {
      spoken.push(ident ?? _text);
    };
    const host = new DustHost(ui);
    host.nowMs = () => t;
    host.rng = () => 0.999;
    const intern = host as unknown as {
      puppetLines: Map<string, { text: string; wav: string }>;
    };
    intern.puppetLines.set("idle 4", { text: "idlespeak", wav: "/idle4.wav" });
    const vm = new VM({
      call: (name, args, ctx) => host.call(name, args, ctx),
      lookup: (name, ctx) => host.lookup(name, ctx),
      lookupChain: (name, ctx) => host.lookupChain(name, ctx),
    });
    const id = await vm.inObject("puppet", "day1", async () => {
      await vm.evalCall("puppetbevel", [
        { type: "str", value: "Yes." },
        { type: "num", value: 101 },
      ]);
      return vm.evalCall("puppetevent", [{ type: "num", value: 240 }]);
    });
    expect(id).toBe(-2);
    expect(spoken).toEqual([]);
  });

});
