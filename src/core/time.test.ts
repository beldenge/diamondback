import { describe, expect, it } from "vitest";
import {
  advanceEvent,
  advanceSleep,
  CLOCK_LABELS,
  formatTime,
  isClockSlot,
  isNight,
  toggleDayNight,
} from "./time";
import { createInitialState, scriptedTimePass, sleep } from "./state";

describe("clock slots", () => {
  it("accepts the original 1/2/3 values only", () => {
    expect(isClockSlot(1)).toBe(true);
    expect(isClockSlot(2)).toBe(true);
    expect(isClockSlot(3)).toBe(true);
    expect(isClockSlot(0)).toBe(false);
    expect(isClockSlot(4)).toBe(false);
  });

  it("treats slot 3 as night", () => {
    expect(isNight(1)).toBe(false);
    expect(isNight(2)).toBe(false);
    expect(isNight(3)).toBe(true);
  });

  it("labels match extracted AM/PM/night dialogue branches", () => {
    expect(CLOCK_LABELS[1]).toBe("Morning");
    expect(CLOCK_LABELS[2]).toBe("Afternoon");
    expect(CLOCK_LABELS[3]).toBe("Night");
  });
});

describe("toggleDayNight", () => {
  it("sends afternoon or morning to night and remembers the day slot", () => {
    expect(toggleDayNight(2)).toEqual({ clock: 3, lastDayClock: 2 });
    expect(toggleDayNight(1)).toEqual({ clock: 3, lastDayClock: 1 });
  });

  it("returns from night to the remembered morning or afternoon", () => {
    expect(toggleDayNight(3, 1)).toEqual({ clock: 1, lastDayClock: 1 });
    expect(toggleDayNight(3, 2)).toEqual({ clock: 2, lastDayClock: 2 });
  });

  it("falls back to afternoon if the remembered slot is night", () => {
    expect(toggleDayNight(3, 3)).toEqual({ clock: 2, lastDayClock: 2 });
  });
});

describe("advanceSleep", () => {
  it("always wakes on the next morning", () => {
    expect(advanceSleep(1, 2)).toEqual({ day: 2, clock: 1 });
    expect(advanceSleep(1, 3)).toEqual({ day: 2, clock: 1 });
    expect(advanceSleep(2, 1)).toEqual({ day: 3, clock: 1 });
    expect(advanceSleep(4, 3)).toEqual({ day: 5, clock: 1 });
  });

  it("rejects a non-positive day", () => {
    expect(() => advanceSleep(0, 2)).toThrow(/day/);
  });
});

describe("advanceEvent", () => {
  it("walks morning → afternoon → night → next morning", () => {
    expect(advanceEvent(2, 1)).toEqual({ day: 2, clock: 2 });
    expect(advanceEvent(2, 2)).toEqual({ day: 2, clock: 3 });
    expect(advanceEvent(2, 3)).toEqual({ day: 3, clock: 1 });
  });

  it("rejects a non-positive day", () => {
    expect(() => advanceEvent(0, 1)).toThrow(/day/);
  });
});

describe("global state", () => {
  it("boots as the extracted _BOOTFILE (day 1, clock 2, phase 1)", () => {
    expect(createInitialState()).toEqual({ day: 1, clock: 2, phase: 1 });
  });

  it("sleep preserves phase and jumps to next morning", () => {
    const next = sleep({ day: 1, clock: 2, phase: 1 });
    expect(next).toEqual({ day: 2, clock: 1, phase: 1 });
  });

  it("scripted time pass advances one slot", () => {
    expect(scriptedTimePass(createInitialState())).toEqual({
      day: 1,
      clock: 3,
      phase: 1,
    });
  });

  it("formats the HUD string", () => {
    expect(formatTime(1, 2)).toBe("Day 1 · Afternoon");
    expect(formatTime(2, 1)).toBe("Day 2 · Morning");
  });
});
