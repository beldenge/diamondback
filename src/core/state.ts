import { advanceEvent, advanceSleep, type ClockSlot } from "./time";

/**
 * Boot defaults from extracted `_BOOTFILE`:
 * `day = 1`, `clock = 2`, `phase = 1`
 * (player arrives late on Day 1, treated as Afternoon).
 */
export interface GlobalState {
  day: number;
  clock: ClockSlot;
  phase: number;
}

export function createInitialState(): GlobalState {
  return { day: 1, clock: 2, phase: 1 };
}

export function sleep(state: GlobalState): GlobalState {
  return { ...state, ...advanceSleep(state.day, state.clock) };
}

export function scriptedTimePass(state: GlobalState): GlobalState {
  return { ...state, ...advanceEvent(state.day, state.clock) };
}
