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
import { mediaGate, type MediaPriority } from "./media";
import { STILL_HEIGHT, STILL_WIDTH } from "./types";

/** ~256 stills × 512×264 RGBA. Older GPU uploads are disposed. */
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

  async show(url: string): Promise<void> {
    this.apply(url, await this.load(url, "high"));
  }

  /**
   * Decode in the background. High = current strip / dest HQ (jumps the
   * queue). Low = neighbor prefetch. Shared inflight cap with sprites.
   */
  preload(urls: string[], priority: MediaPriority = "low"): void {
    for (const url of urls) {
      void this.load(url, priority);
    }
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
    this.material.map = texture;
    this.material.needsUpdate = true;
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
        mediaGate.prefer(`tex:${url}`);
      }
      return pending;
    }
    const promise = new Promise<Texture>((resolve, reject) => {
      mediaGate.enqueue(`tex:${url}`, priority, async () => {
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
 * Decode an extract PNG onto a 2D canvas. Indexed SET stills go black in
 * Firefox if we use createImageBitmap({ colorSpaceConversion: "none" })
 * or revoke the blob URL before the pixels are copied.
 */
export async function rasterizePng(
  url: string,
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> {
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
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
    if (!ctx) {
      throw new Error("still canvas");
    }
    ctx.drawImage(img, 0, 0);
    return { canvas, ctx };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function decodeStillTexture(url: string, _priority: MediaPriority): Promise<Texture> {
  const { canvas } = await rasterizePng(url);
  return stillTexture(canvas, true);
}
