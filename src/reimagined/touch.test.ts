import { describe, expect, it } from "vitest";
import { isTapGesture, stickAxes } from "./touch";

/** The stick's full-deflection radius, in px (see `touch.ts`). */
const RANGE = 56;

describe("stickAxes", () => {
  it("ignores a resting thumb", () => {
    expect(stickAxes(0, 0)).toEqual({ forward: 0, right: 0, sprint: false });
    expect(stickAxes(6, -6).forward).toBe(0);
  });

  it("pushes up for forward and right for strafe", () => {
    const up = stickAxes(0, -RANGE);
    expect(up.forward).toBeCloseTo(1, 6);
    expect(up.right).toBeCloseTo(0, 6);
    const side = stickAxes(RANGE, 0);
    expect(side.right).toBeCloseTo(1, 6);
    expect(side.forward).toBeCloseTo(0, 6);
    expect(stickAxes(0, RANGE).forward).toBeCloseTo(-1, 6);
    expect(stickAxes(-RANGE, 0).right).toBeCloseTo(-1, 6);
  });

  it("never exceeds full deflection, however far the thumb slides", () => {
    for (const push of [RANGE, RANGE * 3, RANGE * 40]) {
      const a = stickAxes(push * 0.6, -push * 0.8);
      expect(Math.hypot(a.forward, a.right)).toBeLessThanOrEqual(1 + 1e-6);
    }
    const far = stickAxes(999, -999);
    expect(Math.hypot(far.forward, far.right)).toBeCloseTo(1, 6);
  });

  it("scales smoothly between the dead zone and the rim", () => {
    const half = stickAxes(0, -RANGE * 0.5);
    expect(half.forward).toBeCloseTo(0.5, 6);
    expect(half.sprint).toBe(false);
  });

  it("runs only when the stick is pushed to the rim", () => {
    expect(stickAxes(0, -RANGE * 0.5).sprint).toBe(false);
    expect(stickAxes(0, -RANGE * 0.84).sprint).toBe(false);
    expect(stickAxes(0, -RANGE).sprint).toBe(true);
    expect(stickAxes(0, -RANGE * 10).sprint).toBe(true);
  });

  it("keeps a diagonal diagonal", () => {
    const a = stickAxes(RANGE, -RANGE);
    expect(a.forward).toBeCloseTo(a.right, 6);
  });
});

describe("isTapGesture", () => {
  it("takes a still, brief press as a tap", () => {
    expect(isTapGesture(0, 60)).toBe(true);
    expect(isTapGesture(13, 399)).toBe(true);
  });

  it("takes a drag or a long press as a look, not a tap", () => {
    expect(isTapGesture(14, 60)).toBe(false);
    expect(isTapGesture(120, 60)).toBe(false);
    expect(isTapGesture(2, 400)).toBe(false);
    expect(isTapGesture(2, 1200)).toBe(false);
  });
});
