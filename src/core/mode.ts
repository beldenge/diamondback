export type ClientMode = "landing" | "unlocked" | "play" | "movies";

/** Query `mode` plus a `/play` path. Empty URL is the title chooser. */
export function clientMode(search: string, pathname: string): ClientMode {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const mode = new URLSearchParams(query).get("mode")?.trim().toLowerCase() ?? "";
  const path = pathname.replace(/\/+$/, "");
  if (mode === "play" || mode === "resurrected" || path.endsWith("/play")) {
    return "play";
  }
  if (mode === "unlocked") {
    return "unlocked";
  }
  if (mode === "movies" || mode === "gallery") {
    return "movies";
  }
  return "landing";
}
