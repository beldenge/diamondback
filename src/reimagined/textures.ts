/**
 * Procedural tiling textures, all drawn on canvases at boot. No SET
 * stills are pasted onto geometry — these are Dust-palette materials
 * (wood / adobe / brick / dirt / palisade / olive / blackwood).
 */
import * as THREE from "three";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) {
    throw new Error("2d context unavailable");
  }
  return [c, ctx];
}

/** Deterministic tiny PRNG so rebuilds look identical. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

function finish(c: HTMLCanvasElement, repeatWorld: number): THREE.Texture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // Builder UVs are world units / texWorld; texWorld is carried here.
  tex.userData.texWorld = repeatWorld;
  return tex;
}

function noise(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: number,
  count: number,
  size: number,
  alpha: number,
): void {
  const r = rng(seed);
  for (let i = 0; i < count; i += 1) {
    const v = r();
    ctx.fillStyle = v > 0.5 ? `rgba(255,240,220,${alpha})` : `rgba(20,10,0,${alpha})`;
    ctx.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r()));
  }
}

export function dirtTex(base: string, dark: string): THREE.Texture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(7);
  for (let i = 0; i < 900; i += 1) {
    const f = 0.82 + r() * 0.36;
    ctx.fillStyle = r() > 0.75 ? shade(dark, f) : shade(base, f);
    const s = 2 + r() * 7;
    ctx.fillRect(r() * 256, r() * 256, s, s * (0.4 + r() * 0.5));
  }
  // faint wheel-rut streaks
  ctx.strokeStyle = "rgba(60,30,10,0.12)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(r() * 256, 0);
    ctx.bezierCurveTo(r() * 256, 80, r() * 256, 180, r() * 256, 256);
    ctx.stroke();
  }
  return finish(c, 7);
}

/** Vertical planks (western siding). */
export function planksV(base: string, seed = 1, plank = 26, gapAlpha = 0.5): THREE.Texture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let x = 0; x < 256; x += plank) {
    ctx.fillStyle = shade(base, 0.86 + r() * 0.26);
    ctx.fillRect(x, 0, plank - 2, 256);
    ctx.fillStyle = `rgba(0,0,0,${gapAlpha})`;
    ctx.fillRect(x + plank - 2, 0, 2, 256);
    // grain
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      const gx = x + 3 + r() * (plank - 8);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx + (r() - 0.5) * 6, 256);
      ctx.stroke();
    }
    // nail pairs
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x + 4, 30 + r() * 8, 2, 2);
    ctx.fillRect(x + plank - 8, 200 + r() * 8, 2, 2);
  }
  noise(ctx, 256, 256, seed + 9, 200, 3, 0.05);
  return finish(c, 3);
}

/** Horizontal lap boards. */
export function planksH(base: string, seed = 2, board = 24): THREE.Texture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let y = 0; y < 256; y += board) {
    ctx.fillStyle = shade(base, 0.86 + r() * 0.26);
    ctx.fillRect(0, y, 256, board - 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, y + board - 2, 256, 2);
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    for (let i = 0; i < 4; i += 1) {
      const gy = y + 3 + r() * (board - 8);
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(256, gy + (r() - 0.5) * 4);
      ctx.stroke();
    }
  }
  noise(ctx, 256, 256, seed + 5, 180, 3, 0.05);
  return finish(c, 3);
}

export function floorPlanks(base: string, seed = 3): THREE.Texture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let y = 0; y < 256; y += 32) {
    for (let x = -32; x < 256; x += 96) {
      const off = (y / 32) % 2 === 0 ? 0 : 48;
      ctx.fillStyle = shade(base, 0.84 + r() * 0.3);
      ctx.fillRect(x + off, y, 94, 30);
    }
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, y + 30, 256, 2);
  }
  return finish(c, 3.4);
}

export function adobeTex(
  base: string,
  seed = 4,
  patch?: string,
  patchCount = 6,
): THREE.Texture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let i = 0; i < 700; i += 1) {
    ctx.fillStyle = shade(base, 0.9 + r() * 0.2);
    ctx.fillRect(r() * 256, r() * 256, 3 + r() * 8, 2 + r() * 6);
  }
  if (patch) {
    // plaster fallen away in ragged patches showing the brick courses
    // beneath (the mission and the jail in the film)
    for (let i = 0; i < patchCount; i += 1) {
      const px = r() * 256;
      const py = r() * 256;
      const w = 18 + r() * 40;
      const h = 10 + r() * 26;
      for (let row = 0; row < h; row += 6) {
        const off = (row / 6) % 2 === 0 ? 0 : 7;
        for (let col = -off; col < w; col += 14) {
          const cw = Math.min(12, w - col);
          if (cw <= 2) {
            continue;
          }
          ctx.fillStyle = shade(patch, 0.8 + r() * 0.35);
          ctx.fillRect(px + Math.max(0, col), py + row, cw - Math.max(0, -col), 5);
        }
      }
    }
  }
  // hairline cracks
  ctx.strokeStyle = "rgba(50,30,15,0.25)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    let x = r() * 256;
    let y = r() * 100;
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k += 1) {
      x += (r() - 0.5) * 30;
      y += 20 + r() * 20;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c, 4);
}

export function brickTex(base: string, mortar: string, seed = 5): THREE.Texture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  const bh = 16;
  const bw = 42;
  for (let y = 0; y < 256; y += bh) {
    const off = (y / bh) % 2 === 0 ? 0 : bw / 2;
    for (let x = -bw; x < 256 + bw; x += bw) {
      ctx.fillStyle = shade(base, 0.82 + r() * 0.36);
      ctx.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
    }
  }
  noise(ctx, 256, 256, seed + 3, 260, 2, 0.06);
  return finish(c, 2.6);
}

export function shingleTex(base: string, seed = 6): THREE.Texture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let y = 0; y < 256; y += 22) {
    for (let x = 0; x < 256; x += 28) {
      const off = (y / 22) % 2 === 0 ? 0 : 14;
      ctx.fillStyle = shade(base, 0.8 + r() * 0.4);
      ctx.fillRect(x + off, y, 26, 20);
    }
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, y + 20, 256, 2);
  }
  return finish(c, 3);
}

export function tileRoofTex(base: string, seed = 7): THREE.Texture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = shade(base, 0.7);
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let x = 0; x < 256; x += 24) {
    for (let y = 0; y < 256; y += 30) {
      ctx.fillStyle = shade(base, 0.85 + r() * 0.3);
      ctx.beginPath();
      ctx.ellipse(x + 12, y + 15, 10, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish(c, 2.2);
}

export function palisadeTex(base: string, seed = 8): THREE.Texture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = "#0c0a08";
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let x = 0; x < 256; x += 22) {
    const w = 16 + r() * 5;
    ctx.fillStyle = shade(base, 0.8 + r() * 0.5);
    ctx.fillRect(x, 0, w, 256);
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.moveTo(x + w / 2, 0);
    ctx.lineTo(x + w / 2 + (r() - 0.5) * 6, 256);
    ctx.stroke();
  }
  return finish(c, 2.6);
}

export function wallpaperTex(
  bg: string,
  fg: string,
  pattern: "sprig" | "damask" | "fleur" | "dots" | "crest",
  seed = 9,
): THREE.Texture {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = fg;
  ctx.strokeStyle = fg;
  const cell = 32;
  for (let y = 0; y < 128; y += cell) {
    for (let x = 0; x < 128; x += cell) {
      const cx = x + cell / 2 + ((y / cell) % 2 === 0 ? 0 : cell / 2);
      const cy = y + cell / 2;
      ctx.globalAlpha = 0.5;
      if (pattern === "dots") {
        ctx.beginPath();
        ctx.arc(cx % 128, cy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (pattern === "sprig") {
        ctx.beginPath();
        ctx.moveTo(cx % 128, cy - 5);
        ctx.lineTo(cx % 128, cy + 5);
        ctx.moveTo(cx % 128, cy);
        ctx.lineTo((cx % 128) - 4, cy - 3);
        ctx.moveTo(cx % 128, cy);
        ctx.lineTo((cx % 128) + 4, cy - 3);
        ctx.stroke();
      } else if (pattern === "fleur") {
        ctx.font = "12px Georgia";
        ctx.fillText("+", (cx % 128) - 3, cy + 4);
      } else if (pattern === "crest") {
        ctx.beginPath();
        ctx.arc(cx % 128, cy, 4, Math.PI, 0);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(cx % 128, cy, 6, 9, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  noise(ctx, 128, 128, seed, 60, 2, 0.04);
  return finish(c, 2.2);
}

export interface BoardOpts {
  bg?: string;
  fg?: string;
  border?: string;
  font?: string;
  /** Canvas pixels per world unit (default 96). */
  scale?: number;
  planked?: boolean;
  align?: "center" | "left";
  /** Fill the line height with the glyphs (letters painted on walls). */
  tight?: boolean;
  /** Space the characters evenly across the board (painted names). */
  spread?: boolean;
}

/**
 * A lettered sign board sized for a w×h world-unit plane. Returns a
 * non-repeating texture (clamped), aspect matched to the plane.
 */
export function boardTex(
  lines: string[],
  w: number,
  h: number,
  opts: BoardOpts = {},
): THREE.Texture {
  const scale = opts.scale ?? 96;
  const cw = Math.max(32, Math.round(w * scale));
  const ch = Math.max(32, Math.round(h * scale));
  const [c, ctx] = canvas(cw, ch);
  // "transparent" leaves the ground clear: letters painted straight
  // onto a wall (the bank, the hotel, Bolivar's) instead of on a board
  if (opts.bg !== "transparent") {
    ctx.fillStyle = opts.bg ?? "#4f382a";
    ctx.fillRect(0, 0, cw, ch);
  }
  if (opts.planked) {
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    const rows = Math.max(2, Math.round(h / 0.35));
    for (let i = 1; i < rows; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, (ch / rows) * i);
      ctx.lineTo(cw, (ch / rows) * i);
      ctx.stroke();
    }
  }
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = Math.max(2, ch * 0.045);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, cw - ctx.lineWidth, ch - ctx.lineWidth);
  }
  ctx.fillStyle = opts.fg ?? "#e6dcba";
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = "middle";
  const pad = ch * (opts.tight ? 0.02 : 0.14);
  const lineH = (ch - pad * 2) / lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i];
    if (!text) {
      continue;
    }
    let size = Math.min(lineH * (opts.tight ? 1.0 : 0.82), (cw * (opts.tight ? 1.9 : 1.62)) / Math.max(4, text.length));
    size = Math.max(9, size);
    ctx.font = opts.font ? `${size}px ${opts.font}` : `bold ${size}px Georgia, serif`;
    if (opts.spread && text.length > 1) {
      const n = text.length;
      const span = cw * 0.92;
      for (let k = 0; k < n; k += 1) {
        ctx.fillText(text[k], cw * 0.04 + (span * (k + 0.5)) / n, pad + lineH * (i + 0.5));
      }
      continue;
    }
    const x = (opts.align ?? "center") === "left" ? cw * 0.06 : cw / 2;
    ctx.fillText(text, x, pad + lineH * (i + 0.5), cw * 0.94);
  }
  noise(ctx, cw, ch, 31, Math.round((cw * ch) / 900), 2, 0.05);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export type PosterKind =
  | "wanted"
  | "wanted2"
  | "circus"
  | "repent"
  | "bishop"
  | "tonic"
  | "news"
  | "martash"
  | "girls"
  | "manzana"
  | "notice";

/** Small aged handbills for the poster walls. */
export function posterTex(kind: PosterKind): THREE.Texture {
  const [c, ctx] = canvas(96, 128);
  const aged =
    kind === "bishop" ? "#241f19" : kind === "martash" ? "#1c2140" : kind === "circus" ? "#ccb98a" : kind === "girls" || kind === "manzana" ? "#c9b070" : "#d8cba6";
  ctx.fillStyle = aged;
  ctx.fillRect(0, 0, 96, 128);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.strokeRect(2, 2, 92, 124);
  if (kind === "notice") {
    // the proclamation on the stage office's east face (G9 S): a gilt seal
    // over close-set lines of small print
    ctx.fillStyle = "#8a6a2a";
    ctx.beginPath();
    ctx.arc(48, 24, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d8cba6";
    ctx.beginPath();
    ctx.arc(48, 24, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a3a20";
    ctx.beginPath();
    ctx.arc(48, 24, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#231a10";
    ctx.textAlign = "center";
    ctx.font = "bold 8px Georgia";
    ctx.fillText("PROCLAMATION", 48, 46);
    for (let i = 0; i < 12; i += 1) {
      const lw = 40 + ((i * 37) % 30);
      ctx.fillRect(48 - lw / 2, 54 + i * 5.5, lw, 1.5);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const ink = kind === "bishop" || kind === "martash" ? "#d8cba6" : "#231a10";
  if (kind === "martash") {
    // the Egyptian magician's bill: a starburst on midnight blue (G6 S / G3 S)
    ctx.strokeStyle = "rgba(210,190,140,0.5)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(48, 68);
      ctx.lineTo(48 + Math.cos(a) * 60, 68 + Math.sin(a) * 60);
      ctx.stroke();
    }
    ctx.fillStyle = "#0b0d1c";
    ctx.beginPath();
    ctx.arc(48, 68, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.font = "8px Georgia";
    ctx.fillText("COME AND SEE", 48, 14);
    ctx.font = "bold 15px Georgia";
    ctx.fillText("MARTASH", 48, 30);
    ctx.font = "bold 10px Georgia";
    ctx.fillText("THE", 48, 98);
    ctx.fillText("EGYPTIAN", 48, 110);
    ctx.fillText("MAGICIAN", 48, 122);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }
  if (kind === "girls") {
    // the saloon's dancing-girls bill (G5 S / G3 S / G11 N)
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.font = "bold 9px Georgia";
    ctx.fillText("DIAMONDBACK", 48, 13);
    ctx.font = "bold 13px Georgia";
    ctx.fillText("WANTED:", 48, 27);
    ctx.fillStyle = "#3a2d20";
    for (const gx of [30, 48, 66]) {
      ctx.beginPath();
      ctx.arc(gx, 48, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(gx - 7, 54, 14, 22);
      ctx.fillRect(gx - 9, 76, 18, 6);
    }
    ctx.fillStyle = ink;
    ctx.font = "italic 11px Georgia";
    ctx.fillText("Winter Girls", 48, 98);
    ctx.font = "7px Georgia";
    ctx.fillText("apply at the", 48, 109);
    ctx.font = "bold 8px Georgia";
    ctx.fillText("THE HARD DRIVE SALOON", 48, 121);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }
  if (kind === "manzana") {
    // the exhibition bill stamped CANCELED (G5 S / G3 S)
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.font = "bold 8px Georgia";
    ctx.fillText("Will be EXHIBITED", 48, 14);
    ctx.font = "6px Georgia";
    ctx.fillText("For One Day Only at the Hard Drive", 48, 24);
    ctx.font = "bold 16px Georgia";
    ctx.fillText("MANZANA", 48, 50);
    ctx.font = "bold 8px Georgia";
    ctx.fillText("HAND OF THE", 48, 64);
    ctx.fillText("FINGERLESS EARL", 48, 75);
    ctx.font = "6px Georgia";
    for (let y = 88; y < 122; y += 7) {
      ctx.fillText("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~", 48, y);
    }
    ctx.save();
    ctx.translate(48, 72);
    ctx.rotate(-0.55);
    ctx.fillStyle = "rgba(200,30,20,0.85)";
    ctx.font = "bold 20px Georgia";
    ctx.fillText("CANCELED", 0, 8);
    ctx.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  const title =
    kind === "wanted" || kind === "wanted2"
      ? "WANTED"
      : kind === "circus"
        ? "MARTASH"
        : kind === "repent"
          ? "REPENT"
          : kind === "bishop"
            ? "TONIGHT"
            : kind === "tonic"
              ? "TONIC"
              : "THE NEWS";
  ctx.font = "bold 16px Georgia";
  ctx.fillText(title, 48, 22);
  ctx.font = "9px Georgia";
  if (kind === "wanted" || kind === "wanted2") {
    ctx.fillText(kind === "wanted" ? "DEAD OR ALIVE" : "$300 REWARD", 48, 34);
    // mug
    ctx.fillStyle = "#3a2d20";
    ctx.beginPath();
    ctx.arc(48, 64, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(26, 44, 44, 10);
    ctx.fillStyle = ink;
    ctx.fillText(kind === "wanted" ? '"MAD" TODD APPLETON' : '"DIRTY DON"', 48, 96);
    ctx.fillText("$300 REWARD", 48, 110);
  } else if (kind === "bishop") {
    // the saloon's show bill (the G5 S poster wall)
    ctx.font = "bold 11px Georgia";
    ctx.fillText("Singing & Dancing", 48, 40);
    ctx.font = "9px Georgia";
    ctx.fillText("Ruby and Oona", 48, 58);
    ctx.fillText("Chorus of Girls", 48, 72);
    ctx.font = "bold 9px Georgia";
    ctx.fillText("THE HARD DRIVE SALOON", 48, 108);
  } else if (kind === "circus") {
    ctx.fillText("The Egyptian", 48, 36);
    ctx.fillText("Magician", 48, 48);
    ctx.fillStyle = "#7e1f1c";
    ctx.beginPath();
    ctx.moveTo(48, 58);
    ctx.lineTo(66, 100);
    ctx.lineTo(30, 100);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.fillText("ONE NIGHT ONLY", 48, 116);
  } else if (kind === "news") {
    ctx.textAlign = "left";
    ctx.font = "bold 11px Georgia";
    ctx.fillText("The Rattler", 6, 16);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    for (let y = 30; y < 122; y += 5) {
      ctx.beginPath();
      ctx.moveTo(6, y);
      ctx.lineTo(90 - (y % 3) * 8, y);
      ctx.stroke();
    }
  } else {
    // the temperance bill the film pins everywhere reads REPENT / DEMON ALCOHOL
    ctx.font = "bold 10px Georgia";
    ctx.fillText(kind === "repent" ? "DEMON ALCOHOL" : "cures all ills", 48, 40);
    ctx.font = "9px Georgia";
    for (let y = 54; y < 118; y += 7) {
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(86, y);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** A grinning carved sun face for the mission disks. */
/**
 * A quarter sunburst for the hotel's lettering: a small disc in one bottom
 * corner with knobbed rays fanning up and away from it (E7 E / F7 E).
 * `discRight` puts the disc in the bottom-right corner.
 */
export function sunFanTex(discRight = false): THREE.Texture {
  const [c, ctx] = canvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  const cx = discRight ? 112 : 16;
  const cy = 112;
  const sx = discRight ? -1 : 1;
  ctx.strokeStyle = "#dfd4ac";
  ctx.fillStyle = "#dfd4ac";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  for (let i = 0; i <= 8; i += 1) {
    const a = (i / 8) * (Math.PI / 2);
    const dx = sx * Math.cos(a);
    const dy = -Math.sin(a);
    const len = i % 2 === 0 ? 100 : 84;
    ctx.beginPath();
    ctx.moveTo(cx + dx * 24, cy + dy * 24);
    ctx.lineTo(cx + dx * len, cy + dy * len);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + dx * (len + 5), cy + dy * (len + 5), 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6f6a48";
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A pelt stretched on the wheelwright's east gable (J4 W): a dark body with four leg stubs. */
export function hideTex(): THREE.Texture {
  const [c, ctx] = canvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = "#2e2118";
  for (const [lx, ly, a] of [
    [24, 26, 0.9],
    [104, 26, -0.9],
    [22, 104, 2.3],
    [106, 104, -2.3],
  ] as const) {
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.ellipse(64, 66, 36, 42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2a1e";
  ctx.beginPath();
  ctx.ellipse(64, 62, 22, 28, 0, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A rack of antlers (cut-out) for the wheelwright's east front (J4 W / K3 W). */
export function antlerTex(): THREE.Texture {
  const [c, ctx] = canvas(128, 96);
  ctx.clearRect(0, 0, 128, 96);
  ctx.strokeStyle = "#d8cfb6";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(52, 90);
  ctx.lineTo(76, 90);
  ctx.stroke();
  for (const sx of [-1, 1]) {
    const bx = 64 + sx * 8;
    ctx.beginPath();
    ctx.moveTo(bx, 90);
    ctx.quadraticCurveTo(bx + sx * 18, 60, bx + sx * 40, 14);
    ctx.stroke();
    for (const [t, len, ang] of [
      [0.35, 22, -1.3],
      [0.6, 20, -1.1],
      [0.82, 16, -0.9],
    ] as const) {
      const px = bx + sx * (18 * 2 * t * (1 - t) + 40 * t * t);
      const py = 90 - (60 * 2 * t * (1 - t) + 76 * t * t);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + sx * Math.cos(ang) * len * 0.4, py + Math.sin(ang) * len);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function sunFaceTex(): THREE.Texture {
  // the mission's stone sun faces (D7 N / D6 N): a shaded round face with
  // closed eyes, a nose ridge and full lips, transparent around the disc
  const [c, ctx] = canvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  const g = ctx.createRadialGradient(52, 50, 6, 64, 64, 60);
  g.addColorStop(0, "#c2b6a4");
  g.addColorStop(0.7, "#a89c8c");
  g.addColorStop(1, "#7a7064");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#6a6058";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (const ex of [44, 84]) {
    ctx.beginPath();
    ctx.arc(ex, 54, 9, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ex, 46, 12, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(64, 50);
  ctx.lineTo(58, 76);
  ctx.lineTo(70, 76);
  ctx.stroke();
  ctx.fillStyle = "#8a7e72";
  ctx.beginPath();
  ctx.ellipse(64, 92, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#6a6058";
  ctx.beginPath();
  ctx.moveTo(48, 92);
  ctx.lineTo(80, 92);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** White petroglyphs on cave rock for the Yunni underground. */
export function glyphTex(kind: "figures" | "spiral" | "snake" | "bird" | "stele" | "spider" | "dancers"): THREE.Texture {
  const [c, ctx] = canvas(160, 160);
  ctx.fillStyle = kind === "stele" ? "#4a2a20" : "#57291e";
  ctx.fillRect(0, 0, 160, 160);
  ctx.strokeStyle = "#c8ac8c";
  ctx.fillStyle = "#c8ac8c";
  ctx.lineWidth = 3;
  const man = (x: number, y: number, s: number): void => {
    ctx.beginPath();
    ctx.arc(x, y - s * 0.8, s * 0.22, 0, Math.PI * 2);
    ctx.moveTo(x, y - s * 0.55);
    ctx.lineTo(x, y + s * 0.3);
    ctx.moveTo(x - s * 0.5, y - s * 0.25);
    ctx.lineTo(x + s * 0.5, y - s * 0.45);
    ctx.moveTo(x, y + s * 0.3);
    ctx.lineTo(x - s * 0.4, y + s * 0.9);
    ctx.moveTo(x, y + s * 0.3);
    ctx.lineTo(x + s * 0.4, y + s * 0.9);
    ctx.stroke();
  };
  if (kind === "figures") {
    man(45, 70, 28);
    man(105, 90, 34);
    ctx.beginPath();
    ctx.arc(125, 35, 12, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(125 + Math.cos(a) * 15, 35 + Math.sin(a) * 15);
      ctx.lineTo(125 + Math.cos(a) * 21, 35 + Math.sin(a) * 21);
      ctx.stroke();
    }
  } else if (kind === "spiral") {
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 6; a += 0.15) {
      const r = 6 + a * 3.4;
      const px = 80 + Math.cos(a) * r;
      const py = 80 + Math.sin(a) * r;
      if (a === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  } else if (kind === "snake") {
    ctx.beginPath();
    ctx.moveTo(10, 110);
    for (let x = 10; x <= 150; x += 10) {
      ctx.lineTo(x, 110 + (Math.floor(x / 10) % 2 === 0 ? -26 : 0));
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(150, 96, 6, 0, Math.PI * 2);
    ctx.fill();
    man(50, 50, 22);
  } else if (kind === "bird") {
    ctx.beginPath();
    ctx.moveTo(80, 40);
    ctx.lineTo(80, 110);
    ctx.moveTo(20, 70);
    ctx.quadraticCurveTo(50, 40, 80, 62);
    ctx.quadraticCurveTo(110, 40, 140, 70);
    ctx.moveTo(64, 118);
    ctx.lineTo(80, 100);
    ctx.lineTo(96, 118);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(80, 34, 7, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "stele") {
    // stele: bordered tablet dense with small marks
    ctx.strokeRect(8, 8, 144, 144);
    const r = rng(77);
    ctx.lineWidth = 2;
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const x = 24 + col * 32;
        const y = 26 + row * 26;
        if (r() > 0.5) {
          man(x, y, 9);
        } else {
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }
  if (kind === "spider") {
    // the pedestal's spider: a fat body, eight bent legs, two blue eyes
    ctx.fillStyle = "#e8dcc2";
    ctx.strokeStyle = "#e8dcc2";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(80, 98, 22, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(80, 58, 16, 0, Math.PI * 2);
    ctx.fill();
    for (const sgn of [-1, 1]) {
      for (let k = 0; k < 4; k += 1) {
        const y = 64 + k * 16;
        ctx.beginPath();
        ctx.moveTo(80 + sgn * 14, y);
        ctx.lineTo(80 + sgn * (46 + k * 4), y - 24 + k * 6);
        ctx.lineTo(80 + sgn * (60 + k * 3), y + 10 + k * 7);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "#6ad8ff";
    ctx.beginPath();
    ctx.arc(72, 54, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(88, 54, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (kind === "dancers") {
    // black dancing figures with feathered heads (the snake trial's walls)
    ctx.strokeStyle = "#1a0a08";
    ctx.fillStyle = "#1a0a08";
    ctx.lineWidth = 4;
    for (const [dx, dy, s] of [
      [45, 90, 40],
      [115, 80, 46],
    ] as const) {
      ctx.beginPath();
      ctx.arc(dx, dy - s * 0.85, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(dx, dy - s * 0.65);
      ctx.lineTo(dx + s * 0.1, dy + s * 0.25);
      ctx.moveTo(dx - s * 0.55, dy - s * 0.7);
      ctx.lineTo(dx, dy - s * 0.35);
      ctx.lineTo(dx + s * 0.5, dy - s * 0.75);
      ctx.moveTo(dx + s * 0.1, dy + s * 0.25);
      ctx.lineTo(dx - s * 0.35, dy + s * 0.95);
      ctx.moveTo(dx + s * 0.1, dy + s * 0.25);
      ctx.lineTo(dx + s * 0.55, dy + s * 0.85);
      for (const k of [-2, -1, 0, 1, 2]) {
        ctx.moveTo(dx, dy - s * 1.0);
        ctx.lineTo(dx + k * s * 0.15, dy - s * 1.3);
      }
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** The shooting gallery's navy band of white teepee targets. */
export function teepeeBandTex(count = 7): THREE.Texture {
  const [c, ctx] = canvas(64 * count, 96);
  ctx.fillStyle = "#2b3a5c";
  ctx.fillRect(0, 0, 64 * count, 96);
  for (let i = 0; i < count; i += 1) {
    const cx = 32 + i * 64;
    ctx.fillStyle = "#efeadb";
    ctx.beginPath();
    ctx.moveTo(cx, 8);
    ctx.lineTo(cx + 26, 88);
    ctx.lineTo(cx - 26, 88);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#2b3a5c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, 26);
    ctx.lineTo(cx + 15, 88);
    ctx.moveTo(cx, 26);
    ctx.lineTo(cx - 15, 88);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** The glowing cyan thunderbird emblem on its spiked disc. */
export function thunderbirdTex(): THREE.Texture {
  const [c, ctx] = canvas(160, 160);
  ctx.clearRect(0, 0, 160, 160);
  ctx.fillStyle = "#1c1a16";
  ctx.beginPath();
  ctx.arc(80, 80, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#57e6e6";
  ctx.fillStyle = "#57e6e6";
  ctx.lineWidth = 7;
  ctx.shadowColor = "#57e6e6";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(80, 46);
  ctx.lineTo(80, 112);
  ctx.moveTo(34, 84);
  ctx.quadraticCurveTo(58, 52, 80, 72);
  ctx.quadraticCurveTo(102, 52, 126, 84);
  ctx.moveTo(62, 120);
  ctx.lineTo(80, 102);
  ctx.lineTo(98, 120);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(80, 40, 9, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Pictures, shelves, boards — the framed things on interior walls.   */

function clampTex(c: HTMLCanvasElement, aniso = 8): THREE.Texture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = aniso;
  return tex;
}

export type PictureKind =
  | "landscape"
  | "desert"
  | "portrait"
  | "lady"
  | "odalisque"
  | "map"
  | "anatomy"
  | "skeleton"
  | "cow"
  | "flowers"
  | "witch"
  | "insects"
  | "madonna"
  | "scroll"
  | "certificate"
  | "mirror"
  | "blind"
  | "newspaper"
  | "chalkboard"
  | "sunCloth"
  | "keys"
  | "galley";

/**
 * A painted picture for a frame. Drawn with canvas primitives in the
 * film's sepia / oil-paint palette; `w`/`h` set the aspect.
 */
export function pictureTex(kind: PictureKind, w = 128, h = 96): THREE.Texture {
  const [c, ctx] = canvas(w, h);
  const r = rng(kind.length * 131 + w);
  const fill = (color: string): void => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
  };
  const ell = (x: number, y: number, rx: number, ry: number, color: string, rot = 0): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  };
  const grad = (top: string, bottom: string): void => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  const lines = (n: number, x0: number, x1: number, y0: number, dy: number, color: string, lw = 1): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    for (let i = 0; i < n; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x0, y0 + i * dy);
      ctx.lineTo(x1 - r() * (x1 - x0) * 0.35, y0 + i * dy);
      ctx.stroke();
    }
  };
  switch (kind) {
    case "landscape": {
      grad("#a9b8c6", "#d9c99a");
      ctx.fillStyle = "#6f7f8f";
      ctx.beginPath();
      ctx.moveTo(0, h * 0.62);
      ctx.lineTo(w * 0.2, h * 0.3);
      ctx.lineTo(w * 0.36, h * 0.5);
      ctx.lineTo(w * 0.55, h * 0.22);
      ctx.lineTo(w * 0.78, h * 0.52);
      ctx.lineTo(w, h * 0.38);
      ctx.lineTo(w, h * 0.66);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e9e4d6";
      ctx.beginPath();
      ctx.moveTo(w * 0.47, h * 0.34);
      ctx.lineTo(w * 0.55, h * 0.22);
      ctx.lineTo(w * 0.63, h * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#5f7a45";
      ctx.fillRect(0, h * 0.62, w, h * 0.38);
      ell(w * 0.62, h * 0.8, w * 0.3, h * 0.08, "#8fb0b8");
      ell(w * 0.18, h * 0.6, w * 0.08, h * 0.16, "#2f3d23");
      ctx.fillStyle = "#2f3d23";
      ctx.fillRect(w * 0.17, h * 0.6, w * 0.02, h * 0.3);
      break;
    }
    case "desert": {
      grad("#e2a35c", "#f1d29a");
      ell(w * 0.72, h * 0.3, w * 0.09, w * 0.09, "#f7e6b4");
      ctx.fillStyle = "#8b4a34";
      ctx.beginPath();
      ctx.moveTo(0, h * 0.7);
      ctx.lineTo(w * 0.15, h * 0.7);
      ctx.lineTo(w * 0.2, h * 0.45);
      ctx.lineTo(w * 0.45, h * 0.45);
      ctx.lineTo(w * 0.5, h * 0.7);
      ctx.lineTo(w, h * 0.7);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#c98b52";
      ctx.fillRect(0, h * 0.72, w, h * 0.28);
      ctx.fillStyle = "#3f5a32";
      ctx.fillRect(w * 0.7, h * 0.4, w * 0.04, h * 0.4);
      ctx.fillRect(w * 0.66, h * 0.5, w * 0.04, h * 0.14);
      ctx.fillRect(w * 0.74, h * 0.46, w * 0.04, h * 0.18);
      break;
    }
    case "portrait":
    case "lady": {
      fill("#2b2118");
      ell(w / 2, h / 2, w * 0.42, h * 0.46, "#cbb894");
      ell(w / 2, h * 0.7, w * 0.3, h * 0.3, "#4a3826");
      ell(w / 2, h * 0.36, w * 0.14, h * 0.18, "#5c4634");
      if (kind === "lady") {
        ell(w / 2, h * 0.2, w * 0.26, h * 0.08, "#3a2a1e");
        ell(w / 2, h * 0.16, w * 0.14, h * 0.1, "#3a2a1e");
      }
      break;
    }
    case "odalisque": {
      grad("#b98b45", "#7f5a2a");
      ell(w * 0.5, h * 0.7, w * 0.42, h * 0.16, "#6a3f22");
      ell(w * 0.55, h * 0.62, w * 0.3, h * 0.12, "#e6c39a", -0.12);
      ell(w * 0.24, h * 0.5, w * 0.07, h * 0.1, "#e6c39a");
      ell(w * 0.25, h * 0.42, w * 0.08, h * 0.08, "#4a2c18");
      ell(w * 0.7, h * 0.58, w * 0.18, h * 0.08, "#c33a2b", 0.2);
      break;
    }
    case "map": {
      fill("#d9c79a");
      noise(ctx, w, h, 9, 80, 2, 0.08);
      ctx.strokeStyle = "#6d4a2a";
      ctx.lineWidth = 2;
      ctx.strokeRect(w * 0.08, h * 0.2, w * 0.4, h * 0.6);
      ctx.strokeRect(w * 0.48, h * 0.2, w * 0.42, h * 0.6);
      ctx.strokeStyle = "#7d8aa0";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w * 0.1, h * 0.55);
      ctx.bezierCurveTo(w * 0.3, h * 0.4, w * 0.5, h * 0.7, w * 0.88, h * 0.5);
      ctx.stroke();
      ctx.fillStyle = "#4a3826";
      ctx.textAlign = "center";
      ctx.font = `bold ${Math.round(h * 0.11)}px Georgia`;
      ctx.fillText("ARIZONA AND NEW MEXICO", w / 2, h * 0.13);
      ctx.font = `${Math.round(h * 0.08)}px Georgia`;
      ctx.fillText("TERRITORIES", w / 2, h * 0.92);
      for (let i = 0; i < 12; i += 1) {
        ctx.fillRect(w * (0.12 + r() * 0.76), h * (0.25 + r() * 0.5), 2, 2);
      }
      break;
    }
    case "anatomy":
    case "skeleton": {
      fill(kind === "anatomy" ? "#d8c9a4" : "#e6dcc4");
      const ink = kind === "anatomy" ? "#6a4a2a" : "#3a3028";
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      const cx = w / 2;
      ctx.beginPath();
      ctx.arc(cx, h * 0.14, h * 0.08, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, h * 0.22);
      ctx.lineTo(cx, h * 0.62);
      ctx.moveTo(cx - w * 0.2, h * 0.3);
      ctx.lineTo(cx + w * 0.2, h * 0.3);
      ctx.moveTo(cx - w * 0.2, h * 0.3);
      ctx.lineTo(cx - w * 0.26, h * 0.6);
      ctx.moveTo(cx + w * 0.2, h * 0.3);
      ctx.lineTo(cx + w * 0.26, h * 0.6);
      ctx.moveTo(cx, h * 0.62);
      ctx.lineTo(cx - w * 0.12, h * 0.95);
      ctx.moveTo(cx, h * 0.62);
      ctx.lineTo(cx + w * 0.12, h * 0.95);
      ctx.stroke();
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.ellipse(cx, h * (0.34 + i * 0.05), w * 0.12, h * 0.02, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (kind === "anatomy") {
        ell(cx - w * 0.04, h * 0.4, w * 0.05, h * 0.05, "#a33a2b");
        ell(cx + w * 0.02, h * 0.52, w * 0.09, h * 0.06, "#b56a4a");
      } else {
        ctx.fillStyle = ink;
        ctx.fillRect(cx - h * 0.04, h * 0.12, h * 0.025, h * 0.025);
        ctx.fillRect(cx + h * 0.015, h * 0.12, h * 0.025, h * 0.025);
      }
      break;
    }
    case "cow": {
      grad("#c9d3d9", "#8fa36a");
      ctx.fillStyle = "#5f7a45";
      ctx.fillRect(0, h * 0.55, w, h * 0.45);
      ell(w * 0.5, h * 0.6, w * 0.26, h * 0.16, "#f0ebe0");
      ell(w * 0.74, h * 0.52, w * 0.09, h * 0.09, "#f0ebe0");
      ell(w * 0.45, h * 0.58, w * 0.08, h * 0.09, "#2b2118");
      ell(w * 0.6, h * 0.66, w * 0.06, h * 0.05, "#2b2118");
      ctx.fillStyle = "#e8e2d4";
      for (const lx of [0.32, 0.42, 0.58, 0.68]) {
        ctx.fillRect(w * lx, h * 0.7, w * 0.04, h * 0.16);
      }
      break;
    }
    case "flowers": {
      fill("#2e2a24");
      ell(w * 0.5, h * 0.82, w * 0.14, h * 0.16, "#7a6a4f");
      for (let i = 0; i < 14; i += 1) {
        const col = ["#e0c14a", "#d9d0c0", "#b8433a", "#e9a1b0", "#c8c3b0"][i % 5];
        ell(w * (0.3 + r() * 0.4), h * (0.25 + r() * 0.35), w * 0.06, h * 0.07, col);
      }
      ctx.strokeStyle = "#4a6a3a";
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i += 1) {
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.7);
        ctx.lineTo(w * (0.3 + r() * 0.4), h * (0.3 + r() * 0.3));
        ctx.stroke();
      }
      break;
    }
    case "witch": {
      grad("#1a2036", "#3a3a5c");
      ell(w * 0.7, h * 0.3, w * 0.12, w * 0.12, "#f2dc8a");
      ell(w * 0.75, h * 0.27, w * 0.1, w * 0.1, "#242a44");
      ctx.fillStyle = "#12100e";
      ctx.beginPath();
      ctx.moveTo(w * 0.28, h * 0.62);
      ctx.lineTo(w * 0.62, h * 0.5);
      ctx.lineTo(w * 0.6, h * 0.55);
      ctx.lineTo(w * 0.3, h * 0.66);
      ctx.closePath();
      ctx.fill();
      ell(w * 0.44, h * 0.47, w * 0.06, h * 0.12, "#12100e", 0.4);
      ctx.beginPath();
      ctx.moveTo(w * 0.4, h * 0.36);
      ctx.lineTo(w * 0.47, h * 0.18);
      ctx.lineTo(w * 0.52, h * 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(0, h * 0.86, w, h * 0.14);
      break;
    }
    case "insects": {
      fill("#e6dcc4");
      for (let i = 0; i < 4; i += 1) {
        const cx = w * (0.28 + (i % 2) * 0.44);
        const cy = h * (0.3 + Math.floor(i / 2) * 0.4);
        const col = ["#c8742c", "#4a5a8a", "#b8433a", "#6f8f3a"][i];
        ell(cx - w * 0.07, cy, w * 0.07, h * 0.1, col, -0.4);
        ell(cx + w * 0.07, cy, w * 0.07, h * 0.1, col, 0.4);
        ell(cx, cy, w * 0.012, h * 0.11, "#2b2118");
      }
      break;
    }
    case "madonna": {
      grad("#3a2a22", "#1d1512");
      ell(w * 0.5, h * 0.36, w * 0.28, w * 0.28, "#c9a24a");
      ell(w * 0.5, h * 0.4, w * 0.24, w * 0.24, "#2c1e18");
      ctx.fillStyle = "#4a5a8a";
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.22);
      ctx.lineTo(w * 0.86, h);
      ctx.lineTo(w * 0.14, h);
      ctx.closePath();
      ctx.fill();
      ell(w * 0.5, h * 0.4, w * 0.11, h * 0.13, "#d9b48a");
      break;
    }
    case "scroll": {
      fill("#d8ccae");
      ctx.strokeStyle = "#a3261d";
      ctx.lineWidth = Math.max(2, w * 0.05);
      ctx.strokeRect(w * 0.06, h * 0.03, w * 0.88, h * 0.94);
      ctx.strokeStyle = "#5a4a3a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.5);
      ctx.bezierCurveTo(w * 0.2, h * 0.35, w * 0.3, h * 0.75, w * 0.55, h * 0.7);
      ctx.bezierCurveTo(w * 0.8, h * 0.66, w * 0.7, h * 0.4, w * 0.5, h * 0.5);
      ctx.stroke();
      ell(w * 0.62, h * 0.38, w * 0.05, w * 0.05, "#5a4a3a");
      ctx.fillStyle = "#2b2118";
      for (let i = 0; i < 9; i += 1) {
        ctx.fillRect(w * 0.14, h * (0.12 + i * 0.045), w * 0.08, 2);
        ctx.fillRect(w * 0.16, h * (0.13 + i * 0.045), 2, h * 0.02);
      }
      break;
    }
    case "certificate": {
      fill("#e6dcc4");
      ctx.strokeStyle = "#8a7a52";
      ctx.lineWidth = 2;
      ctx.strokeRect(w * 0.04, h * 0.06, w * 0.92, h * 0.88);
      ctx.fillStyle = "#4a3826";
      ctx.textAlign = "center";
      ctx.font = `bold ${Math.round(h * 0.12)}px Georgia`;
      ctx.fillText("The Co-Operative", w / 2, h * 0.3);
      ctx.fillText("Town Company", w / 2, h * 0.45);
      lines(3, w * 0.15, w * 0.85, h * 0.6, h * 0.09, "#6a5a42");
      ell(w * 0.8, h * 0.8, w * 0.07, w * 0.07, "#a3261d");
      break;
    }
    case "mirror": {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#b7c4c9");
      g.addColorStop(0.45, "#8fa0a8");
      g.addColorStop(0.5, "#d8e2e6");
      g.addColorStop(1, "#7f8f96");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "blind": {
      fill("#ddd1b4");
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      for (let y = 6; y < h; y += 6) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.fillStyle = "#6a5a42";
      ctx.fillRect(0, h - 6, w, 6);
      ctx.strokeStyle = "#3a2a1e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w / 2, h - 12, 5, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "newspaper": {
      fill("#e2d8bc");
      ctx.fillStyle = "#231a10";
      ctx.textAlign = "center";
      ctx.font = `bold ${Math.round(h * 0.14)}px Georgia`;
      ctx.fillText("The Rattler", w / 2, h * 0.14);
      ctx.fillRect(w * 0.06, h * 0.18, w * 0.88, 2);
      ctx.font = `bold ${Math.round(h * 0.06)}px Georgia`;
      ctx.fillText("BONE-IDLE LOUNGERS DECRIED", w / 2, h * 0.26);
      for (let col = 0; col < 3; col += 1) {
        const x0 = w * (0.06 + col * 0.31);
        lines(14, x0, x0 + w * 0.26, h * 0.34, h * 0.045, "#3a3028");
      }
      ctx.fillStyle = "#3a3028";
      ctx.fillRect(w * 0.37, h * 0.55, w * 0.26, h * 0.22);
      break;
    }
    case "chalkboard": {
      fill("#1c241c");
      ctx.fillStyle = "#cfc4a6";
      ctx.textAlign = "left";
      ctx.font = `${Math.round(h * 0.28)}px Georgia`;
      ctx.fillText("A  B  C", w * 0.08, h * 0.4);
      ctx.font = `${Math.round(h * 0.2)}px Georgia`;
      ctx.fillText("2 + 2 = 4", w * 0.1, h * 0.78);
      break;
    }
    case "sunCloth": {
      fill("#a3261d");
      ell(w / 2, h / 2, w * 0.2, w * 0.2, "#efe0b0");
      ctx.strokeStyle = "#efe0b0";
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(w / 2 + Math.cos(a) * w * 0.24, h / 2 + Math.sin(a) * w * 0.24);
        ctx.lineTo(w / 2 + Math.cos(a) * w * 0.32, h / 2 + Math.sin(a) * w * 0.32);
        ctx.stroke();
      }
      for (let i = 0; i < 8; i += 1) {
        ell(w * (0.08 + i * 0.12), h * 0.12, 3, 3, "#efe0b0");
        ell(w * (0.08 + i * 0.12), h * 0.88, 3, 3, "#efe0b0");
      }
      break;
    }
    case "keys": {
      fill("#4a3826");
      for (let i = 0; i < 4; i += 1) {
        const x = w * (0.16 + i * 0.22);
        ctx.fillStyle = "#e6dcc4";
        ctx.font = `bold ${Math.round(h * 0.16)}px Georgia`;
        ctx.textAlign = "center";
        ctx.fillText(String(i + 1), x, h * 0.28);
        ell(x, h * 0.55, 4, 4, "#b08d3f");
        ctx.fillStyle = "#b08d3f";
        ctx.fillRect(x - 1.5, h * 0.55, 3, h * 0.3);
        ctx.fillRect(x, h * 0.78, 5, 3);
      }
      break;
    }
    case "galley": {
      fill("#ddd2b0");
      lines(Math.floor(h / 6), w * 0.1, w * 0.9, 6, 6, "#7a6a52");
      break;
    }
    default:
      fill("#8a7a52");
  }
  return clampTex(c);
}

export type ShelfKind = "jars" | "cans" | "bottles" | "books" | "plates" | "curios" | "vials";

/** Rows of goods on wooden shelves, for shop and study walls. */
export function shelfTex(kind: ShelfKind, rows = 3, w = 512, h = 256): THREE.Texture {
  const [c, ctx] = canvas(w, h);
  const r = rng(kind.length * 977 + rows);
  ctx.fillStyle = kind === "cans" ? "#2f5c58" : "#2e2118";
  ctx.fillRect(0, 0, w, h);
  const rowH = h / rows;
  for (let row = 0; row < rows; row += 1) {
    const shelfY = (row + 1) * rowH - 4;
    // items
    let x = 6;
    while (x < w - 8) {
      const iw = kind === "curios" ? 18 + r() * 10 : kind === "plates" ? 34 : kind === "books" ? 8 + r() * 7 : 14 + r() * 9;
      const ih = kind === "books" ? rowH * (0.55 + r() * 0.3) : kind === "curios" ? rowH * (0.5 + r() * 0.25) : rowH * (0.45 + r() * 0.3);
      const y0 = shelfY - ih;
      if (kind === "jars" || kind === "vials") {
        ctx.fillStyle = kind === "jars" ? "#e8e2d4" : "#6a4a2a";
        ctx.fillRect(x, y0, iw, ih);
        ctx.fillStyle = kind === "jars" ? "#c9bd9f" : "#3a2a1e";
        ctx.fillRect(x + 2, y0 - 3, iw - 4, 4);
        ctx.fillStyle = "#3a2a1e";
        ctx.fillRect(x + 2, y0 + ih * 0.45, iw - 4, ih * 0.22);
      } else if (kind === "cans") {
        ctx.fillStyle = ["#c9a24a", "#b0552e", "#d9d0c0", "#6f8f3a", "#a3261d"][Math.floor(r() * 5)];
        ctx.fillRect(x, y0, iw, ih);
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillRect(x + 2, y0 + ih * 0.3, iw - 4, ih * 0.25);
      } else if (kind === "bottles") {
        ctx.fillStyle = ["#2f4a2a", "#5a3a22", "#8a6a3a", "#3a3a4a"][Math.floor(r() * 4)];
        ctx.fillRect(x + iw * 0.3, y0 - ih * 0.25, iw * 0.4, ih * 0.3);
        ctx.fillRect(x, y0, iw, ih);
        ctx.fillStyle = "rgba(255,240,200,0.25)";
        ctx.fillRect(x + 2, y0 + 2, 2, ih - 4);
      } else if (kind === "books") {
        ctx.fillStyle = ["#6a2a22", "#2a3a5a", "#4a5a2a", "#7a5a2a", "#3a2a1e", "#8a7a52"][Math.floor(r() * 6)];
        ctx.fillRect(x, y0, iw, ih);
        ctx.fillStyle = "rgba(220,190,120,0.7)";
        ctx.fillRect(x + 1, y0 + 4, iw - 2, 1);
        ctx.fillRect(x + 1, y0 + ih - 6, iw - 2, 1);
      } else if (kind === "plates") {
        ctx.fillStyle = "#eee8dc";
        ctx.beginPath();
        ctx.arc(x + iw / 2, shelfY - iw / 2, iw / 2 - 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#4a6a8a";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x + iw / 2, shelfY - iw / 2, iw / 2 - 5, 0, Math.PI * 2);
        ctx.stroke();
      } else if (r() < 0.25) {
        // curios: the odd dark bottle among the jars
        ctx.fillStyle = ["#2a3a2a", "#3a2a3a", "#4a3020"][Math.floor(r() * 3)];
        ctx.fillRect(x + iw * 0.3, y0 - ih * 0.2, iw * 0.4, ih * 0.25);
        ctx.fillRect(x + iw * 0.15, y0, iw * 0.7, ih);
      } else {
        // curios: white porcelain jars banded in blue under dark lids
        ctx.fillStyle = "#e8e4dc";
        ctx.beginPath();
        ctx.ellipse(x + iw / 2, shelfY - ih / 2, iw / 2, ih / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#3a5a9a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x + iw / 2, shelfY - ih / 2, iw / 2 - 3, ih / 2 - 3, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#3a5a9a";
        ctx.fillRect(x + iw * 0.2, shelfY - ih * 0.55, iw * 0.6, 3);
        ctx.fillStyle = "#2a2018";
        ctx.fillRect(x + iw * 0.3, shelfY - ih - 3, iw * 0.4, 5);
      }
      x += iw + 3 + r() * 4;
    }
    // shelf board
    ctx.fillStyle = kind === "cans" ? "#1f3e3a" : "#5a3a22";
    ctx.fillRect(0, shelfY, w, 4);
  }
  noise(ctx, w, h, 5, 120, 2, 0.05);
  return clampTex(c);
}

/** Headstone lettering: white on slate, dark on granite, burnt on wood. */
export function epitaphTex(lines: string[], style: "slate" | "granite" | "wood"): THREE.Texture {
  const [c, ctx] = canvas(96, 128);
  ctx.fillStyle = style === "slate" ? "#2e2d2b" : style === "granite" ? "#9a9990" : "#6b5236";
  ctx.fillRect(0, 0, 96, 128);
  noise(ctx, 96, 128, lines.length * 7 + 3, 140, 2, style === "granite" ? 0.18 : 0.08);
  ctx.fillStyle = style === "slate" ? "#e6e0d0" : style === "granite" ? "#2e2d2b" : "#2a1a10";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lineH = Math.min(15, 96 / Math.max(1, lines.length));
  const top = 64 - (lineH * lines.length) / 2 + 8;
  for (let i = 0; i < lines.length; i += 1) {
    const size = Math.min(12, Math.round(150 / Math.max(6, lines[i].length)));
    ctx.font = `${size}px Georgia`;
    ctx.fillText(lines[i], 48, top + i * lineH, 84);
  }
  return clampTex(c, 4);
}

/** Red Chinese fretwork on a transparent ground for the screens. */
export function latticeTex(): THREE.Texture {
  const [c, ctx] = canvas(128, 256);
  ctx.clearRect(0, 0, 128, 256);
  ctx.strokeStyle = "#a3261d";
  ctx.lineWidth = 7;
  ctx.strokeRect(3.5, 3.5, 121, 249);
  ctx.lineWidth = 5;
  // meander cells
  for (let y = 12; y < 244; y += 58) {
    ctx.strokeRect(14, y, 100, 46);
    ctx.beginPath();
    ctx.moveTo(14, y + 23);
    ctx.lineTo(44, y + 23);
    ctx.moveTo(114, y + 23);
    ctx.lineTo(84, y + 23);
    ctx.moveTo(64, y);
    ctx.lineTo(64, y + 14);
    ctx.moveTo(64, y + 46);
    ctx.lineTo(64, y + 32);
    ctx.stroke();
    ctx.strokeRect(50, y + 14, 28, 18);
  }
  const tex = clampTex(c);
  tex.premultiplyAlpha = false;
  return tex;
}

/** A cork board crowded with small WANTED bills. */
export function wantedBoardTex(): THREE.Texture {
  const [c, ctx] = canvas(256, 160);
  ctx.fillStyle = "#8a6f52";
  ctx.fillRect(0, 0, 256, 160);
  const r = rng(77);
  for (let i = 0; i < 6; i += 1) {
    const x = 10 + (i % 3) * 82 + r() * 6;
    const y = 8 + Math.floor(i / 3) * 76 + r() * 6;
    ctx.save();
    ctx.translate(x + 32, y + 34);
    ctx.rotate((r() - 0.5) * 0.14);
    ctx.fillStyle = i % 2 ? "#ddd2b0" : "#cfc4a6";
    ctx.fillRect(-32, -34, 64, 68);
    ctx.fillStyle = "#231a10";
    ctx.textAlign = "center";
    ctx.font = "bold 11px Georgia";
    ctx.fillText("WANTED", 0, -20);
    ctx.fillStyle = "#3a2d20";
    ctx.beginPath();
    ctx.arc(0, 2, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-13, -10, 26, 6);
    ctx.fillStyle = "#231a10";
    ctx.font = "7px Georgia";
    ctx.fillText(["$500 REWARD", "DEAD OR ALIVE", "$300 REWARD"][i % 3], 0, 24);
    ctx.restore();
  }
  return clampTex(c);
}

/** Multi-pane window: dark panes day-side; a lit variant for night. */
export function windowTex(lit: boolean, cols = 2, rows = 3): THREE.Texture {
  const [c, ctx] = canvas(96, 128);
  ctx.fillStyle = "#241f18";
  ctx.fillRect(0, 0, 96, 128);
  const pw = 96 / cols;
  const ph = 128 / rows;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const g = ctx.createLinearGradient(0, y * ph, 0, (y + 1) * ph);
      if (lit) {
        g.addColorStop(0, "#ffcf82");
        g.addColorStop(1, "#c67c2e");
      } else {
        g.addColorStop(0, "#3a4350");
        g.addColorStop(1, "#20242c");
      }
      ctx.fillStyle = g;
      ctx.fillRect(x * pw + 3, y * ph + 3, pw - 6, ph - 6);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** A schoolhouse clock face: cream dial, twelve ticks, hands at ten past ten. */
export function clockFaceTex(): THREE.Texture {
  const [c, ctx] = canvas(64, 64);
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = "#efe8d8";
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2a2018";
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24);
    ctx.lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28);
    ctx.stroke();
  }
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(32, 32);
  ctx.lineTo(44, 20);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(32, 32);
  ctx.lineTo(24, 16);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A dark egg rack: a board drilled with three rows of four holes. */
export function eggRackTex(): THREE.Texture {
  const [c, ctx] = canvas(64, 64);
  ctx.fillStyle = "#2a2018";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#6a5a48";
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      ctx.beginPath();
      ctx.arc(10 + col * 14.7, 12 + row * 20, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
