export type ClientMode =
  | "landing"
  | "unlocked"
  | "resurrected"
  | "movies"
  | "reimagined";

/**
 * Query `mode`. Empty or unknown URL is the title chooser. `reimagined`
 * (the 3D free-roam) is URL-only: it has no chooser card and no aliases
 * (`renewed`, `free`, … all land).
 */
export function clientMode(search: string): ClientMode {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const mode = new URLSearchParams(query).get("mode")?.trim().toLowerCase() ?? "";
  if (
    mode === "resurrected" ||
    mode === "unlocked" ||
    mode === "movies" ||
    mode === "reimagined"
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
