export type ClientMode = "landing" | "unlocked" | "resurrected" | "movies";

/** Query `mode`. Empty or unknown URL is the title chooser. */
export function clientMode(search: string): ClientMode {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const mode = new URLSearchParams(query).get("mode")?.trim().toLowerCase() ?? "";
  if (mode === "resurrected" || mode === "unlocked" || mode === "movies") {
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
