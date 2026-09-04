import { describe, expect, it } from "vitest";
import { STILL_HEIGHT, STILL_WIDTH } from "../../world/set/types";
import {
  AIM_BANDS,
  AIM_STEPS,
  FIRE_FRAMES,
  RECOIL_FRAMES,
  aimBandFor,
  aimState,
  aimStepFor,
  gunPose,
  phaseAfter,
} from "./gun";

describe("aim bands", () => {
  it("has the five bands the sheet actually ships", () => {
    expect(AIM_BANDS).toEqual(["low", "lowmid", "mid", "midhi", "hi"]);
  });

  it("points low at the bottom of the frame and high at the top", () => {
    expect(aimBandFor(STILL_HEIGHT - 1, STILL_HEIGHT)).toBe("low");
    expect(aimBandFor(0, STILL_HEIGHT)).toBe("hi");
  });

  it("rises monotonically up the frame", () => {
    const seen = [0, 0.25, 0.5, 0.75, 1].map((t) =>
      AIM_BANDS.indexOf(aimBandFor(STILL_HEIGHT * t, STILL_HEIGHT)),
    );
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]!).toBeLessThanOrEqual(seen[i - 1]!);
    }
  });

  it("clamps a crosshair dragged outside the frame", () => {
    expect(aimBandFor(-500, STILL_HEIGHT)).toBe("hi");
    expect(aimBandFor(9999, STILL_HEIGHT)).toBe("low");
  });

  it("falls back to mid with no frame to measure against", () => {
    expect(aimBandFor(10, 0)).toBe("mid");
  });
});

describe("aim sweep", () => {
  it("sweeps the thirteen authored frames left to right", () => {
    expect(aimStepFor(0, STILL_WIDTH)).toBe(0);
    expect(aimStepFor(STILL_WIDTH, STILL_WIDTH)).toBe(AIM_STEPS - 1);
    expect(aimStepFor(STILL_WIDTH / 2, STILL_WIDTH)).toBe(6);
  });

  it("never indexes past the end of a band", () => {
    for (let x = -50; x <= STILL_WIDTH + 50; x += 7) {
      const step = aimStepFor(x, STILL_WIDTH);
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThan(AIM_STEPS);
    }
  });

  it("centres when there is no width", () => {
    expect(aimStepFor(100, 0)).toBe(6);
  });
});

describe("fire and recoil", () => {
  it("stays on the aim row when nothing has been fired", () => {
    expect(phaseAfter(-1)).toBe("aim");
  });

  it("flashes, recoils, then settles back to aim", () => {
    expect(phaseAfter(0)).toBe("fire");
    expect(phaseAfter(FIRE_FRAMES - 1)).toBe("fire");
    expect(phaseAfter(FIRE_FRAMES)).toBe("recoil");
    expect(phaseAfter(FIRE_FRAMES + RECOIL_FRAMES - 1)).toBe("recoil");
    expect(phaseAfter(FIRE_FRAMES + RECOIL_FRAMES)).toBe("aim");
    expect(phaseAfter(500)).toBe("aim");
  });

  it("names the sheet rows the extract actually has", () => {
    expect(aimState("mid", "aim")).toBe("mid");
    expect(aimState("mid", "fire")).toBe("midfire");
    expect(aimState("mid", "recoil")).toBe("midrecoil");
    // The sheet's aim row is `Hi` but its fire/recoil rows are lowercase;
    // every lookup is lower-cased, so `hi` is the name used throughout.
    expect(aimState("hi", "fire")).toBe("hifire");
  });
});

describe("gunPose", () => {
  it("combines band, sweep and phase into one lookup", () => {
    const pose = gunPose(STILL_WIDTH, 0, STILL_WIDTH, STILL_HEIGHT, 0);
    expect(pose).toEqual({ state: "hifire", step: AIM_STEPS - 1 });
  });

  it("aims without firing when no shot is pending", () => {
    const pose = gunPose(0, STILL_HEIGHT, STILL_WIDTH, STILL_HEIGHT, -1);
    expect(pose).toEqual({ state: "low", step: 0 });
  });
});
