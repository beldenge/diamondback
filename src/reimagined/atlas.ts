/**
 * Sign atlas.
 *
 * Every painted board, poster and shelf front is one canvas texture on
 * one material on one quad, so the town drew ~230 single-triangle-pair
 * meshes, each forcing three to rebind a material and re-upload its
 * uniforms. That was the largest single cost in the frame.
 *
 * They are otherwise identical materials: opaque `MeshLambertMaterial`,
 * white, front side, no alpha test, no emissive. Pack their canvases
 * into a few pages, rewrite the quads' UVs, and the whole set becomes
 * one draw per page.
 *
 * Deliberately narrow. A material is only atlased when it is used by
 * decal quads alone (UVs in 0..1, so a tile lookup is exact) and it is
 * plain in that sense — cut-out letters (`alphaTest`), lamp glass and
 * anything `registerNight` dims keep their own material and their own
 * draw.
 */
import * as THREE from "three";

/** Atlas page edge. The widest sign (the DIAMONDBACK banner) is 864 px. */
const PAGE = 2048;

/**
 * Edge-replicated margin around each tile, in page pixels. Mip level n
 * mixes texels 2^n apart, so 8 px of the tile's own edge colour keeps
 * minification clean down to level 3 — past that a sign is a few pixels
 * on screen. Tiles start on a 16 px grid for the same reason.
 */
const PAD = 8;
const GRID = 16;

function alignUp(v: number, to: number): number {
  return Math.ceil(v / to) * to;
}

export interface AtlasTile {
  /** Where the source canvas landed, in page pixels from the top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
}

export interface AtlasPage {
  texture: THREE.Texture;
  material: THREE.MeshLambertMaterial;
}

/**
 * True for a texture whose pixels a page can `drawImage`. Separate from
 * the material test so that one stays pure state and testable off-DOM.
 */
export function isAtlasableTexture(tex: THREE.Texture | null): boolean {
  const image = tex?.image as { width?: number; height?: number } | undefined;
  if (!tex || !image?.width || !image.height) {
    return false;
  }
  if (image.width + PAD * 2 > PAGE || image.height + PAD * 2 > PAGE) {
    return false;
  }
  return (
    typeof HTMLCanvasElement !== "undefined" && (tex.image as object) instanceof HTMLCanvasElement
  );
}

/**
 * Materials this pass may fold together: plain lit boards, nothing whose
 * per-material state the shader or `applyNightMats` still needs. The map's
 * own source is `isAtlasableTexture`; callers check both.
 */
export function isAtlasableMaterial(mat: THREE.Material): boolean {
  const lambert = mat as THREE.MeshLambertMaterial;
  const image = lambert.map?.image as { width?: number; height?: number } | undefined;
  return (
    (mat as { isMeshLambertMaterial?: boolean }).isMeshLambertMaterial === true &&
    mat.transparent === false &&
    mat.alphaTest === 0 &&
    mat.opacity === 1 &&
    mat.side === THREE.FrontSide &&
    mat.depthWrite === true &&
    mat.userData?.night !== true &&
    lambert.emissive !== undefined &&
    lambert.emissive.getHex() === 0x000000 &&
    lambert.color.getHex() === 0xffffff &&
    lambert.alphaMap === null &&
    lambert.lightMap === null &&
    lambert.aoMap === null &&
    lambert.specularMap === null &&
    Boolean(image?.width) &&
    Boolean(image?.height)
  );
}

/** Shelf packer: tallest first, left to right, new page when a shelf will not fit. */
export function packTiles(
  sizes: readonly { w: number; h: number }[],
  page = PAGE,
): { tiles: AtlasTile[]; pages: number } {
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b].h - sizes[a].h);
  const tiles: AtlasTile[] = new Array(sizes.length);
  let pages = 1;
  let pageIndex = 0;
  let shelfY = 0;
  let shelfH = 0;
  let cursorX = 0;
  for (const i of order) {
    const w = alignUp(sizes[i].w + PAD * 2, GRID);
    const h = alignUp(sizes[i].h + PAD * 2, GRID);
    if (cursorX + w > page) {
      shelfY += shelfH;
      shelfH = 0;
      cursorX = 0;
    }
    if (shelfY + h > page) {
      pageIndex += 1;
      pages = pageIndex + 1;
      shelfY = 0;
      shelfH = 0;
      cursorX = 0;
    }
    tiles[i] = { x: cursorX + PAD, y: shelfY + PAD, w: sizes[i].w, h: sizes[i].h, page: pageIndex };
    cursorX += w;
    shelfH = Math.max(shelfH, h);
  }
  return { tiles, pages };
}

/** Blit one source canvas plus an edge-replicated margin. */
function blitTile(ctx: CanvasRenderingContext2D, src: CanvasImageSource, tile: AtlasTile): void {
  const { x, y, w, h } = tile;
  ctx.drawImage(src, x, y);
  ctx.drawImage(src, 0, 0, w, 1, x, y - PAD, w, PAD);
  ctx.drawImage(src, 0, h - 1, w, 1, x, y + h, w, PAD);
  ctx.drawImage(src, 0, 0, 1, h, x - PAD, y, PAD, h);
  ctx.drawImage(src, w - 1, 0, 1, h, x + w, y, PAD, h);
  ctx.drawImage(src, 0, 0, 1, 1, x - PAD, y - PAD, PAD, PAD);
  ctx.drawImage(src, w - 1, 0, 1, 1, x + w, y - PAD, PAD, PAD);
  ctx.drawImage(src, 0, h - 1, 1, 1, x - PAD, y + h, PAD, PAD);
  ctx.drawImage(src, w - 1, h - 1, 1, 1, x + w, y + h, PAD, PAD);
}

/**
 * Point a quad's UVs at its tile. `flipY` textures put v = 0 at the
 * bottom of the page, so the tile's v origin counts up from its lower
 * edge.
 */
export function retargetQuadUv(geom: THREE.BufferGeometry, tile: AtlasTile, page = PAGE): void {
  const uv = geom.getAttribute("uv") as THREE.BufferAttribute | undefined;
  if (!uv) {
    return;
  }
  const u0 = tile.x / page;
  const du = tile.w / page;
  const v0 = 1 - (tile.y + tile.h) / page;
  const dv = tile.h / page;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
  }
  uv.needsUpdate = true;
}

/**
 * Copy each material's map into a page and rewrite its quads' UVs.
 * Returns one shared material per page; the callers merge the quads
 * behind it. Source textures are disposed — nothing else refers to them.
 */
export function buildSignAtlas(
  entries: readonly { material: THREE.MeshLambertMaterial; geoms: THREE.BufferGeometry[] }[],
): { pages: AtlasPage[]; byEntry: AtlasTile[] } {
  const sizes = entries.map((e) => {
    const image = e.material.map!.image as HTMLCanvasElement;
    return { w: image.width, h: image.height };
  });
  const { tiles, pages: pageCount } = packTiles(sizes);
  const canvases: CanvasRenderingContext2D[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE;
    canvas.height = PAGE;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      throw new Error("sign atlas canvas");
    }
    canvases.push(ctx);
  }
  for (let i = 0; i < entries.length; i += 1) {
    const tile = tiles[i];
    blitTile(canvases[tile.page], entries[i].material.map!.image as CanvasImageSource, tile);
    for (const geom of entries[i].geoms) {
      retargetQuadUv(geom, tile);
    }
    entries[i].material.map!.dispose();
  }
  const pages: AtlasPage[] = canvases.map((ctx) => {
    const texture = new THREE.CanvasTexture(ctx.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return { texture, material: new THREE.MeshLambertMaterial({ map: texture }) };
  });
  return { pages, byEntry: tiles };
}
