import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatMovieClock,
  movieClipsStarting,
  movieDurationSec,
  movieFrameWaitsForClick,
  movieIndexAt,
  movieWaitSetsSkipClick,
  planMoviePasses,
  type MovieTimeline,
} from "./movies";

describe("inspect movie hold", () => {
  it("waits only on MOV actionframe stills, not every spotmovie", () => {
    expect(movieFrameWaitsForClick(1)).toBe(true);
    expect(movieFrameWaitsForClick(8)).toBe(true);
    expect(movieFrameWaitsForClick(0)).toBe(false);
    expect(movieFrameWaitsForClick(undefined)).toBe(false);
  });

  it("does not skip the next real click after an actionframe pointerdown", () => {
    expect(movieWaitSetsSkipClick("click")).toBe(false);
    expect(movieWaitSetsSkipClick("pointerdown")).toBe(false);
    expect(movieWaitSetsSkipClick("pointerup")).toBe(true);
  });

  it("warning / bone inspect stills wait; dog1 does not", () => {
    const warning = resolve("dfextract/out/MOV/_WARNING/timeline.json");
    const dog1 = resolve("dfextract/out/MOV/_DOG1/timeline.json");
    const bone = resolve("dfextract/out/MOV/_BONE/timeline.json");
    if (![warning, dog1, bone].every((p) => existsSync(p))) {
      return;
    }
    const warn = JSON.parse(readFileSync(warning, "utf8")) as MovieTimeline;
    const dog = JSON.parse(readFileSync(dog1, "utf8")) as MovieTimeline;
    const item = JSON.parse(readFileSync(bone, "utf8")) as MovieTimeline;
    expect(warn.frames.some((frame) => movieFrameWaitsForClick(frame.action))).toBe(true);
    expect(item.frames.some((frame) => movieFrameWaitsForClick(frame.action))).toBe(true);
    expect(dog.frames.some((frame) => movieFrameWaitsForClick(frame.action))).toBe(false);
  });
});

describe("movie duration", () => {
  it("formats mm:ss from the timeline clock", () => {
    expect(formatMovieClock(0)).toBe("0:00");
    expect(formatMovieClock(42.15)).toBe("0:42");
    expect(formatMovieClock(101.3)).toBe("1:41");
  });

  it("prefers duration_seconds, else ticks", () => {
    expect(movieDurationSec({ duration_ticks: 2529, duration_seconds: 42.15, frames: [] })).toBe(42.15);
    expect(movieDurationSec({ duration_ticks: 2529, tick_hz: 60, frames: [] })).toBeCloseTo(42.15);
  });
});

describe("movie clock", () => {
  it("picks the still whose hold covers now", () => {
    const holds = [20 / 60, 3 / 60, 3 / 60, 10 / 60, 3 / 60, 20 / 60];
    expect(movieIndexAt(holds, 0)).toBe(0);
    expect(movieIndexAt(holds, 19 / 60)).toBe(0);
    expect(movieIndexAt(holds, 20 / 60)).toBe(1);
    expect(movieIndexAt(holds, 23 / 60)).toBe(2);
    expect(movieIndexAt(holds, 26 / 60)).toBe(3);
    expect(movieIndexAt(holds, 58 / 60)).toBe(5);
  });

  it("fires each clip once in (prev, now]", () => {
    const starts = [20 / 60, 26 / 60];
    expect(movieClipsStarting(starts, -1, 0)).toEqual([]);
    expect(movieClipsStarting(starts, 19 / 60, 20 / 60)).toEqual([0]);
    expect(movieClipsStarting(starts, 20 / 60, 25 / 60)).toEqual([]);
    expect(movieClipsStarting(starts, 25 / 60, 26 / 60)).toEqual([1]);
    expect(movieClipsStarting(starts, 19 / 60, 27 / 60)).toEqual([0, 1]);
  });
});

describe("dog1.mov", () => {
  it("turns two stacked A1 growls into two sequential passes", () => {
    const path = resolve("dfextract/out/MOV/_DOG1/timeline.json");
    if (!existsSync(path)) {
      return;
    }
    const timeline = JSON.parse(readFileSync(path, "utf8")) as MovieTimeline;
    expect(timeline.duration_ticks).toBe(59);
    expect(timeline.frames).toHaveLength(6);
    const clips = timeline.clips ?? [];
    expect(clips).toHaveLength(2);
    expect(clips.map((clip) => clip.container)).toEqual([1, 1]);
    expect(clips[0]!.start_tick).toBe(20);
    expect(clips[1]!.start_tick).toBe(26);
    const hz = timeline.tick_hz || 60;
    const holds = (timeline.frames ?? []).map((frame) => (frame.hold_ticks ?? 0) / hz);
    const passes = planMoviePasses(
      holds,
      clips.map((clip) => ({
        startSec: clip.start_tick / hz,
        channel: clip.channel,
        durationSec: 0.88,
      })),
    );
    expect(passes).toHaveLength(2);
    expect(passes[0]!.clips).toHaveLength(1);
    expect(passes[1]!.clips).toHaveLength(1);
    expect(passes[0]!.clips[0]!.startSec).toBeCloseTo(20 / 60);
    expect(passes[0]!.passSec).toBeGreaterThan(holds.reduce((a, b) => a + b, 0));
    expect(passes[1]!.passSec).toBe(passes[0]!.passSec);
  });

  it("leaves a single-cue reel as one pass", () => {
    const holds = [20 / 60, 3 / 60, 20 / 60];
    const passes = planMoviePasses(holds, [
      { startSec: 0, channel: "A1", durationSec: 0.9 },
    ]);
    expect(passes).toHaveLength(1);
    expect(passes[0]!.clips).toHaveLength(1);
  });
});
