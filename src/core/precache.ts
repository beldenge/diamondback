/**
 * Registers `public/sw.js` and feeds it the extract to warm.
 *
 * Hosted only. Locally, Vite serves `/extract` with `no-cache` + ETag so
 * a re-dump shows up on reload — caching that on disk would silently
 * serve yesterday's extraction, which is exactly the trap the extractor
 * docs warn about. `import.meta.env.PROD` is the whole guard.
 */
import { extractBase } from "../world/set/extract";

/** `?nosw=1` unregisters and wipes, for when a cache needs to go away. */
const KILL = "nosw";

export interface PrecacheStats {
  base: string;
  cache: string;
  entries: number;
  storedBytes: number;
  full: boolean;
  warming: boolean;
  quota: number | null;
  usage: number | null;
}

function supported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

async function unregisterAll(): Promise<void> {
  if (!supported()) {
    return;
  }
  for (const reg of await navigator.serviceWorker.getRegistrations()) {
    await reg.unregister();
  }
  if (typeof caches !== "undefined") {
    for (const key of await caches.keys()) {
      if (key.startsWith("dust-extract:")) {
        await caches.delete(key);
      }
    }
  }
}

let ready: Promise<ServiceWorker | null> | null = null;

/**
 * Install the extract cache. Safe to call more than once; the second
 * call returns the same promise.
 */
export function startPrecache(search = window.location.search): Promise<ServiceWorker | null> {
  if (new URLSearchParams(search).has(KILL)) {
    ready = unregisterAll().then(() => null);
    return ready;
  }
  if (!import.meta.env.PROD || !supported()) {
    return Promise.resolve(null);
  }
  ready ??= register();
  return ready;
}

async function register(): Promise<ServiceWorker | null> {
  const base = extractBase();
  // A relative base means same-origin dev serving; nothing to cache.
  if (!/^https?:\/\//i.test(base)) {
    return null;
  }
  try {
    // Ask to be exempt from best-effort eviction. Chrome grants this
    // silently to engaged origins and refuses otherwise; either way the
    // cache still works, it is just more likely to survive a squeeze.
    await navigator.storage?.persist?.().catch(() => false);
    // The base rides in the URL so the worker knows it on its first
    // fetch, and so a new base installs a new worker (which then drops
    // the previous base's cache in `activate`).
    const reg = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js?base=${encodeURIComponent(base)}`,
      { scope: import.meta.env.BASE_URL },
    );
    await navigator.serviceWorker.ready;
    return reg.active ?? navigator.serviceWorker.controller;
  } catch {
    // No cache is a slower game, not a broken one.
    return null;
  }
}

/** Hand the worker a list of extract URLs to pull down in the background. */
export async function warmExtract(urls: readonly string[]): Promise<void> {
  const worker = await startPrecache();
  const target = worker ?? navigator.serviceWorker?.controller ?? null;
  if (!target || urls.length === 0) {
    return;
  }
  target.postMessage({ type: "warm", urls: [...urls] });
}

/** What the worker is holding. Used by the dev handle and for verification. */
export async function precacheStats(): Promise<PrecacheStats | null> {
  const worker = (await startPrecache()) ?? navigator.serviceWorker?.controller ?? null;
  if (!worker) {
    return null;
  }
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 2000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data as PrecacheStats);
    };
    worker.postMessage({ type: "stats" }, [channel.port2]);
  });
}
