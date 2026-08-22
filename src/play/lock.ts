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
