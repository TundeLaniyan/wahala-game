/**
 * Lagos Lagoon Jetty playfield floor (presentation only): a loading jetty deck of weathered timber
 * planks running east-west over joists, nailed and patched with steel plates, between concrete
 * quay copings on the two waterline rows (row 0 north, row 10 south) with a worn yellow edge line,
 * scuppers and green slime where the lagoon washes over. Everything is damp; standing water is
 * glossy in the roughness map, and the permanently slippery tiles (the arena's floor traps) carry
 * a dark film of algae and fish slime. Fish scales, rope fibres and rust stains from the drums.
 */
import { artRng } from '../textures';
import { LAGOON_JETTY } from '../../sim/arenas/lagoonJetty';
import { T, crack, noiseFill, seams, stain } from './floorKit';
import type { Ctx } from './floorKit';

/** Tiles of a trap grid marked with `c`. */
function marked(rows: string[] | undefined, c: string): [number, number][] {
  const out: [number, number][] = [];
  (rows ?? []).forEach((row, y) => [...row].forEach((ch, x) => ch === c && out.push([x, y])));
  return out;
}

function coping(g: Ctx, rg: Ctx, r: () => number, w: number, y0: number, outerTop: boolean): void {
  // wet concrete quay coping, darker towards the water
  g.fillStyle = 'rgb(112,112,106)';
  g.fillRect(0, y0, w, T);
  for (let i = 0; i < 260; i++) {
    const v = 80 + r() * 60;
    g.fillStyle = `rgba(${v},${v + 2},${v - 2},0.35)`;
    g.fillRect(r() * w, y0 + r() * T, 4 + r() * 14, 3 + r() * 8);
  }
  const edge = outerTop ? y0 : y0 + T;
  const grad = g.createLinearGradient(0, edge, 0, outerTop ? y0 + T : y0);
  grad.addColorStop(0, 'rgba(36,52,34,0.75)');
  grad.addColorStop(0.35, 'rgba(46,58,40,0.3)');
  grad.addColorStop(1, 'rgba(46,58,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, y0, w, T);
  // the worn yellow edge line and the joints of the precast coping units
  g.fillStyle = 'rgba(176,150,60,0.55)';
  g.fillRect(0, outerTop ? y0 + 10 : y0 + T - 22, w, 12);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = 'rgba(70,70,64,0.8)';
    g.fillRect(r() * w, outerTop ? y0 + 10 : y0 + T - 22, 4 + r() * 18, 12);
  }
  g.strokeStyle = 'rgba(26,28,24,0.7)';
  g.lineWidth = 3;
  for (let x = T * 1.5; x < w; x += T * 1.5) {
    g.beginPath();
    g.moveTo(x, y0);
    g.lineTo(x, y0 + T);
    g.stroke();
  }
  // scuppers (drain slots through the coping)
  for (let x = T; x < w; x += T * 3) {
    g.fillStyle = 'rgb(16,18,16)';
    g.fillRect(x - 12, outerTop ? y0 : y0 + T - 8, 24, 8);
  }
  for (let i = 0; i < 6; i++) crack(g, r, r() * w, y0 + r() * T, 5, 'rgba(26,26,22,0.6)', 1.6);
  // wet sheen
  rg.fillStyle = 'rgb(120,120,120)';
  rg.fillRect(0, y0, w, T);
  for (let i = 0; i < 18; i++) stain(rg, r() * w, y0 + r() * T, 30 + r() * 60, 'rgba(30,30,30,0.7)');
}

export function drawLagoonFloor(g: Ctx, rg: Ctx, cols: number, rows: number): void {
  const w = cols * T;
  const h = rows * T;
  const r = artRng(6607);
  noiseFill(g, w, h, [104, 92, 76], 16, 61);
  noiseFill(rg, w, h, [176, 176, 176], 26, 62);
  // planks: 0.25 m boards along x with staggered butt joints, each its own weathered tone
  const PW = T / 4;
  for (let py = T; py < h - T; py += PW) {
    let x = -r() * T * 3;
    while (x < w) {
      const len = T * (2 + Math.floor(r() * 4));
      const v = r();
      const base =
        v < 0.15 ? [74, 64, 52] : v < 0.3 ? [128, 116, 98] : [100 + r() * 16, 88 + r() * 14, 72 + r() * 10];
      g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      g.fillRect(x + 1, py + 1, len - 2, PW - 2);
      // grain along the board
      for (let k = 0; k < 7; k++) {
        g.fillStyle = `rgba(40,32,24,${0.1 + r() * 0.15})`;
        g.fillRect(x + r() * len * 0.3, py + 2 + r() * (PW - 4), len * (0.3 + r() * 0.6), 1);
      }
      // dark butt joint
      g.fillStyle = 'rgba(16,14,12,0.85)';
      g.fillRect(x + len - 2, py, 3, PW);
      x += len;
    }
    // the gap between boards: dark, wet
    g.fillStyle = 'rgba(14,14,12,0.9)';
    g.fillRect(0, py, w, 2);
    rg.fillStyle = 'rgba(40,40,40,0.8)';
    rg.fillRect(0, py, w, 2);
  }
  // nail lines over the joists every half tile, rust bleeding from the heads
  for (let x = T / 4; x < w; x += T / 2) {
    for (let py = T; py < h - T; py += PW) {
      for (const dy of [7, PW - 9]) {
        g.fillStyle = 'rgba(38,30,24,0.9)';
        g.fillRect(x - 1, py + dy, 3, 3);
        if (r() < 0.25) stain(g, x, py + dy + 3, 6, 'rgba(110,56,24,0.4)');
      }
    }
  }
  // steel repair plates bolted over rotten boards
  for (let i = 0; i < 7; i++) {
    const x = r() * (w - 140);
    const y = T + r() * (h - 2 * T - 90);
    const pw = 70 + r() * 70;
    const ph = 40 + r() * 40;
    g.fillStyle = 'rgb(74,70,66)';
    g.fillRect(x, y, pw, ph);
    g.fillStyle = 'rgba(120,64,32,0.45)';
    g.fillRect(x + r() * pw * 0.5, y + r() * ph * 0.5, pw * 0.5, ph * 0.5);
    g.fillStyle = 'rgb(30,28,26)';
    for (const [bx, by] of [
      [4, 4],
      [pw - 8, 4],
      [4, ph - 8],
      [pw - 8, ph - 8],
    ] as const)
      g.fillRect(x + bx, y + by, 4, 4);
    g.strokeStyle = 'rgba(20,18,16,0.8)';
    g.lineWidth = 2;
    g.strokeRect(x, y, pw, ph);
    rg.fillStyle = 'rgb(90,90,90)';
    rg.fillRect(x, y, pw, ph);
  }
  // the quay copings on the two waterline rows
  coping(g, rg, r, w, 0, true);
  coping(g, rg, r, w, h - T, false);
  // damp: dark patches drying unevenly in the sun, glossy where water stands
  for (let i = 0; i < 34; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 40 + r() * 110;
    stain(g, x, y, rad, `rgba(28,30,26,${0.18 + r() * 0.2})`);
    stain(rg, x, y, rad * 0.9, 'rgba(36,36,36,0.6)');
  }
  // fish slime, scales and blood by the west (fish market) side, rust rings from the east drums
  for (let i = 0; i < 260; i++) {
    const x = r() * w * 0.45;
    const y = T + r() * (h - 2 * T);
    g.fillStyle = `rgba(200,206,210,${0.25 + r() * 0.4})`;
    g.fillRect(x, y, 2 + r() * 3, 2);
  }
  for (let i = 0; i < 9; i++)
    stain(g, r() * w * 0.4, T + r() * (h - 2 * T), 14 + r() * 30, 'rgba(90,30,24,0.28)');
  for (let i = 0; i < 6; i++) {
    const x = w * 0.6 + r() * w * 0.38;
    const y = T + r() * (h - 2 * T);
    g.strokeStyle = 'rgba(110,52,24,0.45)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(x, y, 26 + r() * 8, 0, Math.PI * 2);
    g.stroke();
  }
  // rope fibres and loose debris
  for (let i = 0; i < 160; i++) {
    g.strokeStyle = `rgba(${150 + r() * 60},${120 + r() * 40},70,0.35)`;
    g.lineWidth = 1;
    const x = r() * w;
    const y = r() * h;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      x + (r() - 0.5) * 30,
      y + (r() - 0.5) * 30,
      x + (r() - 0.5) * 40,
      y + (r() - 0.5) * 20,
    );
    g.stroke();
  }
  // the permanently slippery planks: a dark film of algae and slime, very glossy
  for (const [x, y] of marked(LAGOON_JETTY.floorTraps, '~')) {
    const cx = x * T + T / 2;
    const cy = y * T + T / 2;
    for (let k = 0; k < 4; k++)
      stain(g, cx + (r() - 0.5) * 40, cy + (r() - 0.5) * 40, T * (0.45 + r() * 0.15), 'rgba(30,46,30,0.55)');
    stain(rg, cx, cy, T * 0.62, 'rgba(10,10,10,0.95)');
  }
  // tile joints kept faint so the grid reads without fighting the planks
  seams(g, cols, rows, 'rgba(18,16,14,0.34)', 3);
  g.translate(2, 2);
  seams(g, cols, rows, 'rgba(170,160,140,0.08)', 1);
  g.setTransform(1, 0, 0, 1, 0, 0);
}
