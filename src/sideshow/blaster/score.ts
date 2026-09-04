/**
 * Score, combo and the ammo belt.
 *
 * Scoring pays for the chain, not the trigger: every hop is worth more
 * than the one before it, so one shot placed into a dense flock beats
 * twenty aimed ones by a wide margin. That is the whole incentive
 * structure of the mode.
 */

import { MAX_AMMO, STARTING_AMMO, ammoForWaveClear } from "./waves";

/** A bird you shot yourself. */
export const DIRECT_KILL = 100;

/** Added per hop as the cascade travels. Hop 10 is worth 600. */
export const CHAIN_STEP = 50;

export function hopScore(hop: number): number {
  return DIRECT_KILL + Math.max(0, Math.trunc(hop)) * CHAIN_STEP;
}

/** Total for one cascade, seed included. */
export function chainScore(hops: readonly number[]): number {
  let total = 0;
  for (const hop of hops) {
    total += hopScore(hop);
  }
  return total;
}

export function waveClearBonus(wave: number): number {
  return 500 * Math.max(1, Math.trunc(wave));
}

export function bossBonus(wave: number): number {
  return 2500 * Math.max(1, Math.trunc(wave));
}

/**
 * Shells for putting one boss down.
 *
 * Paid **per boss**, not per wave. From the second lap a wave arrives with
 * two or three of them, and each one soaks its own shots — without a
 * per-kill refund a doubled wave costs double the belt for the same single
 * wave-clear payout, and the run dies to arithmetic rather than to play.
 */
export const AMMO_PER_BOSS = 6;

/** Banner shown when a cascade lands. Silence for one lonely bird. */
export function comboBanner(kills: number, depth: number): string | null {
  if (kills < 2) {
    return null;
  }
  if (depth >= 12) {
    return `${kills} BIRDS — THE WHOLE DAMN STREET`;
  }
  if (depth >= 7) {
    return `${kills} BIRDS — FEATHERS EVERYWHERE`;
  }
  if (depth >= 3) {
    return `${kills} BIRDS`;
  }
  return `${kills} birds`;
}

export interface RunSnapshot {
  score: number;
  wave: number;
  ammo: number;
  best: number;
}

/**
 * A run. The player has no health and cannot be hurt — the only thing
 * that ends a run is the belt running empty.
 */
export class Run {
  score = 0;

  wave = 1;

  ammo = STARTING_AMMO;

  /** Longest cascade this run, for the end card. */
  bestChain = 0;

  over = false;

  /** Returns false when the belt is empty — the caller must not fire. */
  spend(): boolean {
    if (this.ammo <= 0) {
      return false;
    }
    this.ammo -= 1;
    if (this.ammo <= 0) {
      this.over = true;
    }
    return true;
  }

  /** Back to a fresh belt for another go. */
  reset(): void {
    this.score = 0;
    this.wave = 1;
    this.ammo = STARTING_AMMO;
    this.bestChain = 0;
    this.over = false;
  }

  /** Shells back, capped. Never enough to make the belt irrelevant. */
  awardAmmo(shells: number): void {
    this.ammo = Math.min(MAX_AMMO, this.ammo + Math.max(0, Math.trunc(shells)));
    if (this.ammo > 0) {
      this.over = false;
    }
  }

  add(points: number): void {
    this.score += Math.max(0, Math.trunc(points));
  }

  noteChain(kills: number): void {
    this.bestChain = Math.max(this.bestChain, kills);
  }

  /**
   * Clearing a wave is the only source of bullets. Refilling can pull a
   * run back from the brink, so the belt going empty mid-wave is final
   * but the wave before it never is.
   */
  clearWave(): void {
    this.add(waveClearBonus(this.wave));
    this.ammo = Math.min(MAX_AMMO, this.ammo + ammoForWaveClear(this.wave));
    this.over = this.ammo <= 0;
    this.wave += 1;
  }
}
