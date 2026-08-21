import { STILL_HEIGHT, STILL_WIDTH } from "../world/set/types";

/** DreamFactory framebuffer. SET stills occupy the top 264 rows. */
export const STAGE_WIDTH = 512;
export const STAGE_HEIGHT = 384;
export const HUD_HEIGHT = STAGE_HEIGHT - STILL_HEIGHT;

export interface PlayStageRect {
  x: number;
  y: number;
  scale: number;
  w: number;
  h: number;
  worldW: number;
  worldH: number;
  hudH: number;
}

/** Integer-scale 512×384 letterbox in the window. */
export function playStageRect(winW: number, winH: number): PlayStageRect {
  const fit = Math.min(winW / STAGE_WIDTH, winH / STAGE_HEIGHT);
  const scale = fit >= 1 ? Math.max(1, Math.floor(fit)) : fit;
  const w = STAGE_WIDTH * scale;
  const h = STAGE_HEIGHT * scale;
  return {
    x: Math.floor((winW - w) / 2),
    y: Math.floor((winH - h) / 2),
    scale,
    w,
    h,
    worldW: STILL_WIDTH * scale,
    worldH: STILL_HEIGHT * scale,
    hudH: HUD_HEIGHT * scale,
  };
}
