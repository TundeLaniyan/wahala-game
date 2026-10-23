/**
 * Canvas helpers for painting the procedural playfield floors (presentation only). Every arena's
 * floor drawer (floors.ts and the per-arena modules) builds on these.
 */
import type { CanvasTexture } from 'three';
import { artRng } from '../textures';

export const T = 128; // pixels per tile

export interface FloorMaps {
  map: CanvasTexture;
  roughnessMap: CanvasTexture;
}

/** Paints one arena floor: albedo into `g`, roughness into `rg`, at `T` pixels per tile. */
export type FloorDrawer = (g: Ctx, rg: Ctx, cols: number, rows: number) => void;

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Per-pixel value noise over a base colour (fast: one pass over ImageData). */
export function noiseFill(
  g: Ctx,
  w: number,
  h: number,
  base: [number, number, number],
  amp: number,
  seed: number,
): void {
  const img = g.createImageData(w, h);
  const d = img.data;
  const r = artRng(seed);
  // coarse lattice for blotches
  const cw = Math.ceil(w / 24) + 2;
  const ch = Math.ceil(h / 24) + 2;
  const lattice = new Float32Array(cw * ch).map(() => r());
  for (let y = 0; y < h; y++) {
    const ly = y / 24;
    const y0 = Math.floor(ly);
    const fy = ly - y0;
    for (let x = 0; x < w; x++) {
      const lx = x / 24;
      const x0 = Math.floor(lx);
      const fx = lx - x0;
      const a = lattice[y0 * cw + x0]!;
      const b = lattice[y0 * cw + x0 + 1]!;
      const c = lattice[(y0 + 1) * cw + x0]!;
      const e = lattice[(y0 + 1) * cw + x0 + 1]!;
      const blotch = a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy;
      const grain = r();
      const v = (blotch - 0.5) * amp * 1.4 + (grain - 0.5) * amp;
      const i = (y * w + x) * 4;
      d[i] = base[0] + v;
      d[i + 1] = base[1] + v;
      d[i + 2] = base[2] + v * 0.95;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

export function stain(g: Ctx, x: number, y: number, rad: number, rgba: string): void {
  const grad = g.createRadialGradient(x, y, rad * 0.1, x, y, rad);
  grad.addColorStop(0, rgba);
  grad.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
  g.fillStyle = grad;
  g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}

export function crack(
  g: Ctx,
  r: () => number,
  x: number,
  y: number,
  len: number,
  color: string,
  width: number,
): void {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(x, y);
  let a = r() * Math.PI * 2;
  for (let k = 0; k < len; k++) {
    a += (r() - 0.5) * 0.9;
    x += Math.cos(a) * 9;
    y += Math.sin(a) * 9;
    g.lineTo(x, y);
    if (r() < 0.12) crack(g, r, x, y, Math.floor(len / 3), color, width * 0.6);
  }
  g.stroke();
}

/** Faint worn tile seams (grid readability), drawn on both maps. */
export function seams(g: Ctx, cols: number, rows: number, color: string, width = 2): void {
  g.strokeStyle = color;
  g.lineWidth = width;
  for (let x = 1; x < cols; x++) {
    g.beginPath();
    g.moveTo(x * T, 0);
    g.lineTo(x * T, rows * T);
    g.stroke();
  }
  for (let y = 1; y < rows; y++) {
    g.beginPath();
    g.moveTo(0, y * T);
    g.lineTo(cols * T, y * T);
    g.stroke();
  }
}

export function tyreTrack(g: Ctx, r: () => number, w: number, h: number, color: string): void {
  const y = r() * h;
  g.strokeStyle = color;
  g.lineWidth = 18 + r() * 10;
  g.beginPath();
  g.moveTo(-20, y);
  g.bezierCurveTo(
    w * 0.3,
    y + (r() - 0.5) * 300,
    w * 0.7,
    y + (r() - 0.5) * 300,
    w + 20,
    y + (r() - 0.5) * 200,
  );
  g.stroke();
}

