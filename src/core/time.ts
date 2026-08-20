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
