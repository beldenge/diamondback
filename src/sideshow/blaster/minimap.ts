/**
 * The minimap.
 *
 * This is **the game's own town map** — `FLT/_NEW/frame_6.png`, the plan
 * that pops up when you click MAP on the dashboard. DIAMONDBACK,
 * POPULATION: 248, compass rose, every building labelled: Santa Marta
 * Mission, Shady Acres Cemetery, the saloon, the jail, Leroy's house,
 * Quist's farm, the target range.
 *
 * It is a literal town plan on the same 15x15 grid the SET table uses, and
 * the engine already knows where each tile lands on it: NEW.FLT `openflat`
 * puts its flashing cross at `scenecol * 20 + 222`, `scenerow * 20 + 93`
 * (0-based tiles, so `scene a1` is 0,0). Those three numbers are copied
 * here rather than imported, because `src/play/hud.ts` is engine state and
 * stays on the far side of the wall — see `SIDESHOW.md`.
 *
 * Everything here is pure geometry plus one draw call that takes a context.
 */

import { TILE_SPAN } from "../../world/set/path";
import type { Dir } from "../../world/set/types";

/** The SET table is 15x15, the same span the town walker uses. */
export const TOWN_SPAN = 15;

/** NEW.FLT `openflat`, mirrored from `play/hud.ts` `MAP_CROSS_*`. */
export const MAP_ORIGIN = { x: 222, y: 93 };
export const MAP_CELL = 20;

/**
 * The square of the plan worth showing at minimap size. The grid itself
 * runs x 222..522 and y 93..393; this pulls back a little to keep the
 * street names and the building labels in frame, and stays inside the
 * 512x384 plate.
 */
export const MAP_VIEW = { sx: 196, sy: 74, size: 310 };

export interface MapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Panel size and inset, in 512x264 still pixels. */
export const MAP_SIZE = 104;
export const MAP_INSET = 7;

/**
 * Bottom-left. The gun hand rises through the bottom centre and right of
 * the frame, so the left corner is the only one it never covers.
 */
export function minimapRect(stillHeight: number, size = MAP_SIZE, inset = MAP_INSET): MapRect {
  return { x: inset, y: stillHeight - size - inset, w: size, h: size };
}

/** Where a tile's cross sits on the full 512x384 plan. */
export function tileToMap(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * MAP_CELL + MAP_ORIGIN.x, y: ty * MAP_CELL + MAP_ORIGIN.y };
}

/** Tile to a point inside the panel, through the cropped view. */
export function tileToPanel(tx: number, ty: number, rect: MapRect): { x: number; y: number } {
  const onMap = tileToMap(tx, ty);
  return {
    x: rect.x + ((onMap.x - MAP_VIEW.sx) / MAP_VIEW.size) * rect.w,
    y: rect.y + ((onMap.y - MAP_VIEW.sy) / MAP_VIEW.size) * rect.h,
  };
}

/** World units (`tile * 256 + 128`) to a point inside the panel. */
export function worldToPanel(wx: number, wy: number, rect: MapRect): { x: number; y: number } {
  return tileToPanel(wx / TILE_SPAN - 0.5, wy / TILE_SPAN - 0.5, rect);
}

/** Unit vector for a facing, in panel space (+x east, +y south). */
export function facingVector(facing: Dir): { x: number; y: number } {
  switch (facing) {
    case "N":
      return { x: 0, y: -1 };
    case "S":
      return { x: 0, y: 1 };
    case "E":
      return { x: 1, y: 0 };
    default:
      return { x: -1, y: 0 };
  }
}

/** Size of the collapsed "MAP" chip that replaces the panel when hidden. */
export const MAP_CHIP_W = 34;
export const MAP_CHIP_H = 14;

/** Corner box that toggles the panel. Also the touch target. */
export const MAP_CLOSE = 13;

/**
 * Where to click to open or close the map.
 *
 * Open, it is a small box in the panel's top-right corner. Closed, the
 * panel is gone entirely and only a chip remains in the same corner of the
 * screen, so the control never moves far from where it was.
 */
export function mapToggleRect(rect: MapRect, open: boolean): MapRect {
  if (open) {
    return { x: rect.x + rect.w - MAP_CLOSE, y: rect.y, w: MAP_CLOSE, h: MAP_CLOSE };
  }
  return { x: rect.x, y: rect.y + rect.h - MAP_CHIP_H, w: MAP_CHIP_W, h: MAP_CHIP_H };
}

export function hitsRect(point: { x: number; y: number }, rect: MapRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

export interface MinimapView {
  rect: MapRect;
  /** Hidden shows only the chip that brings it back. */
  open: boolean;
  /** The town plan, `FLT/_NEW/frame_6.png`. */
  paper?: CanvasImageSource | null;
  birds: readonly { x: number; y: number }[];
  bosses?: readonly { x: number; y: number }[];
  player: { x: number; y: number; facing: Dir };
}

const INK = "#2b1d0e";
const PAPER_FALLBACK = "#b07a4a";
const BIRD = "#e8402a";
const BOSS = "#ffd23a";
const PLAYER = "#f3f0e6";

/**
 * Draw the panel. Blips are squares rather than circles: at two pixels a
 * circle is a smudge, and the whole frame is nearest-neighbour anyway.
 */
export function drawMinimap(ctx: CanvasRenderingContext2D, view: MinimapView): void {
  const { rect } = view;
  ctx.save();

  if (!view.open) {
    drawToggle(ctx, mapToggleRect(rect, false), "MAP");
    ctx.restore();
    return;
  }

  ctx.fillStyle = PAPER_FALLBACK;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (view.paper) {
    ctx.drawImage(
      view.paper,
      MAP_VIEW.sx,
      MAP_VIEW.sy,
      MAP_VIEW.size,
      MAP_VIEW.size,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
    );
  }

  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

  // Blips get a dark outline so they read against the map's own browns.
  ctx.fillStyle = BIRD;
  for (const bird of view.birds) {
    const p = worldToPanel(bird.x, bird.y, rect);
    ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
  }

  for (const boss of view.bosses ?? []) {
    const p = worldToPanel(boss.x, boss.y, rect);
    ctx.fillStyle = BOSS;
    ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 3, 7, 7);
    ctx.strokeStyle = INK;
    ctx.strokeRect(Math.round(p.x) - 3.5, Math.round(p.y) - 3.5, 8, 8);
  }

  // You: a wedge pointing the way you are looking, where the game's own
  // flashing cross would be.
  const me = tileToPanel(view.player.x, view.player.y, rect);
  const dir = facingVector(view.player.facing);
  const side = { x: -dir.y, y: dir.x };
  const nose = 5;
  const wing = 3.5;
  ctx.beginPath();
  ctx.moveTo(me.x + dir.x * nose, me.y + dir.y * nose);
  ctx.lineTo(me.x - dir.x * 2 + side.x * wing, me.y - dir.y * 2 + side.y * wing);
  ctx.lineTo(me.x - dir.x * 2 - side.x * wing, me.y - dir.y * 2 - side.y * wing);
  ctx.closePath();
  ctx.fillStyle = PLAYER;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();

  drawToggle(ctx, mapToggleRect(rect, true), "×");

  ctx.restore();
}

/** The open/close control. Same ink as the map so it reads as part of it. */
function drawToggle(ctx: CanvasRenderingContext2D, box: MapRect, label: string): void {
  ctx.fillStyle = "rgba(226, 199, 148, 0.92)";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
  ctx.fillStyle = INK;
  ctx.font = "9px Palatino, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, box.x + box.w / 2, box.y + box.h / 2 + 0.5);
}
