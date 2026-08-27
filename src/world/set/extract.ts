/**
 * Local Vite plugin serves `dfextract/out` at `/extract`.
 * Hosted builds set `VITE_EXTRACT_BASE` to the CloudFront origin.
 */
export function extractBase(): string {
  const raw = import.meta.env.VITE_EXTRACT_BASE;
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw.replace(/\/+$/, "");
  }
  return "/extract";
}

/**
 * Hosted stills/Z/sprites should hit the browser HTTP cache. Local Vite
 * extract re-dumps must not stick (`no-cache` + ETag 304).
 */
export function pngFetchCache(prod: boolean): RequestCache {
  return prod ? "default" : "no-cache";
}

/** Path under the extract root, e.g. `SET/_TOWN/scenes.json`. */
export function extractUrl(rel: string): string {
  const encoded = rel
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${extractBase()}/${encoded}`;
}
