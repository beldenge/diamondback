/**
 * Wave table, boss schedule and the ammo economy.
 *
 * Pure functions of the wave number. No state, no assets.
 */

import { BOSS_ORDER, type BossId } from "./bosses";

/**
 * Every wave arrives with a boss on top of its flock. The roster is five
 * deep, so it cycles once every five waves and comes round bigger.
 */
export const BOSS_EVERY = 1;

/** Birds seeded per wave, before the per-tile density cap. */
export const BIRDS_PER_WAVE = 8;

/** More than this on screen at once and the street stops reading. */
export const MAX_BIRDS = 180;

/** Birds allowed to stand on any one camera tile. */
export const MAX_BIRDS_PER_TILE = 6;

export function birdsForWave(wave: number): number {
  const n = Math.max(1, Math.trunc(wave));
  return Math.min(MAX_BIRDS, n * BIRDS_PER_WAVE);
}

export function isBossWave(wave: number): boolean {
  return Math.trunc(wave) > 0 && Math.trunc(wave) % BOSS_EVERY === 0;
}

/**
 * Who walks through the gate on a given wave.
 *
 * The roster is six deep, so a **lap** is six waves. Escalation is by
 * *number*, not size: one boss per wave on the first lap, two at once on
 * the second, three on the third, and so on. Bosses are a fixed size (see
 * `BOSS_SCALE_UNITS`) precisely so that this is the axis that grows —
 * facing three of them is legible in a way that facing one enormous one
 * for the fourth time is not.
 *
 * A doubled wave is **the same boss twice** — two giant cows, not a cow and
 * a pig. Facing a matched pair reads as "more of that thing"; a mixed bag
 * just reads as noise.
 */
export function bossesForWave(wave: number): BossId[] {
  if (!isBossWave(wave)) {
    return [];
  }
  const n = Math.trunc(wave) - 1;
  const roster = BOSS_ORDER.length;
  const id = BOSS_ORDER[n % roster]!;
  const count = Math.floor(n / roster) + 1;
  return Array.from({ length: count }, () => id);
}

/** The first boss of the wave. */
export function bossForWave(wave: number): BossId | null {
  return bossesForWave(wave)[0] ?? null;
}

/**
 * Boss size, as a constant `sheetHeight * scale` product.
 *
 * Bosses are one fixed, enormous size — **not** a per-wave ramp. Growing
 * them each wave sounds like escalation and plays like inconsistency: you
 * never learn how big the thing you are about to fight is, and past a
 * point it is a wall of texture rather than an animal.
 *
 * It has to be a product rather than a flat scale because the sheets are
 * nothing like each other: a chicken frame is 71px tall, a horse 301. The
 * same `scale` on both would draw the horse four times the size. Dividing
 * this constant by the sprite's own height makes every boss land at the
 * same on-screen height, whichever one walks in.
 */
export const BOSS_SCALE_UNITS = 71 * 22500;

/** Scale for a boss whose tallest sheet frame is `spriteHeight` px. */
export function bossScaleFor(spriteHeight: number): number {
  return Math.round(BOSS_SCALE_UNITS / Math.max(1, spriteHeight));
}

/**
 * Shots a boss soaks before it goes. One arrives every wave now, so an
 * early boss has to be cheap or the belt never survives wave three.
 */
export function bossHitsForWave(wave: number): number {
  return 3 + Math.floor(Math.max(1, wave) / 2);
}

/** Bullets in the belt at the start of a run. */
export const STARTING_AMMO = 24;

/** Hard ceiling, so a good run cannot bank infinite bullets. */
export const MAX_AMMO = 48;

/** Awarded for clearing a wave. The only way to get bullets back. */
export function ammoForWaveClear(wave: number): number {
  return 10 + Math.floor(Math.max(1, wave) / 3);
}
