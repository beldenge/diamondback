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
