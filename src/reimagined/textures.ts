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
    for (let i = 0; i < patchCount; i += 1) {
      ctx.fillStyle = shade(patch, 0.9 + r() * 0.2);
      ctx.globalAlpha = 0.55;
      const w = 20 + r() * 46;
      const h = 12 + r() * 30;
      ctx.beginPath();
      ctx.ellipse(r() * 256, r() * 256, w / 2, h / 2, r(), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
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
  ctx.fillStyle = opts.bg ?? "#4f382a";
  ctx.fillRect(0, 0, cw, ch);
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
  const pad = ch * 0.14;
  const lineH = (ch - pad * 2) / lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i];
    if (!text) {
      continue;
    }
    let size = Math.min(lineH * 0.82, (cw * 1.62) / Math.max(4, text.length));
    size = Math.max(9, size);
    ctx.font = opts.font ? `${size}px ${opts.font}` : `bold ${size}px Georgia, serif`;
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
  | "news";

/** Small aged handbills for the poster walls. */
export function posterTex(kind: PosterKind): THREE.Texture {
  const [c, ctx] = canvas(96, 128);
  const aged = kind === "bishop" ? "#241f19" : kind === "circus" ? "#ccb98a" : "#d8cba6";
  ctx.fillStyle = aged;
  ctx.fillRect(0, 0, 96, 128);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.strokeRect(2, 2, 92, 124);
  const ink = kind === "bishop" ? "#d8cba6" : "#231a10";
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
            ? "The Bishop"
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
    ctx.font = "bold 13px Georgia";
    ctx.fillText("is Coming!", 48, 40);
    ctx.font = "8px Georgia";
    ctx.fillText("prepare ye", 48, 100);
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
    ctx.fillText(kind === "repent" ? "the end is nigh" : "cures all ills", 48, 40);
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
export function sunFaceTex(): THREE.Texture {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = "#b7ad93";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#cfc4a6";
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#6f654c";
  ctx.lineWidth = 3;
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a) * 42, 64 + Math.sin(a) * 42);
    ctx.lineTo(64 + Math.cos(a) * (i % 2 === 0 ? 60 : 52), 64 + Math.sin(a) * (i % 2 === 0 ? 60 : 52));
    ctx.stroke();
  }
  ctx.fillStyle = "#55492f";
  ctx.beginPath();
  ctx.arc(50, 56, 5, 0, Math.PI * 2);
  ctx.arc(78, 56, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.lineWidth = 4;
  ctx.arc(64, 68, 18, 0.25, Math.PI - 0.25);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
