import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { isAtlasableMaterial, packTiles, retargetQuadUv } from "./atlas";

const PAGE = 2048;
const PAD = 8;

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe("packTiles", () => {
  it("keeps every tile inside the page, margin included", () => {
    const sizes = Array.from({ length: 240 }, (_, i) => ({
      w: 40 + ((i * 37) % 800),
      h: 32 + ((i * 53) % 300),
    }));
    const { tiles } = packTiles(sizes);
    for (let i = 0; i < sizes.length; i += 1) {
      const t = tiles[i];
      expect(t.w).toBe(sizes[i].w);
      expect(t.h).toBe(sizes[i].h);
      expect(t.x - PAD).toBeGreaterThanOrEqual(0);
      expect(t.y - PAD).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w + PAD).toBeLessThanOrEqual(PAGE);
      expect(t.y + t.h + PAD).toBeLessThanOrEqual(PAGE);
    }
  });

  it("never lets two tiles' padded boxes touch", () => {
    const sizes = Array.from({ length: 120 }, (_, i) => ({
      w: 60 + ((i * 91) % 500),
      h: 40 + ((i * 71) % 260),
    }));
    const { tiles } = packTiles(sizes);
    const boxes = tiles.map((t) => ({
      page: t.page,
      x: t.x - PAD,
      y: t.y - PAD,
      w: t.w + PAD * 2,
      h: t.h + PAD * 2,
    }));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        if (boxes[i].page !== boxes[j].page) {
          continue;
        }
        expect(overlaps(boxes[i], boxes[j])).toBe(false);
      }
    }
  });

  it("fits the town's ~4.4 megapixels of signs in a couple of pages", () => {
    const sizes = Array.from({ length: 190 }, (_, i) => ({
      w: 96 + ((i * 29) % 420),
      h: 32 + ((i * 17) % 130),
    }));
    expect(packTiles(sizes).pages).toBeLessThanOrEqual(2);
  });
});

describe("retargetQuadUv", () => {
  it("maps a plane's 0..1 UVs onto its tile, flipY included", () => {
    const geom = new THREE.PlaneGeometry(1, 1);
    retargetQuadUv(geom, { x: 512, y: 256, w: 256, h: 128, page: 0 });
    const uv = geom.getAttribute("uv") as THREE.BufferAttribute;
    const us: number[] = [];
    const vs: number[] = [];
    for (let i = 0; i < uv.count; i += 1) {
      us.push(uv.getX(i));
      vs.push(uv.getY(i));
    }
    // u spans the tile's columns …
    expect(Math.min(...us)).toBeCloseTo(512 / PAGE, 6);
    expect(Math.max(...us)).toBeCloseTo(768 / PAGE, 6);
    // … and v counts up from the tile's *lower* edge in the flipped page.
    expect(Math.min(...vs)).toBeCloseTo(1 - 384 / PAGE, 6);
    expect(Math.max(...vs)).toBeCloseTo(1 - 256 / PAGE, 6);
  });

  it("leaves the quad's own corners in the same order", () => {
    const geom = new THREE.PlaneGeometry(2, 3);
    const before = Array.from(
      (geom.getAttribute("uv") as THREE.BufferAttribute).array as Float32Array,
    );
    retargetQuadUv(geom, { x: 0, y: 0, w: PAGE, h: PAGE, page: 0 });
    const after = Array.from(
      (geom.getAttribute("uv") as THREE.BufferAttribute).array as Float32Array,
    );
    // A full-page tile is the identity mapping.
    for (let i = 0; i < before.length; i += 1) {
      expect(after[i]).toBeCloseTo(before[i], 6);
    }
  });
});

describe("isAtlasableMaterial", () => {
  // `isAtlasableMaterial` only reads the map's dimensions; the source
  // type is `isAtlasableTexture`'s job and needs a real DOM canvas.
  const canvasMap = (): THREE.Texture =>
    new THREE.Texture({ width: 64, height: 32 } as unknown as HTMLCanvasElement);

  it("takes a plain lit board", () => {
    expect(isAtlasableMaterial(new THREE.MeshLambertMaterial({ map: canvasMap() }))).toBe(true);
  });

  it("leaves cut-out letters alone (alphaTest is per-material state)", () => {
    const mat = new THREE.MeshLambertMaterial({ map: canvasMap(), alphaTest: 0.2 });
    expect(isAtlasableMaterial(mat)).toBe(false);
  });

  it("leaves anything registerNight dims alone", () => {
    const mat = new THREE.MeshLambertMaterial({ map: canvasMap() });
    mat.userData.night = true;
    expect(isAtlasableMaterial(mat)).toBe(false);
  });

  it("leaves emissive, tinted, transparent and untextured materials alone", () => {
    const emissive = new THREE.MeshLambertMaterial({ map: canvasMap(), emissive: 0x332211 });
    const tinted = new THREE.MeshLambertMaterial({ map: canvasMap(), color: 0x88ff88 });
    const clear = new THREE.MeshLambertMaterial({ map: canvasMap(), transparent: true });
    const bare = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const basic = new THREE.MeshBasicMaterial({ map: canvasMap() });
    expect(isAtlasableMaterial(emissive)).toBe(false);
    expect(isAtlasableMaterial(tinted)).toBe(false);
    expect(isAtlasableMaterial(clear)).toBe(false);
    expect(isAtlasableMaterial(bare)).toBe(false);
    expect(isAtlasableMaterial(basic)).toBe(false);
  });
});
