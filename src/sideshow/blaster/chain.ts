/**
 * Blast propagation.
 *
 * A chicken that dies detonates every chicken within one tile of it,
 * which detonate their own neighbours, and so on. Birds only ever stand
 * on filmed camera tiles, so a chain spreading by tile adjacency follows
 * the shape of the street on its own and dead-ends where the street
 * does — no separate topology needed.
 *
 * Pure: no canvas, no timers, no game state. The caller turns the
 * returned delays into scheduled pops.
 */

/**
 * Delay between one generation of the chain and the next.
 *
 * **This is a design requirement, not a tuning value.** Detonating a
 * whole chain on one frame is a bang; staggering it makes the cascade
 * visibly crawl down Main Street tile by tile, which is the entire joke.
 * Do not "fix" a chain that looks slow by setting this to 0.
 */
export const CHAIN_HOP_MS = 80;

/** Tiles a detonation reaches. 1 = the eight neighbours plus its own tile. */
export const CHAIN_RADIUS_TILES = 1;

/**
 * Chance a neighbour catches, per hop, as the blast runs out of steam.
 *
 * Without this the mode degenerates: past about wave 8 the flock is dense
 * enough that tile adjacency links nearly all of it into one connected
 * component, so **every** shot cleared **every** bird and the belt never
 * ran dry. Measured at wave 12: one bullet, 96 birds, 43,200 points.
 *
 * The decay keeps the cascade travelling — hop 1 always catches, and the
 * tail is long enough that a street-clearing monster is still possible —
 * but makes it the rare payoff rather than the default outcome. Raise
 * `CHAIN_DECAY` for longer chains, lower it for stingier ones.
 */
export const CHAIN_DECAY = 0.86;

/** Floor, so a long chain thins out instead of stopping dead. */
export const CHAIN_MIN_CATCH = 0.12;

export function catchChance(hop: number): number {
  if (hop <= 1) {
    return 1;
  }
  return Math.max(CHAIN_MIN_CATCH, CHAIN_DECAY ** (hop - 1));
}

export interface ChainTarget {
  id: number;
  /** Tile coordinates, not world units. */
  tx: number;
  ty: number;
}

export interface Detonation {
  id: number;
  /** Milliseconds after the triggering shot. */
  delayMs: number;
  /** 0 for the bird that was shot, 1 for its neighbours, and so on. */
  hop: number;
}

function withinRadius(a: ChainTarget, b: ChainTarget, radius: number): boolean {
  return Math.abs(a.tx - b.tx) <= radius && Math.abs(a.ty - b.ty) <= radius;
}

/**
 * Breadth-first from the bird that was shot. Every bird reached is
 * returned exactly once, with the delay for its generation.
 *
 * `targets` should be the live birds only — a bird already queued to pop
 * must not be handed back in, or one shot into a dense flock re-detonates
 * the same birds every frame.
 */
export function chainDetonations(
  seedId: number,
  targets: readonly ChainTarget[],
  hopMs: number = CHAIN_HOP_MS,
  radius: number = CHAIN_RADIUS_TILES,
  rand: () => number = Math.random,
): Detonation[] {
  const seed = targets.find((t) => t.id === seedId);
  if (!seed) {
    return [];
  }
  const remaining = targets.filter((t) => t.id !== seedId);
  const out: Detonation[] = [{ id: seedId, delayMs: 0, hop: 0 }];
  let frontier: ChainTarget[] = [seed];
  let hop = 0;

  while (frontier.length > 0 && remaining.length > 0) {
    hop += 1;
    const chance = catchChance(hop);
    const next: ChainTarget[] = [];
    // Walk backwards so splicing does not skip the following entry.
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      const candidate = remaining[i]!;
      if (!frontier.some((lit) => withinRadius(lit, candidate, radius))) {
        continue;
      }
      // A bird the blast reached but did not light stays in `remaining`,
      // so a later hop from another direction can still catch it.
      if (chance < 1 && rand() >= chance) {
        continue;
      }
      remaining.splice(i, 1);
      next.push(candidate);
    }
    for (const bird of next) {
      out.push({ id: bird.id, delayMs: hop * hopMs, hop });
    }
    frontier = next;
  }
  return out;
}

/** Longest hop in a chain — what the combo banner counts. */
export function chainDepth(chain: readonly Detonation[]): number {
  let deepest = 0;
  for (const det of chain) {
    deepest = Math.max(deepest, det.hop);
  }
  return deepest;
}
