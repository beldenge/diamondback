/** Original Dust clock slots, from extracted puppet scripts (Trotter/Help/Ruby). */
export type ClockSlot = 1 | 2 | 3;

export const CLOCK_LABELS: Record<ClockSlot, string> = {
  1: "Morning",
  2: "Afternoon",
  3: "Night",
};

export function isClockSlot(value: number): value is ClockSlot {
  return value === 1 || value === 2 || value === 3;
}

export function isNight(clock: ClockSlot): boolean {
  return clock === 3;
}

/**
 * Debug / preview flip between night and the last daytime slot.
 * Does not advance `day` — that stays a sleep / scripted-event thing.
 */
export function toggleDayNight(
  clock: ClockSlot,
  lastDayClock: ClockSlot = 2,
): { clock: ClockSlot; lastDayClock: ClockSlot } {
  if (isNight(clock)) {
    const daySlot: ClockSlot = isNight(lastDayClock) ? 2 : lastDayClock;
    return { clock: daySlot, lastDayClock: daySlot };
  }
  return { clock: 3, lastDayClock: clock };
}

/** Sleep at the hotel: always wake on the next day's morning. */
export function advanceSleep(day: number, clock: ClockSlot): { day: number; clock: ClockSlot } {
  if (day < 1) {
    throw new Error(`day must be >= 1, got ${day}`);
  }
  void clock;
  return { day: day + 1, clock: 1 };
}

/**
 * Scripted time pass (walkabout ends, a scene completes, etc.).
 * Morning → Afternoon → Night → next Morning.
 */
export function advanceEvent(day: number, clock: ClockSlot): { day: number; clock: ClockSlot } {
  if (day < 1) {
    throw new Error(`day must be >= 1, got ${day}`);
  }
  if (clock < 3) {
    return { day, clock: (clock + 1) as ClockSlot };
  }
  return { day: day + 1, clock: 1 };
}

export function formatTime(day: number, clock: ClockSlot): string {
  return `Day ${day} · ${CLOCK_LABELS[clock]}`;
}

export interface LightingPreset {
  sunColor: number;
  sunIntensity: number;
  /** Directional light position (not a unit vector). */
  sunPosition: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  background: number;
}

export const LIGHTING_BY_CLOCK: Record<ClockSlot, LightingPreset> = {
  1: {
    sunColor: 0xffd7a0,
    sunIntensity: 1.15,
    sunPosition: [40, 28, 20],
    hemiSky: 0x9ec6e6,
    hemiGround: 0xc4a06a,
    hemiIntensity: 0.55,
    fogColor: 0xd9c39a,
    fogNear: 40,
    fogFar: 160,
    background: 0x87a8c4,
  },
  2: {
    sunColor: 0xfff2d0,
    sunIntensity: 1.45,
    sunPosition: [-10, 50, 8],
    hemiSky: 0x8eb8e0,
    hemiGround: 0xb8945c,
    hemiIntensity: 0.65,
    fogColor: 0xd2b889,
    fogNear: 50,
    fogFar: 180,
    background: 0x6fa0c8,
  },
  3: {
    sunColor: 0xb8c8e8,
    sunIntensity: 0.18,
    sunPosition: [-20, 30, -30],
    hemiSky: 0x243048,
    hemiGround: 0x1c140c,
    hemiIntensity: 0.32,
    fogColor: 0x10141c,
    fogNear: 22,
    fogFar: 110,
    background: 0x10161f,
  },
};
