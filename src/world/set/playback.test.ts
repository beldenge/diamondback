import { describe, expect, it } from "vitest";
import { createStillAnim, tickStillAnim } from "./playback";

describe("still anim", () => {
  it("does not advance until marked ready", () => {
    const anim = createStillAnim(["a", "b", "c"]);
    expect(tickStillAnim(anim, 1, 0.1)).toEqual({ frameChanged: false, done: false });
    expect(anim.index).toBe(0);
  });

  it("holds the first frame for one interval, then steps once", () => {
    const anim = createStillAnim(["a", "b", "c"]);
    anim.ready = true;
    expect(tickStillAnim(anim, 0.05, 0.1)).toEqual({ frameChanged: false, done: false });
    expect(anim.index).toBe(0);
    expect(tickStillAnim(anim, 0.05, 0.1)).toEqual({ frameChanged: true, done: false });
    expect(anim.index).toBe(1);
  });

  it("does not skip to the last frame on a hitch", () => {
    const anim = createStillAnim(["a", "b", "c", "d", "e", "f"]);
    anim.ready = true;
    expect(tickStillAnim(anim, 5, 0.1)).toEqual({ frameChanged: true, done: false });
    expect(anim.index).toBe(1);
  });

  it("finishes only after the last frame has been shown for one interval", () => {
    const anim = createStillAnim(["a", "b", "c"]);
    anim.ready = true;
    tickStillAnim(anim, 0.1, 0.1);
    expect(anim.index).toBe(1);
    tickStillAnim(anim, 0.1, 0.1);
    expect(anim.index).toBe(2);
    expect(tickStillAnim(anim, 0.1, 0.1)).toEqual({ frameChanged: false, done: true });
    expect(anim.index).toBe(2);
  });
});
