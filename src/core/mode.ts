export type ClientMode =
  | "landing"
  | "unlocked"
  | "resurrected"
  | "movies"
  | "reimagined"
  | "sideshow";

/**
 * Query `mode`. Empty or unknown URL is the title chooser. `reimagined`
 * is the 3D free-roam card. `sideshow` is the non-canon attraction
 * chooser — which attraction (`&show=`) is parsed inside `src/sideshow/`,
 * so a new attraction never touches `core/`. No aliases (`renewed`,
 * `free`, … all land).
 */
export function clientMode(search: string): ClientMode {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const mode = new URLSearchParams(query).get("mode")?.trim().toLowerCase() ?? "";
  if (
    mode === "resurrected" ||
    mode === "unlocked" ||
    mode === "movies" ||
    mode === "reimagined" ||
    mode === "sideshow"
  ) {
    return mode;
  }
  return "landing";
}

/** Title-chooser click onto Unlocked, before the spoiler dialog is confirmed. */
export function needsUnlockedSpoilerWarning(
  from: ClientMode,
  to: ClientMode,
  confirmed: boolean,
): boolean {
  return from === "landing" && to === "unlocked" && !confirmed;
}

/**
 * Title-chooser New Game (not Continue) when an autosave exists, before
 * the start-over dialog is confirmed.
 */
export function needsNewGameWarning(
  from: ClientMode,
  to: ClientMode,
  hasSave: boolean,
  continueLink: boolean,
  confirmed: boolean,
): boolean {
  return (
    from === "landing" &&
    to === "resurrected" &&
    hasSave &&
    !continueLink &&
    !confirmed
  );
}
