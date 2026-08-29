/**
 * Dust's VM is single-threaded. `walktopuppet` sits in
 * `while iswalk { forceupdate }` with `cursor ("watch")` — no nested
 * mousedown/keydown, no SET walk, no HUD map/inven. Our forceupdate is
 * async, so PlayGame must refuse input while that script owns the VM.
 */
export function worldInputBlocked(state: {
  booting: boolean;
  busy: boolean;
  talking: boolean;
  flatsOpen: boolean;
}): boolean {
  return state.booting || state.busy || state.talking || state.flatsOpen;
}

/**
 * How to treat a press while the idle pump may own the VM.
 *
 * Dust does not throw away `mousedown`. `runQueued` sets `scriptBusy`
 * across idle `makeloop` awaits (crowd loops, `resetgame` after a hand).
 * Folding that into click `talking` dropped the first door / table /
 * hit-stay press; the second worked once the pump returned.
 *
 * `cursor ("watch")` is `walktopuppet` — Dust does not nest mousedown
 * on that walk. A live puppet owns bevels, not the still.
 */
export type WorldMouseGate = "run" | "wait" | "ignore";

export function worldMouseGate(state: {
  booting?: boolean;
  busy?: boolean;
  talking: boolean;
  flatsOpen?: boolean;
  scriptBusy: boolean;
  puppetOpen: boolean;
  cursorWatch: boolean;
}): WorldMouseGate {
  if (state.booting || state.busy || state.talking || state.flatsOpen) {
    return "ignore";
  }
  if (state.puppetOpen) {
    return "ignore";
  }
  if (state.scriptBusy && state.cursorWatch) {
    return "ignore";
  }
  if (state.scriptBusy) {
    return "wait";
  }
  return "run";
}

/** SALGAMES board: the overlay is open on purpose. Same idle-pump rule. */
export function boardMouseGate(state: {
  talking: boolean;
  scriptBusy: boolean;
  puppetOpen: boolean;
}): WorldMouseGate {
  return worldMouseGate({
    talking: state.talking,
    scriptBusy: state.scriptBusy,
    puppetOpen: state.puppetOpen,
    cursorWatch: false,
  });
}

/**
 * `mousedown` `arg` is the press. Checkers `xtocol`/`ytorow` that point
 * as the start square. Using hover after `wait` / `cursorWork` turns a
 * one-square drag into a jump (`delrow` ±2) and `makemove` clears the
 * mid square — the player's own man if they dragged over him.
 */
export function mouseDispatchPoint<T>(kind: "world" | "board", press: T, hover: T | null): T {
  if (kind === "board") {
    return press;
  }
  return hover ?? press;
}

/**
 * Animation-frame idle pump. `forceupdate` already calls `runQueued` on
 * this stack to drain walkEnds. A second tick pump while `scriptBusy`
 * (blackjack `resetgame`) interleaved with that `forceupdate` and the
 * second card never dealt. First hand is a click (`talking`) so tick
 * already stayed off.
 */
export function idlePumpAllowed(talking: boolean, scriptBusy: boolean): boolean {
  return !talking && !scriptBusy;
}

/**
 * HOUSE `butbevel` / speech bar live under `#play-stage`. Capturing the
 * pointer on the stage (CRACK `stilldown`) retargets `click` away from
 * the button — choices and skip-line go dead.
 */
export function isPuppetChromeTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") {
    return false;
  }
  return Boolean(
    (target as Element).closest("#puppet-choices, #puppet-line, .puppet-bevel"),
  );
}

/**
 * `while stilldown` (CRACK tumbler, INVEN drag, FLT hit/stay). A lost
 * `pointerup` holds `talking` for the while-cap. Blur / cancel / lost
 * capture must drop the button.
 */
export function stillDownAfterWindowEvent(type: string): boolean | undefined {
  if (type === "pointerdown") {
    return true;
  }
  if (
    type === "pointerup" ||
    type === "pointercancel" ||
    type === "lostpointercapture" ||
    type === "blur"
  ) {
    return false;
  }
  return undefined;
}
