/**
 * The gun hand.
 *
 * `PRP/_HOUSE` group `gunhand` is the original's own first-person hand,
 * and it is authored as a grid: five aim bands (`low`, `lowmid`, `mid`,
 * `midhi`, `Hi`) of thirteen frames each, sweeping the barrel left to
 * right across the frame. Every band also has a `…fire` and a `…recoil`
 * row, plus `idle`, `raise`, `lower` and a seven-frame `reload`.
 *
 * So aiming is a lookup, not an animation: the crosshair's Y picks the
 * band and its X picks the frame. Nothing here is invented — see
 * `dfextract/out/PRP/_HOUSE/props.json`.
 *
 * Pure. No canvas, no assets, no timers.
 */

/** Bottom band first, so a larger index points higher up the street. */
export const AIM_BANDS = ["low", "lowmid", "mid", "midhi", "hi"] as const;

export type AimBand = (typeof AIM_BANDS)[number];

/** Frames per band. The sweep is 0 (hard left) to 12 (hard right). */
export const AIM_STEPS = 13;

/**
 * Sheet state names are inconsistent in exactly one place: the aim row is
 * `Hi` with a capital H, while its own fire and recoil rows are `hifire`
 * and `hirecoil`. Everything is looked up lower-cased to paper over it.
 */
export function aimState(band: AimBand, phase: GunPhase): string {
  if (phase === "fire") {
    return `${band}fire`;
  }
  if (phase === "recoil") {
    return `${band}recoil`;
  }
  return band;
}

export type GunPhase = "aim" | "fire" | "recoil";

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Crosshair Y to aim band. The still is 264 tall; the bottom of the frame
 * is the low band and the top is `Hi`, so the hand rises as you aim up.
 */
export function aimBandFor(y: number, height: number): AimBand {
  if (height <= 0) {
    return "mid";
  }
  const fromBottom = 1 - clamp(y / height, 0, 1);
  const index = clamp(Math.floor(fromBottom * AIM_BANDS.length), 0, AIM_BANDS.length - 1);
  return AIM_BANDS[index]!;
}

/** Crosshair X to the frame index within a band. */
export function aimStepFor(x: number, width: number): number {
  if (width <= 0) {
    return (AIM_STEPS - 1) >> 1;
  }
  return clamp(Math.round((x / width) * (AIM_STEPS - 1)), 0, AIM_STEPS - 1);
}

/** Frames the muzzle flash is held, then the recoil, at 20 Hz. */
export const FIRE_FRAMES = 2;
export const RECOIL_FRAMES = 3;

/**
 * Where the shot came from, so a muzzle flash and the recoil read as one
 * motion: `fire` for two game frames, `recoil` for three, then back to aim.
 */
export function phaseAfter(framesSinceShot: number): GunPhase {
  if (framesSinceShot < 0) {
    return "aim";
  }
  if (framesSinceShot < FIRE_FRAMES) {
    return "fire";
  }
  if (framesSinceShot < FIRE_FRAMES + RECOIL_FRAMES) {
    return "recoil";
  }
  return "aim";
}

export interface GunPose {
  state: string;
  step: number;
}

/** Everything the renderer needs for one frame of the hand. */
export function gunPose(
  crosshairX: number,
  crosshairY: number,
  width: number,
  height: number,
  framesSinceShot: number,
): GunPose {
  const band = aimBandFor(crosshairY, height);
  const phase = phaseAfter(framesSinceShot);
  return { state: aimState(band, phase), step: aimStepFor(crosshairX, width) };
}
