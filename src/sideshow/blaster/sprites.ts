/**
 * Asset loading for the Sideshow.
 *
 * Everything decodes to pixels rather than to `HTMLImageElement`, because
 * the renderer composites by hand: sprites are blitted into a 512x264
 * buffer against the SET Z plane so chickens go behind buildings instead
 * of floating over them. `drawImage` cannot do a per-pixel depth test.
 *
 * Two sheet formats, both already written by the extract:
 *   CST `sprites.json` — `{ actors: { name: { pose: [frame…] } } }`
 *   PRP `props.json`   — a flat list of `{ group, state, path, x,y,w,h }`
 */

import { spriteBitsFromImageData, type SpriteBits } from "../../play/occlude";
import { extractUrl } from "../../world/set/extract";

/** One frame's placement in the 512x384 sheet, hotspot (256, 192). */
export interface SheetFrame {
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
  id?: number;
  index?: number;
  pose?: number;
  deg?: number;
}

export type PoseTable = Record<string, SheetFrame[]>;

interface CstSheet {
  actors?: Record<string, PoseTable>;
}

interface PropRecord {
  group?: string;
  state?: string;
  path?: string;
  index?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

/**
 * One scratch canvas for every decode. A live canvas per cached frame is
 * how the play modes once ate ~110 MB of GPU-backed surfaces.
 */
let scratch: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

function scratchFor(w: number, h: number): CanvasRenderingContext2D {
  if (!scratch || !scratchCtx) {
    scratch = document.createElement("canvas");
    scratch.width = Math.max(1, w);
    scratch.height = Math.max(1, h);
    const ctx = scratch.getContext("2d", { alpha: true, willReadFrequently: true });
    if (!ctx) {
      throw new Error("blaster: no scratch context");
    }
    scratchCtx = ctx;
    return ctx;
  }
  if (scratch.width < w || scratch.height < h) {
    scratch.width = Math.max(scratch.width, w);
    scratch.height = Math.max(scratch.height, h);
  }
  return scratchCtx;
}

/**
 * Decode a PNG to `ImageData`.
 *
 * Via `fetch` + `createImageBitmap`, **not** an `Image` element. Measured
 * on a town plate: fetch 1–2 ms, bitmap decode 0.4 ms, readback 0.2 ms —
 * about 3 ms all in. The `img.src = url` / `onload` / `drawImage` path this
 * replaced measured **19–142 ms for the same plate**, because `onload`
 * fires on load rather than decode and the decode then lands synchronously
 * on the main thread when you draw it.
 *
 * That difference is the whole game: a move needs six plates and their six
 * Z planes inside a 250 ms strip. At 80 ms each that is nearly a second of
 * decoding and the film simply cannot keep up with the camera — sprites
 * reproject every frame while the background sits still.
 *
 * Two details carried over from the play modes' own decoder: re-wrap a
 * blob whose type is not `image/*` (the dev server does not always set
 * one), and never pass `colorSpaceConversion: "none"` — that is what turns
 * indexed SET PNGs black in Firefox.
 */
export async function decodeImageData(url: string): Promise<ImageData> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} ${res.status}`);
  }
  const raw = await res.blob();
  const blob = raw.type.startsWith("image/") ? raw : new Blob([raw], { type: "image/png" });

  let bitmap: ImageBitmap | null = null;
  let source: CanvasImageSource;
  if (typeof createImageBitmap === "function") {
    try {
      bitmap = await createImageBitmap(blob);
      source = bitmap;
    } catch {
      source = await imageFromBlob(blob);
    }
  } else {
    source = await imageFromBlob(blob);
  }

  const w = (source as { width: number }).width;
  const h = (source as { height: number }).height;
  if (!w || !h) {
    bitmap?.close();
    throw new Error(`${url} empty`);
  }
  // Borrow, draw, read: no await in between, so the scratch is never
  // shared across two decodes even with several in flight.
  const ctx = scratchFor(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  bitmap?.close();
  return data;
}

/** Fallback for a browser without `createImageBitmap`, or a blob it refused. */
function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("decode"));
    };
    img.src = objectUrl;
  });
}

/** A cache that never retries a URL that already failed. */
class UrlCache<T> {
  private readonly hits = new Map<string, T>();

  private readonly pending = new Map<string, Promise<T | null>>();

  private readonly missing = new Set<string>();

  constructor(private readonly decode: (url: string) => Promise<T>) {}

  get(url: string): T | undefined {
    return this.hits.get(url);
  }

  /** True once this URL is settled either way — decoded, or known missing. */
  settled(url: string): boolean {
    return this.hits.has(url) || this.missing.has(url);
  }

  load(url: string): Promise<T | null> {
    const hit = this.hits.get(url);
    if (hit !== undefined) {
      return Promise.resolve(hit);
    }
    if (this.missing.has(url)) {
      return Promise.resolve(null);
    }
    const inflight = this.pending.get(url);
    if (inflight) {
      return inflight;
    }
    const job = this.decode(url)
      .then((value) => {
        this.hits.set(url, value);
        this.pending.delete(url);
        return value;
      })
      .catch(() => {
        this.missing.add(url);
        this.pending.delete(url);
        return null;
      });
    this.pending.set(url, job);
    return job;
  }
}

export class SpriteBank {
  private readonly cstSheets = new Map<string, Promise<CstSheet>>();

  private readonly propSheets = new Map<string, Promise<PoseTable>>();

  /**
   * `restoreShadow: false` on purpose.
   *
   * A CST sprite carries its contact shadow as `(0, 0, 0, ~120)` — the
   * chicken has 185 such pixels. `restoreSpriteAlpha` exists to undo canvas
   * premultiplication punching *opaque* black down (Help's robe), and it
   * decides what is shadow by flood-filling from the bottom edge; when that
   * misses, the shadow is forced to 255 and blits as a **solid black slab**
   * under the sprite. Unnoticeable on a chicken, a hole in the street under
   * a boss thirty times the size.
   *
   * Keeping the decoded alpha means `blitSpriteZ` preserves the 120, and
   * `blendContactShadows` composites it over the film plate afterwards.
   */
  private readonly bits = new UrlCache<SpriteBits>(async (url) =>
    spriteBitsFromImageData(await decodeImageData(url), { restoreShadow: false }),
  );

  /** SET stills, kept as raw pixels so a frame is one typed-array copy. */
  private readonly stills = new UrlCache<ImageData>(decodeImageData);

  /**
   * SET Z planes, 8 bits per pixel, 1–24 (smaller is nearer). `null` for
   * a still with no plane — never hold a stale one, that draws through walls.
   */
  private readonly zPlanes = new UrlCache<Uint8Array>(async (url) => {
    const { zPlaneFromImageData } = await import("../../play/occlude");
    return zPlaneFromImageData(await decodeImageData(url));
  });

  // ── CST casts ───────────────────────────────────────────────────────

  private cstSheet(cast: string): Promise<CstSheet> {
    const hit = this.cstSheets.get(cast);
    if (hit) {
      return hit;
    }
    const job = fetch(extractUrl(`CST/${cast}/sprites.json`))
      .then((res) => (res.ok ? (res.json() as Promise<CstSheet>) : { actors: {} }))
      .catch(() => ({ actors: {} }) as CstSheet);
    this.cstSheets.set(cast, job);
    return job;
  }

  /** Pose table for one actor, matched case-insensitively (`Leroy`/`leroy`). */
  async poses(cast: string, actor: string): Promise<PoseTable | null> {
    const actors = (await this.cstSheet(cast)).actors ?? {};
    const direct = actors[actor];
    if (direct) {
      return direct;
    }
    const want = actor.toLowerCase();
    for (const [name, table] of Object.entries(actors)) {
      if (name.toLowerCase() === want) {
        return table;
      }
    }
    return null;
  }

  // ── PRP props ───────────────────────────────────────────────────────

  /**
   * One PRP group's states, e.g. `gunhand` → `{ mid: [13 frames], … }`.
   * Frames come back sorted by their sheet index so an aim sweep or an
   * explosion plays in the order it was authored.
   */
  propGroup(folder: string, group: string): Promise<PoseTable> {
    const key = `${folder}#${group.toLowerCase()}`;
    const hit = this.propSheets.get(key);
    if (hit) {
      return hit;
    }
    const job = fetch(extractUrl(`${folder}/props.json`))
      .then((res) => (res.ok ? (res.json() as Promise<PropRecord[]>) : []))
      .catch(() => [] as PropRecord[])
      .then((records) => {
        const want = group.toLowerCase();
        const table: PoseTable = {};
        for (const rec of records) {
          if ((rec.group ?? "").toLowerCase() !== want || !rec.path) {
            continue;
          }
          const state = (rec.state ?? "base").toLowerCase();
          (table[state] ??= []).push({
            path: rec.path,
            x: rec.x ?? 0,
            y: rec.y ?? 0,
            w: rec.w ?? 0,
            h: rec.h ?? 0,
            index: rec.index ?? 0,
          });
        }
        for (const frames of Object.values(table)) {
          frames.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        }
        return table;
      });
    this.propSheets.set(key, job);
    return job;
  }

  // ── pixels ──────────────────────────────────────────────────────────

  private frameUrlFor(root: string, frame: SheetFrame): string {
    return extractUrl(`${root}/${frame.path}`);
  }

  /** Decoded pixels, or undefined while the PNG is still in flight. */
  frameBits(root: string, frame: SheetFrame): SpriteBits | undefined {
    return this.bits.get(this.frameUrlFor(root, frame));
  }

  loadFrame(root: string, frame: SheetFrame): Promise<SpriteBits | null> {
    return this.bits.load(this.frameUrlFor(root, frame));
  }

  /** Warm every frame of the listed states before they are needed. */
  async preload(root: string, table: PoseTable, states: readonly string[]): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    for (const state of states) {
      for (const frame of table[state] ?? []) {
        jobs.push(this.loadFrame(root, frame));
      }
    }
    await Promise.all(jobs);
  }

  still(url: string): ImageData | undefined {
    return this.stills.get(url);
  }

  loadStill(url: string): Promise<ImageData | null> {
    return this.stills.load(url);
  }

  zPlane(url: string): Uint8Array | undefined {
    return this.zPlanes.get(url);
  }

  /** True once the plane is decoded *or* known absent. */
  zSettled(url: string): boolean {
    return this.zPlanes.settled(url);
  }

  loadZPlane(url: string): Promise<Uint8Array | null> {
    return this.zPlanes.load(url);
  }
}

export type { SpriteBits };
