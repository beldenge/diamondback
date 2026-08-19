import {
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";
import { STILL_HEIGHT, STILL_WIDTH } from "./types";

const loader = new TextureLoader();
/** Keep a couple of slots free so a new step is not stuck behind prefetch. */
const MAX_INFLIGHT = 3;

type Priority = "high" | "low";

interface Waiter {
  promise: Promise<Texture>;
  resolve: (texture: Texture) => void;
  reject: (err: unknown) => void;
}

export class StillsView {
  readonly scene = new Scene();
  readonly camera: OrthographicCamera;
  private readonly mesh: Mesh;
  private readonly material: MeshBasicMaterial;
  private readonly cache = new Map<string, Texture>();
  private readonly waiters = new Map<string, Waiter>();
  private readonly high: string[] = [];
  private readonly low: string[] = [];
  private inflight = 0;

  constructor() {
    this.scene.background = null;
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.camera.position.z = 1;
    this.material = new MeshBasicMaterial({ depthTest: false });
    this.mesh = new Mesh(new PlaneGeometry(STILL_WIDTH, STILL_HEIGHT), this.material);
    this.scene.add(this.mesh);
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

  async show(url: string): Promise<void> {
    const texture = await this.load(url, "high");
    this.apply(texture);
  }

  has(url: string): boolean {
    return this.cache.has(url);
  }

  /** Apply a cached frame. Returns false if it is not loaded yet. */
  showCached(url: string): boolean {
    const texture = this.cache.get(url);
    if (!texture) {
      return false;
    }
    this.apply(texture);
    return true;
  }

  preload(urls: string[]): void {
    for (const url of urls) {
      void this.load(url, "low");
    }
  }

  async ensure(urls: string[]): Promise<void> {
    await Promise.all(urls.map((url) => this.load(url, "high")));
  }

  private apply(texture: Texture): void {
    this.material.map = texture;
    this.material.needsUpdate = true;
  }

  private load(url: string, priority: Priority): Promise<Texture> {
    const hit = this.cache.get(url);
    if (hit) {
      return Promise.resolve(hit);
    }
    const existing = this.waiters.get(url);
    if (existing) {
      if (priority === "high") {
        this.promote(url);
      }
      return existing.promise;
    }
    let resolve!: (texture: Texture) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<Texture>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.waiters.set(url, { promise, resolve, reject });
    if (priority === "high") {
      this.high.push(url);
    } else {
      this.low.push(url);
    }
    this.pump();
    return promise;
  }

  private promote(url: string): void {
    const index = this.low.indexOf(url);
    if (index < 0) {
      return;
    }
    this.low.splice(index, 1);
    this.high.unshift(url);
  }

  private pump(): void {
    while (this.inflight < MAX_INFLIGHT) {
      const url = this.high.shift() ?? this.low.shift();
      if (!url) {
        return;
      }
      const cached = this.cache.get(url);
      const waiter = this.waiters.get(url);
      if (cached) {
        this.waiters.delete(url);
        waiter?.resolve(cached);
        continue;
      }
      this.inflight += 1;
      loader
        .loadAsync(url)
        .then((texture) => {
          texture.colorSpace = SRGBColorSpace;
          texture.magFilter = NearestFilter;
          texture.minFilter = NearestFilter;
          texture.generateMipmaps = false;
          texture.needsUpdate = true;
          this.cache.set(url, texture);
          this.waiters.delete(url);
          waiter?.resolve(texture);
        })
        .catch((err: unknown) => {
          this.waiters.delete(url);
          waiter?.reject(err);
        })
        .finally(() => {
          this.inflight -= 1;
          this.pump();
        });
    }
  }
}
