/**
 * Extract cache for the hosted site.
 *
 * Dust streamed a filmstrip off a CD: one seek, one sequential read, then
 * playback from RAM. We replaced that with ~18 independent HTTPS round
 * trips per step, which is why the hosted site hitches where a 1995
 * machine did not — the bytes per frame are actually *smaller* now, the
 * access pattern is what regressed. This puts the extract on the local
 * disk so that after the first visit the walker reads from storage
 * instead of the network, the way the original read from the disc.
 *
 * Deliberately narrow, because a service worker is sticky and a bad one
 * bricks a site:
 *
 * - **Only the extract.** HTML, JS and CSS are never intercepted, so a
 *   Pages deploy behaves exactly as it does today and this can never
 *   serve a stale app shell.
 * - **The extract origin is baked into the SW URL** (`?base=…`), so the
 *   worker knows what to cache on its very first fetch, with no message
 *   round trip. Change `VITE_EXTRACT_BASE` — as the versioned-prefix
 *   upload plan does — and the SW URL changes, the browser installs a new
 *   worker, and `activate` deletes the cache belonging to the old base.
 * - **`EPOCH` is the manual escape hatch.** Bump it to throw away every
 *   cached extract on next load, without touching the upload.
 * - **`?nosw=1`** on the page unregisters and wipes (see `precache.ts`).
 */

const EPOCH = "1";

/** Stop caching new objects past this. Town + night stills are ~118 MB. */
const BUDGET_BYTES = 320 * 1024 * 1024;

/** Background warming runs this many fetches at a time. */
const WARM_CONCURRENCY = 2;

const params = new URL(self.location.href).searchParams;
const BASE = params.get("base") || "";
const CACHE = `dust-extract:${EPOCH}:${BASE}`;

let stored = 0;
let full = false;

function ours(url) {
  return BASE !== "" && url.startsWith(BASE);
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      // Any cache from another epoch or another extract base is dead.
      for (const key of await caches.keys()) {
        if (key.startsWith("dust-extract:") && key !== CACHE) {
          await caches.delete(key);
        }
      }
    })(),
  );
});

async function room() {
  if (full) {
    return false;
  }
  if (stored < BUDGET_BYTES) {
    return true;
  }
  full = true;
  return false;
}

/** Cache a response, and notice when the browser says we are out of room. */
async function keep(request, response) {
  if (!(await room())) {
    return;
  }
  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, response);
    const len = Number(response.headers.get("content-length"));
    stored += Number.isFinite(len) && len > 0 ? len : 24 * 1024;
  } catch {
    // QuotaExceededError and friends: stop trying, keep playing.
    full = true;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !ours(request.url)) {
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) {
        return hit;
      }
      const response = await fetch(request);
      // Only cache a real, readable 200. An opaque response has no body
      // we can measure and would poison the budget.
      if (response.ok && response.status === 200 && response.type !== "opaque") {
        event.waitUntil(keep(request, response.clone()));
      }
      return response;
    })(),
  );
});

/** Fetch anything not already held, slowly, in the background. */
async function warm(urls) {
  const cache = await caches.open(CACHE);
  let at = 0;
  let added = 0;
  const worker = async () => {
    while (at < urls.length && !full) {
      const url = urls[at];
      at += 1;
      try {
        if (await cache.match(url)) {
          continue;
        }
        // `priority: low` keeps warming behind anything the walker wants.
        const response = await fetch(url, { priority: "low" });
        if (response.ok && response.status === 200 && response.type !== "opaque") {
          await keep(new Request(url), response);
          added += 1;
        }
      } catch {
        // A miss during warming is not worth reporting; play continues.
      }
    }
  };
  await Promise.all(Array.from({ length: WARM_CONCURRENCY }, worker));
  return added;
}

let warming = null;

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") {
    return;
  }
  if (data.type === "warm" && Array.isArray(data.urls)) {
    // One warm run at a time; a second request while busy is ignored.
    if (!warming) {
      warming = warm(data.urls.filter(ours)).finally(() => {
        warming = null;
      });
    }
    return;
  }
  if (data.type === "stats" && event.ports[0]) {
    void (async () => {
      const cache = await caches.open(CACHE);
      const keys = await cache.keys();
      const estimate = self.navigator.storage?.estimate
        ? await self.navigator.storage.estimate()
        : {};
      event.ports[0].postMessage({
        base: BASE,
        cache: CACHE,
        entries: keys.length,
        storedBytes: stored,
        full,
        warming: warming !== null,
        quota: estimate.quota ?? null,
        usage: estimate.usage ?? null,
      });
    })();
  }
});
