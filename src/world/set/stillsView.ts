import {
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Texture,
} from "three";
import { pngFetchCache } from "./extract";
import { stillGate, type MediaPriority } from "./media";
import { STILL_HEIGHT, STILL_WIDTH } from "./types";

/** ~256 stills × 512×264 RGBA (~138 MB). Older uploads are disposed. */
const CACHE_MAX = 256;

export class StillsView {
  readonly scene = new Scene();
  readonly camera: OrthographicCamera;
  private readonly mesh: Mesh;
  private readonly material: MeshBasicMaterial;
  private readonly cache = new Map<string, Texture>();
  private readonly loading = new Map<string, Promise<Texture>>();
  private readonly retainSet = new Set<string>();
  private displayed: string | null = null;

  private readonly overlay: Mesh;
  private readonly overlayMaterial: MeshBasicMaterial;
  private overlayGen = 0;

  constructor() {
    this.scene.background = null;
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.camera.position.z = 1;
    this.material = new MeshBasicMaterial({ depthTest: false });
    this.mesh = new Mesh(new PlaneGeometry(STILL_WIDTH, STILL_HEIGHT), this.material);
    this.mesh.position.z = 0;
    this.mesh.visible = false;
    this.scene.add(this.mesh);
    this.overlayMaterial = new MeshBasicMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.overlay = new Mesh(new PlaneGeometry(1, 1), this.overlayMaterial);
    this.overlay.position.z = 0.1;
    this.overlay.visible = false;
    this.overlay.renderOrder = 1;
    this.scene.add(this.overlay);
  }

  layout(width: number, height: number): void {
    const fit = Math.min(width / STILL_WIDTH, height / STILL_HEIGHT);
    const scale = fit >= 1 ? Math.floor(fit) : fit;
    const worldW = width / scale;
    const worldH = height / scale;
    this.camera.left = -worldW / 2;
    this.camera.right = worldW / 2;
    this.camera.top = worldH / 2;
    this.camera.bottom = -worldH / 2;
    this.camera.updateProjectionMatrix();
  }

  /** Letterboxed still rectangle in canvas pixels, for click mapping. */
  stillRect(width: number, height: number): { x: number; y: number; w: number; h: number } {
    const fit = Math.min(width / STILL_WIDTH, height / STILL_HEIGHT);
    const scale = fit >= 1 ? Math.floor(fit) : fit;
    const w = STILL_WIDTH * scale;
    const h = STILL_HEIGHT * scale;
    return { x: (width - w) / 2, y: (height - h) / 2, w, h };
  }

  cached(url: string): boolean {
    return this.cache.has(url);
  }

  hasStill(): boolean {
    return this.displayed !== null;
  }

  /** Paint if the PNG is already decoded. */
  showCached(url: string): boolean {
    const texture = this.cache.get(url);
    if (!texture) {
      return false;
    }
    this.apply(url, texture);
    return true;
  }

  /**
   * Decode without painting. Color stills must sit in cache until the
   * matching `FRAMES/z` is known, then `showCached`.
   */
  async ensure(url: string, priority: MediaPriority = "high"): Promise<void> {
    await this.load(url, priority);
  }

  async show(url: string): Promise<void> {
    this.apply(url, await this.load(url, "high"));
  }

  /**
   * Decode in the background. High = current strip, then dest
   * neighborhood. Low = idle prefetch. Color stills are `stillGate`.
   */
  preload(urls: string[], priority: MediaPriority = "low"): void {
    for (const url of urls) {
      void this.load(url, priority);
    }
  }

  /** Current-strip URLs jump the high queue (first plate first). */
  prefer(urls: readonly string[]): void {
    stillGate.preferMany(urls.map((url) => `tex:${url}`));
  }

  /** Do not GPU-evict these (current strip + next-move neighborhood). */
  retain(urls: string[]): void {
    this.retainSet.clear();
    for (const url of urls) {
      this.retainSet.add(url);
    }
  }

  hideOverlay(): void {
    this.overlayGen += 1;
    this.overlay.visible = false;
  }

  /**
   * Blit a transparent door sprite. `cx`/`cy` are the still-pixel center
   * (512×264, origin top-left), matching Dust `pointx`/`pointy`.
   */
  async showOverlay(url: string, cx: number, cy: number): Promise<void> {
    const gen = this.overlayGen + 1;
    this.overlayGen = gen;
    const texture = await this.load(url, "high");
    if (this.overlayGen !== gen) {
      return;
    }
    const image = texture.image as { width?: number; height?: number } | undefined;
    const width = image?.width ?? 64;
    const height = image?.height ?? 128;
    this.overlayMaterial.map = texture;
    this.overlayMaterial.needsUpdate = true;
    this.overlay.scale.set(width, height, 1);
    this.overlay.position.x = cx - STILL_WIDTH / 2;
    this.overlay.position.y = STILL_HEIGHT / 2 - cy;
    this.overlay.visible = true;
  }

  private apply(url: string, texture: Texture): void {
    this.displayed = url;
    this.touch(url);
    // Only the null -> texture swap changes the shader defines. Setting
    // `needsUpdate` on every plate re-ran three's program cache key (a
    // ~40-field string) 20 times a second for the same program.
    const first = this.material.map === null;
    this.material.map = texture;
    if (first) {
      this.material.needsUpdate = true;
    }
    this.mesh.visible = true;
  }

  private load(url: string, priority: MediaPriority): Promise<Texture> {
    const hit = this.cache.get(url);
    if (hit) {
      this.touch(url);
      return Promise.resolve(hit);
    }
    const pending = this.loading.get(url);
    if (pending) {
      if (priority === "high") {
        stillGate.prefer(`tex:${url}`);
      }
      return pending;
    }
    const promise = new Promise<Texture>((resolve, reject) => {
      stillGate.enqueue(`tex:${url}`, priority, async () => {
        try {
          const texture = await decodeStillTexture(url, priority);
          this.cache.set(url, texture);
          this.loading.delete(url);
          this.evict();
          resolve(texture);
        } catch (err) {
          this.loading.delete(url);
          reject(err);
        }
      });
    });
    this.loading.set(url, promise);
    return promise;
  }

  private touch(url: string): void {
    const texture = this.cache.get(url);
    if (!texture) {
      return;
    }
    this.cache.delete(url);
    this.cache.set(url, texture);
  }

  private evict(): void {
    while (this.cache.size > CACHE_MAX) {
      let victim: string | undefined;
      for (const key of this.cache.keys()) {
        if (key === this.displayed || this.retainSet.has(key) || this.loading.has(key)) {
          continue;
        }
        victim = key;
        break;
      }
      if (victim === undefined) {
        return;
      }
      const texture = this.cache.get(victim);
      this.cache.delete(victim);
      if (!texture) {
        continue;
      }
      const image = texture.image as { close?: () => void } | undefined;
      texture.dispose();
      image?.close?.();
    }
  }
}

function stillTexture(image: TexImageSource, flipY: boolean): Texture {
  const texture = new Texture(image);
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = flipY;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * One software 2D canvas for every PNG decode. Each still used to keep
 * its own `HTMLCanvasElement` alive as the texture source: 256 cached
 * stills meant 256 GPU-backed canvas surfaces (~110 MB) fighting
 * Chrome's canvas budget. Decoded pixels are plain `ImageData` now, so
 * the scratch is the only canvas in the pipeline. It only grows.
 */
let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

function scratchFor(width: number, height: number): CanvasRenderingContext2D {
  if (!scratchCanvas || !scratchCtx) {
    scratchCanvas = document.createElement("canvas");
    scratchCanvas.width = Math.max(1, width);
    scratchCanvas.height = Math.max(1, height);
    const ctx = scratchCanvas.getContext("2d", { alpha: true, willReadFrequently: true });
    if (!ctx) {
      throw new Error("still canvas");
    }
    scratchCtx = ctx;
    return ctx;
  }
  if (scratchCanvas.width < width || scratchCanvas.height < height) {
    // Growing resets the backing store; every caller clears its own rect.
    scratchCanvas.width = Math.max(scratchCanvas.width, width);
    scratchCanvas.height = Math.max(scratchCanvas.height, height);
  }
  return scratchCtx;
}

/**
 * Decode an extract PNG to `ImageData`. Indexed SET stills go black in
 * Firefox if we use createImageBitmap({ colorSpaceConversion: "none" })
 * or revoke the blob URL before the pixels are copied, so the decode
 * still goes through an `Image` and a 2D canvas.
 *
 * The pixels come back as `ImageData`, not a canvas: three uploads that
 * directly (it is a `TexImageSource` and honours `flipY`), and a still
 * kept in the texture cache then costs one typed array instead of a
 * live GPU-backed canvas surface.
 */
export async function pngImageData(url: string): Promise<ImageData> {
  const res = await fetch(url, { cache: pngFetchCache(import.meta.env.PROD) });
  if (!res.ok) {
    throw new Error(`${url} ${res.status}`);
  }
  const blob = await res.blob();
  const typed = blob.type.startsWith("image/") ? blob : new Blob([blob], { type: "image/png" });
  const objectUrl = URL.createObjectURL(typed);
  try {
    const img = new Image();
    img.src = objectUrl;
    if (typeof img.decode === "function") {
      await img.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(url));
      });
    }
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w <= 0 || h <= 0) {
      throw new Error(`${url} empty still`);
    }
    // Borrow, draw, read: no await in between, so the scratch is never
    // shared across two decodes even with eight of them in flight.
    const ctx = scratchFor(w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, w, h);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * A standalone canvas of the PNG, for callers that blit it with
 * `drawImage` (PUP talking-head plates). Stills do not use this — they
 * keep `ImageData` so the cache is not 256 live canvas surfaces.
 */
export async function pngCanvas(url: string): Promise<HTMLCanvasElement> {
  const image = await pngImageData(url);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    throw new Error("still canvas");
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * `ImageBitmap` support, probed once.
 *
 * A film still is only ever a texture: nothing reads its pixels back in
 * JS. Decoding it to `ImageData` put 512×264×4 bytes on the JS heap per
 * still — 132 MB held by a full cache, and ~6 MB of fresh garbage every
 * step once the cache starts evicting, which is what turned into GC
 * pauses after a few dozen moves. An `ImageBitmap` decodes off the main
 * thread, keeps its pixels outside the JS heap, and `close()` frees it
 * the moment the cache evicts it.
 *
 * WebGL's `UNPACK_FLIP_Y_WEBGL` does not apply to an `ImageBitmap`, so
 * the flip has to happen at creation. Verified byte-identical against
 * the `ImageData` path for a SET still and a CST sprite. Do **not** pass
 * `colorSpaceConversion: "none"` — that is the option that turns
 * indexed SET PNGs black in Firefox.
 */
let bitmapSupport: Promise<boolean> | null = null;

function probeImageBitmap(): Promise<boolean> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return Promise.resolve(false);
  }
  // One pixel red over one pixel blue: after a flipY decode the top row
  // must come back blue. A browser that ignores the option fails here
  // and keeps the ImageData path rather than rendering upside down.
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 2;
  const ctx = probe.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) {
    return Promise.resolve(false);
  }
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = "#0000ff";
  ctx.fillRect(0, 1, 1, 1);
  return createImageBitmap(probe, { imageOrientation: "flipY" })
    .then((bitmap) => {
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const top = ctx.getImageData(0, 0, 1, 1).data;
      return top[2] > 200 && top[0] < 60;
    })
    .catch(() => false);
}

function imageBitmapReady(): Promise<boolean> {
  bitmapSupport ??= probeImageBitmap();
  return bitmapSupport;
}

/** A missing / broken URL. Retrying it through the other decoder is pointless. */
class FetchFailed extends Error {}

async function bitmapStill(url: string): Promise<Texture> {
  const res = await fetch(url, { cache: pngFetchCache(import.meta.env.PROD) });
  if (!res.ok) {
    throw new FetchFailed(`${url} ${res.status}`);
  }
  const blob = await res.blob();
  const typed = blob.type.startsWith("image/") ? blob : new Blob([blob], { type: "image/png" });
  // Flipped at decode, so the texture must not flip again.
  return stillTexture(await createImageBitmap(typed, { imageOrientation: "flipY" }), false);
}

async function decodeStillTexture(url: string, _priority: MediaPriority): Promise<Texture> {
  if (await imageBitmapReady()) {
    try {
      return await bitmapStill(url);
    } catch (err) {
      if (err instanceof FetchFailed) {
        throw err;
      }
      // A decode failure the probe did not predict: fall back for good.
      bitmapSupport = Promise.resolve(false);
    }
  }
  return stillTexture(await pngImageData(url), true);
}
