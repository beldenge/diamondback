import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  actionFrameAfterPlay,
  formatMovieClock,
  movieChainName,
  movieClickToStill,
  MOV_A_IDLE_RESTART_SEC,
  MOV_WAVEHDR_BYTES,
  MOV_WAVE_RATE,
  movieClipsAtStart,
  armMovieBedFollow,
  movieBedContinues,
  movieClipsForRec,
  movieFollowBedIndex,
  movieQueueWhen,
  movieClipsStarting,
  movieDurationSec,
  movieFrameWaitsForAudio,
  movieFrameWaitsForClick,
  moviePlaybackSec,
  movieRecStopsReel,
  movieHotspotPlaysClip,
  movieHotspotSegmentEnd,
  movieIndexAt,
  movieWaitSetsSkipClick,
  pickMovieHotspot,
  type MovieTimeline,
} from "./movies";

describe("inspect movie hold", () => {
  it("waits only on inspect stills, not grocpots/bell command counts", () => {
    expect(movieFrameWaitsForClick(1)).toBe(true);
    expect(movieFrameWaitsForClick(2)).toBe(false);
    expect(movieFrameWaitsForClick(4)).toBe(false);
    expect(movieFrameWaitsForClick(0)).toBe(false);
    expect(movieFrameWaitsForClick(undefined)).toBe(false);
    expect(movieFrameWaitsForClick(2, true)).toBe(true);
    expect(movieFrameWaitsForClick(1, false)).toBe(false);
  });

  it("does not skip the next real click after an actionframe pointerdown", () => {
    expect(movieWaitSetsSkipClick("click")).toBe(false);
    expect(movieWaitSetsSkipClick("pointerdown")).toBe(false);
    expect(movieWaitSetsSkipClick("pointerup")).toBe(true);
  });

  it("marks a finished playmovie as actionframe 1", () => {
    expect(actionFrameAfterPlay(true)).toBe(1);
    expect(actionFrameAfterPlay(false)).toBe(0);
    expect(actionFrameAfterPlay(true, true)).toBe(0);
  });

  it("kiddie.mov is three timed click windows that timeout to kidwin.mov", () => {
    const rel = resolve("dfextract/out/MOV/_KIDDIE/timeline.json");
    if (!existsSync(rel)) {
      return;
    }
    const tl = JSON.parse(readFileSync(rel, "utf8")) as MovieTimeline;
    const dests = [
      ...new Set(
        (tl.frames ?? []).flatMap((frame) => (frame.hotspots ?? []).map((spot) => spot.dest)),
      ),
    ].sort((a, b) => a - b);
    expect(dests).toEqual([20, 32, 49]);
    expect(tl.frames?.every((frame) => frame.wait !== true)).toBe(true);
    const timeouts = (tl.frames ?? []).filter((frame) => frame.timeout_movie);
    expect(timeouts).toHaveLength(3);
    expect(timeouts.every((frame) => frame.timeout_movie === "kidwin.mov")).toBe(true);
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
    expect(
      warn.frames.some((frame) => movieFrameWaitsForClick(frame.action, frame.wait)),
    ).toBe(true);
    expect(
      item.frames.some((frame) => movieFrameWaitsForClick(frame.action, frame.wait)),
    ).toBe(true);
    expect(
      dog.frames.some((frame) => movieFrameWaitsForClick(frame.action, frame.wait)),
    ).toBe(false);
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

  it("playback clock waits out group-A then the still hold", () => {
    const timeline: MovieTimeline = {
      duration_ticks: 60,
      tick_hz: 60,
      frames: [
        { container: 1, hold_ticks: 30, start_tick: 0, wait_audio: true },
        { container: 2, hold_ticks: 30, start_tick: 30 },
      ],
      clips: [{ container: 9, start_tick: 0, channel: "A1", duration_ticks: 120 }],
    };
    expect(movieDurationSec(timeline)).toBe(1);
    expect(moviePlaybackSec(timeline)).toBeCloseTo(2 + MOV_A_IDLE_RESTART_SEC + 1, 5);
  });

  it("B beds do not stretch wait_audio", () => {
    const timeline: MovieTimeline = {
      duration_ticks: 30,
      tick_hz: 60,
      frames: [{ container: 1, hold_ticks: 30, start_tick: 0, wait_audio: true }],
      clips: [{ container: 4, start_tick: 0, channel: "B", duration_ticks: 600 }],
    };
    expect(moviePlaybackSec(timeline)).toBeCloseTo(0.5 + MOV_A_IDLE_RESTART_SEC, 5);
  });

  it("d1nd2m still table is ~18s; wait_audio stretches the picture-show clock", () => {
    const path = resolve("dfextract/out/MOV/_D1ND2M/timeline.json");
    if (!existsSync(path)) {
      return;
    }
    const timeline = JSON.parse(readFileSync(path, "utf8")) as MovieTimeline;
    const table = movieDurationSec(timeline);
    expect(table).toBeCloseTo(18.58, 1);
    const play = moviePlaybackSec(timeline);
    expect(play).toBeGreaterThan(table);
    if ((timeline.clips ?? []).some((clip) => (clip.duration_ticks ?? 0) > 0)) {
      expect(play).toBeGreaterThan(30);
    }
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

describe("spotmovie SFX commands", () => {
  it("schedules one grocpots clang at the swing dest-frame", () => {
    const path = resolve("dfextract/out/MOV/_GROCPOTS/timeline.json");
    if (!existsSync(path)) {
      return;
    }
    const timeline = JSON.parse(readFileSync(path, "utf8")) as MovieTimeline;
    expect(timeline.frames[1]?.wait).toBe(true);
    expect((timeline.frames[1]?.hotspots ?? []).length).toBe(2);
    expect(timeline.clips ?? []).toEqual([
      { container: 1, start_tick: 42, channel: "A1", duration_ticks: 81 },
    ]);
  });

  it("schedules each mission-bell clip at its dest-frame", () => {
    const path = resolve("dfextract/out/MOV/_BELL/timeline.json");
    if (!existsSync(path)) {
      return;
    }
    const timeline = JSON.parse(readFileSync(path, "utf8")) as MovieTimeline;
    expect(timeline.frames[1]?.wait).toBe(true);
    expect(timeline.frames[1]?.hotspots).toEqual([
      { top: 11, left: 85, bottom: 188, right: 223, dest: 2, channel: "A1" },
      { top: 11, left: 222, bottom: 190, right: 377, dest: 22, channel: "A2" },
      { top: 11, left: 377, bottom: 155, right: 462, dest: 43, channel: "A3" },
      { top: 0, left: 0, bottom: 264, right: 512, dest: 64, channel: "" },
    ]);
    expect(timeline.clips ?? []).toEqual([
      { container: 1, start_tick: 18, channel: "A1", duration_ticks: 228 },
      { container: 2, start_tick: 78, channel: "A2", duration_ticks: 215 },
      { container: 3, start_tick: 141, channel: "A3", duration_ticks: 251 },
    ]);
  });

  it("cmd-count 0 end_kind 1 ends a dest segment", () => {
    expect(movieRecStopsReel({ action: 0, endKind: 1 })).toBe(true);
    expect(movieRecStopsReel({ action: 2, endKind: 1 })).toBe(false);
    expect(movieRecStopsReel({ action: 0, wait: true, endKind: 1 })).toBe(false);
    expect(movieRecStopsReel({ action: 0, endKind: 2 })).toBe(false);
    expect(movieRecStopsReel({ action: 0, end_kind: 1 })).toBe(true);
  });

  it("deserend town goodbye is stills after the first end_kind 1", () => {
    const path = resolve("dfextract/out/MOV/_DESEREND/timeline.json");
    if (!existsSync(path)) {
      return;
    }
    const timeline = JSON.parse(readFileSync(path, "utf8")) as MovieTimeline;
    const frames = timeline.frames ?? [];
    const firstStop = frames.findIndex((frame) => frame.end_kind === 1);
    expect(firstStop).toBeGreaterThan(0);
    expect(firstStop).toBeLessThan(frames.length - 1);
    expect(frames[firstStop + 1]?.container).toBeGreaterThan(frames[firstStop]?.container ?? 0);
    expect(moviePlaybackSec(timeline)).toBeGreaterThan(40);
    expect(timeline.next ?? "").toBe("");
    const hz = timeline.tick_hz || 60;
    const clips = (timeline.clips ?? []).map((clip) => ({
      startSec: clip.start_tick / hz,
      durationSec: (clip.duration_ticks ?? 0) / hz,
      channel: clip.channel,
    }));
    const goodbye = clips.findIndex(
      (clip) => clip.channel === "A1" && Math.abs(clip.startSec - 809 / hz) < 1e-6,
    );
    expect(goodbye).toBeGreaterThanOrEqual(0);
    expect(movieClipsAtStart(clips.map((clip) => clip.startSec), 807 / hz)).toEqual([]);
    expect(movieClipsForRec(clips, 787 / hz, 807 / hz)).not.toContain(goodbye);
    expect(movieClipsForRec(clips, 807 / hz, 819 / hz)).toContain(goodbye);
  });

  it("SAFEBOX take-stone is a playhead jump, not a bell segment", () => {
    const path = resolve("dfextract/out/MOV/_SAFEBOX/timeline.json");
    if (!existsSync(path)) {
      return;
    }
    const timeline = JSON.parse(readFileSync(path, "utf8")) as MovieTimeline;
    const waits = (timeline.frames ?? []).filter((frame) => frame.wait === true);
    expect(waits.length).toBeGreaterThanOrEqual(2);
    const take = waits[1]?.hotspots?.[0];
    expect(take?.dest).toBe(17);
    expect(take?.channel ?? "").toBe("");
    const clips = timeline.clips ?? [];
    expect(movieHotspotPlaysClip("A1", clips)).toBe(true);
    expect(movieHotspotPlaysClip("", clips)).toBe(false);
    expect(movieHotspotPlaysClip("A65516", clips)).toBe(false);
    const takeStop = timeline.frames[31];
    expect(take?.dest).toBeLessThan(35);
    expect(movieRecStopsReel(takeStop)).toBe(true);
    expect(takeStop?.end_kind).toBe(1);
    expect((take?.dest ?? 0) < 31 && 31 < 35).toBe(true);
  });

  it("picks mission-bell rects in command order", () => {
    const spots = [
      { top: 11, left: 85, bottom: 188, right: 223, dest: 2, channel: "A1" },
      { top: 11, left: 222, bottom: 190, right: 377, dest: 22, channel: "A2" },
      { top: 11, left: 377, bottom: 155, right: 462, dest: 43, channel: "A3" },
      { top: 0, left: 0, bottom: 264, right: 512, dest: 64, channel: "" },
    ];
    expect(movieHotspotPlaysClip("A1", [{ channel: "A1" }])).toBe(true);
    expect(movieHotspotPlaysClip("", [{ channel: "A1" }])).toBe(false);
    expect(movieHotspotPlaysClip("A65516", [{ channel: "A1" }])).toBe(false);
    expect(pickMovieHotspot(150, 100, spots)?.channel).toBe("A1");
    expect(pickMovieHotspot(300, 100, spots)?.channel).toBe("A2");
    expect(pickMovieHotspot(400, 80, spots)?.channel).toBe("A3");
    expect(pickMovieHotspot(10, 200, spots)?.dest).toBe(64);
    expect(movieHotspotSegmentEnd(2, spots, 66)).toBe(22);
    expect(movieHotspotSegmentEnd(22, spots, 66)).toBe(43);
    expect(movieHotspotSegmentEnd(43, spots, 66)).toBe(64);
    expect(movieClickToStill(10, 10, { left: 0, top: 0, width: 512, height: 264 }, 512, 264)).toEqual(
      { x: 10, y: 10 },
    );
  });

  it("padre A2 script names only towerup.mov", () => {
    const path = resolve("dfextract/out/SET/_PADRE/Scene A2.txt");
    if (!existsSync(path)) {
      return;
    }
    const text = readFileSync(path, "utf8");
    expect(text).toMatch(/spotmovie \("towerup\.mov"\)/);
    expect(text).not.toMatch(/towertop/i);
    expect(text).not.toMatch(/towerdn/i);
    expect(text).not.toMatch(/bell\.mov/i);
  });

  it("follows towerup → towertop → towerdn from the MOV next field", () => {
    const up = resolve("dfextract/out/MOV/_TOWERUP/timeline.json");
    const top = resolve("dfextract/out/MOV/_TOWERTOP/timeline.json");
    const down = resolve("dfextract/out/MOV/_TOWERDN/timeline.json");
    if (![up, top, down].every((p) => existsSync(p))) {
      return;
    }
    const climb = JSON.parse(readFileSync(up, "utf8")) as MovieTimeline;
    const examine = JSON.parse(readFileSync(top, "utf8")) as MovieTimeline;
    const descend = JSON.parse(readFileSync(down, "utf8")) as MovieTimeline;
    expect(movieChainName(climb.next)).toBe("towertop.mov");
    expect(movieChainName(examine.next)).toBe("towerdn.mov");
    expect(movieChainName(descend.next)).toBeUndefined();
    expect(examine.frames[2]?.wait).toBe(true);
    const spots = examine.frames[2]?.hotspots ?? [];
    expect(spots).toHaveLength(5);
    expect(spots[0]?.movie).toBe("bellmoon.mov");
    expect(spots[1]?.movie).toBe("bellbarn.mov");
    expect(spots[2]?.dest).toBe(24);
    expect(spots[3]?.dest).toBe(3);
    expect(spots[3]?.channel).toBe("A1");
    expect(spots[4]?.movie).toBe("belltown.mov");
    expect(pickMovieHotspot(230, 90, spots)?.channel).toBe("A1");
    expect(pickMovieHotspot(400, 100, spots)?.movie).toBe("bellmoon.mov");
    expect(pickMovieHotspot(20, 80, spots)?.movie).toBe("bellbarn.mov");
    expect(pickMovieHotspot(200, 160, spots)?.movie).toBe("belltown.mov");
    expect(pickMovieHotspot(200, 220, spots)?.dest).toBe(24);
    expect(movieHotspotSegmentEnd(3, spots, 25)).toBe(24);
  });

  it("accepts only a clean .mov chain name", () => {
    expect(movieChainName("towertop.mov")).toBe("towertop.mov");
    expect(movieChainName("TOWERDN")).toBe("towerdn.mov");
    expect(movieChainName("intro2.mov''''''''")).toBeUndefined();
    expect(movieChainName("")).toBeUndefined();
  });

  it("does not dump harmonica notes on inspect open", () => {
    const path = resolve("dfextract/out/MOV/_HARMON/timeline.json");
    if (!existsSync(path)) {
      return;
    }
    const timeline = JSON.parse(readFileSync(path, "utf8")) as MovieTimeline;
    expect(timeline.clips ?? []).toEqual([]);
    expect(timeline.frames.some((frame) => movieFrameWaitsForClick(frame.action, frame.wait))).toBe(
      true,
    );
  });
});

describe("movie A idle restart", () => {
  it("is one 0x4000-byte WAVEHDR at 22050 Hz 8-bit", () => {
    expect(MOV_WAVEHDR_BYTES).toBe(0x4000);
    expect(MOV_WAVE_RATE).toBe(22050);
    expect(MOV_A_IDLE_RESTART_SEC).toBeCloseTo(0x4000 / 22050, 6);
    expect(MOV_A_IDLE_RESTART_SEC).toBeGreaterThan(0.7);
    expect(MOV_A_IDLE_RESTART_SEC).toBeLessThan(0.8);
  });
});

describe("movieClipsAtStart", () => {
  it("matches clips to a rec start, not a time window", () => {
    const starts = [20 / 60, 26 / 60];
    expect(movieClipsAtStart(starts, 20 / 60)).toEqual([0]);
    expect(movieClipsAtStart(starts, 23 / 60)).toEqual([]);
    expect(movieClipsAtStart(starts, 26 / 60)).toEqual([1]);
  });
});

describe("dog1.mov", () => {
  it("waits for A mixer idle on recs 2 and 4 (rec+0x1A bit 0)", () => {
    const path = resolve("dfextract/out/MOV/_DOG1/timeline.json");
    if (!existsSync(path)) {
      return;
    }
    const timeline = JSON.parse(readFileSync(path, "utf8")) as MovieTimeline;
    expect(timeline.duration_ticks).toBe(59);
    expect(timeline.frames).toHaveLength(6);
    expect(timeline.frames.map((frame) => frame.hold_ticks)).toEqual([20, 3, 3, 10, 3, 20]);
    expect(timeline.frames.map((frame) => movieFrameWaitsForAudio(frame.wait_audio))).toEqual([
      false,
      false,
      true,
      false,
      true,
      false,
    ]);
    const clips = timeline.clips ?? [];
    expect(clips).toHaveLength(2);
    expect(clips.map((clip) => clip.container)).toEqual([1, 1]);
    expect(clips[0]!.start_tick).toBe(20);
    expect(clips[1]!.start_tick).toBe(26);
    const hz = timeline.tick_hz || 60;
    const starts = clips.map((clip) => clip.start_tick / hz);
    expect(movieClipsAtStart(starts, 20 / hz)).toEqual([0]);
    expect(movieClipsAtStart(starts, 23 / hz)).toEqual([]);
    expect(movieClipsAtStart(starts, 26 / hz)).toEqual([1]);
  });
});

describe("INTRO2 group B bed", () => {
  it("fires B clips that sit between still recs", () => {
    const path = resolve("dfextract/out/MOV/_INTRO2/timeline.json");
    if (!existsSync(path)) {
      return;
    }
    const timeline = JSON.parse(readFileSync(path, "utf8")) as MovieTimeline;
    const hz = timeline.tick_hz || 60;
    const recStarts = new Set((timeline.frames ?? []).map((frame) => frame.start_tick));
    expect(recStarts.has(0)).toBe(true);
    expect(recStarts.has(365)).toBe(false);
    expect(recStarts.has(727)).toBe(false);
    const clips = (timeline.clips ?? []).map((clip) => ({
      startSec: clip.start_tick / hz,
      durationSec: (clip.duration_ticks ?? 0) / hz,
      channel: clip.channel,
    }));
    const starts = clips.map((clip) => clip.startSec);
    expect(movieClipsAtStart(starts, 363 / hz)).toEqual([]);
    expect(movieClipsAtStart(starts, 366 / hz)).toEqual([]);
    const first = movieClipsForRec(clips, 0, 30 / hz);
    const head = first.find((i) => clips[i]?.channel === "B" && clips[i]?.startSec === 0);
    expect(head).toBeDefined();
    expect(movieBedContinues(clips[head!]!, clips[movieFollowBedIndex(clips, head!)!]!)).toBe(true);
    const mid = movieClipsForRec(clips, 363 / hz, 366 / hz);
    expect(mid.some((i) => Math.abs((clips[i]?.startSec ?? 0) - 365 / hz) < 1e-6)).toBe(false);
    const later = movieClipsForRec(clips, 726 / hz, 729 / hz);
    expect(later.some((i) => Math.abs((clips[i]?.startSec ?? 0) - 727 / hz) < 1e-6)).toBe(false);
    const second = movieFollowBedIndex(clips, head!);
    expect(second).toBeDefined();
    expect(Math.abs((clips[second!]!.startSec) - 365 / hz)).toBeLessThan(1e-6);
    const third = movieFollowBedIndex(clips, second!);
    expect(third).toBeDefined();
    expect(Math.abs((clips[third!]!.startSec) - 727 / hz)).toBeLessThan(1e-6);
    const tableEnd = (timeline.duration_ticks ?? 0) / hz;
    expect(movieFollowBedIndex(clips, third!, tableEnd)).toBeUndefined();
  });

  it("queues the next B clip without waiting for onended", async () => {
    const clips = [
      { startSec: 0, durationSec: 6, channel: "B", url: "a" },
      { startSec: 6, durationSec: 6, channel: "B", url: "b" },
      { startSec: 12, durationSec: 8, channel: "B", url: "c" },
    ];
    const played: string[] = [];
    armMovieBedFollow(
      clips,
      0,
      async (clip) => {
        played.push(clip.url ?? "");
      },
      () => false,
    );
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }
    expect(played).toEqual(["b", "c"]);
  });
});

describe("movieQueueWhen", () => {
  it("joins a queued bed at the previous channel end", () => {
    expect(movieQueueWhen(1, 7, true)).toBe(7);
    expect(movieQueueWhen(8, 7, true)).toBe(8);
    expect(movieQueueWhen(1, 7, false)).toBe(1);
    expect(movieQueueWhen(1, undefined, true)).toBe(1);
  });
});

describe("dog2.mov", () => {
  it("waits for A mixer idle on rec 5", () => {
    const path = resolve("dfextract/out/MOV/_DOG2/timeline.json");
    if (!existsSync(path)) {
      return;
    }
    const timeline = JSON.parse(readFileSync(path, "utf8")) as MovieTimeline;
    expect(timeline.frames).toHaveLength(7);
    expect(timeline.frames.map((frame) => movieFrameWaitsForAudio(frame.wait_audio))).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
  });
});
