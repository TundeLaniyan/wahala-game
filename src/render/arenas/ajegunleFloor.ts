/**
 * Ajegunle Backstreets playfield floor (presentation only): a cracked, patched concrete lane cast
 * in uneven bays, broken out to the red earth in places, with a gutter along the north wall,
 * puddles (glossy in the roughness map) with algae rims, children's chalk, sachet-water litter,
 * and the heavy cast-iron manhole covers of the arena's connected manholes (the '=' tiles of the
 * layout), each set in its own concrete collar. The hazard layer draws the numbers and glow on top.
 */
import { artRng } from '../textures';
import { AJEGUNLE_BACKSTREETS } from '../../sim/arenas/ajegunleBackstreets';
import { T, crack, noiseFill, seams, stain } from './floorKit';
import type { Ctx } from './floorKit';

/** Tiles marked '=' in an arena layout. */
export function roadTiles(layout: string[]): [number, number][] {
  const out: [number, number][] = [];
  layout.forEach((row, y) => [...row].forEach((c, x) => c === '=' && out.push([x, y])));
  return out;
}

/** A heavy cast-iron manhole cover in a square concrete collar, centred in tile (tx, ty). */
export function manhole(g: Ctx, rg: Ctx, tx: number, ty: number, seed: number, label = 'LSWC'): void {
  const r = artRng(seed);
  const cx = tx * T + T / 2;
  const cy = ty * T + T / 2;
  const R = T * 0.36;
  // rust bleeding into the concrete around it
  stain(g, cx, cy, R * 1.6, 'rgba(96,52,26,0.35)');
  // collar: a newer, paler concrete square with chipped edges
  const C = T * 0.45;
  g.fillStyle = 'rgb(150,146,138)';
  g.fillRect(cx - C, cy - C, C * 2, C * 2);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? 90 : 190},${r() < 0.5 ? 86 : 186},80,0.3)`;
    g.fillRect(cx - C + r() * C * 2, cy - C + r() * C * 2, 2 + r() * 6, 2 + r() * 6);
  }
  g.strokeStyle = 'rgba(30,28,24,0.75)';
  g.lineWidth = 3;
  g.strokeRect(cx - C, cy - C, C * 2, C * 2);
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2;
    crack(g, r, cx + Math.cos(a) * C, cy + Math.sin(a) * C, 3, 'rgba(26,24,20,0.6)', 1.5);
  }
  rg.fillStyle = 'rgb(205,205,205)';
  rg.fillRect(cx - C, cy - C, C * 2, C * 2);
  // seating ring (dark gap) and the cover
  g.fillStyle = 'rgb(18,16,14)';
  g.beginPath();
  g.arc(cx, cy, R + 4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgb(58,55,52)';
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(cx, cy, R - 4, 0, Math.PI * 2);
  g.clip();
  // raised chequer: small studs in a diamond lattice, worn bright on top
  g.translate(cx, cy);
  g.rotate(Math.PI / 4);
  for (let x = -R; x < R; x += 9) {
    for (let y = -R; y < R; y += 9) {
      g.fillStyle = 'rgb(40,38,36)';
      g.fillRect(x + 1, y + 1, 6, 6);
      g.fillStyle = `rgba(118,112,104,${0.35 + r() * 0.4})`;
      g.fillRect(x, y, 5, 5);
    }
  }
  g.restore();
  // concentric rings and radial ribs
  g.lineWidth = 3;
  for (const k of [0.94, 0.62]) {
    g.strokeStyle = 'rgba(126,120,112,0.85)';
    g.beginPath();
    g.arc(cx - 1, cy - 1, R * k, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(16,14,12,0.7)';
    g.beginPath();
    g.arc(cx + 1.5, cy + 1.5, R * k, 0, Math.PI * 2);
    g.stroke();
  }
  // centre boss with the water corporation's letters and two lifting keyholes
  g.fillStyle = 'rgb(50,47,44)';
  g.beginPath();
  g.arc(cx, cy, R * 0.42, 0, Math.PI * 2);
  g.fill();
  g.font = 'bold 13px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(150,144,134,0.85)';
  g.fillText(label, cx, cy);
  g.fillStyle = 'rgb(10,9,8)';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + s * R * 0.62, cy, 5, 2.6, 0, 0, Math.PI * 2);
    g.fill();
  }
  // rust blooms and road grime on the cover
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * R;
    stain(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 4 + r() * 10, `rgba(120,64,30,${0.25 + r() * 0.3})`);
  }
  // roughness: iron worn smooth on top, the gap rough
  rg.fillStyle = 'rgb(110,110,110)';
  rg.beginPath();
  rg.arc(cx, cy, R, 0, Math.PI * 2);
  rg.fill();
  rg.fillStyle = 'rgba(60,60,60,0.7)';
  for (let i = 0; i < 30; i++) rg.fillRect(cx - R + r() * R * 2, cy - R + r() * R * 2, 4, 4);
}

export function drawAjegunleFloor(g: Ctx, rg: Ctx, cols: number, rows: number): void {
  const w = cols * T;
  const h = rows * T;
  const r = artRng(5507);
  noiseFill(g, w, h, [150, 146, 138], 22, 31);
  noiseFill(rg, w, h, [214, 214, 214], 18, 32);
  // poured in uneven bays: each a slightly different age and tone, with a dark joint
  const xs = [0, 2.4, 5.1, 7.6, 9.9, 12.6, cols];
  const ys = [0, 2.6, 5.3, 8.1, rows];
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < ys.length; j++) {
      const x0 = xs[i]! * T;
      const y0 = ys[j]! * T;
      const v = r();
      g.fillStyle =
        v < 0.33 ? 'rgba(40,38,34,0.16)' : v < 0.66 ? 'rgba(210,204,190,0.1)' : 'rgba(110,96,80,0.12)';
      g.fillRect(x0, y0, (xs[i + 1]! - xs[i]!) * T, (ys[j + 1]! - ys[j]!) * T);
    }
  g.strokeStyle = 'rgba(24,22,20,0.55)';
  g.lineWidth = 4;
  for (const x of xs.slice(1, -1)) {
    g.beginPath();
    g.moveTo(x * T, 0);
    g.lineTo(x * T + (r() - 0.5) * 20, h);
    g.stroke();
  }
  for (const y of ys.slice(1, -1)) {
    g.beginPath();
    g.moveTo(0, y * T);
    g.lineTo(w, y * T + (r() - 0.5) * 20);
    g.stroke();
  }
  // broken out to the red earth at a few bay corners, gravel in the holes
  for (let i = 0; i < 9; i++) {
    const x = xs[1 + Math.floor(r() * (xs.length - 2))]! * T + (r() - 0.5) * 60;
    const y = ys[1 + Math.floor(r() * (ys.length - 2))]! * T + (r() - 0.5) * 60;
    g.fillStyle = 'rgba(112,72,48,0.9)';
    g.beginPath();
    const n = 7;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rad = 18 + r() * 34;
      g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.8);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(30,26,22,0.6)';
    g.lineWidth = 2;
    g.stroke();
    for (let k = 0; k < 26; k++) {
      const v = 70 + r() * 70;
      g.fillStyle = `rgba(${v},${v - 6},${v - 12},0.8)`;
      g.fillRect(x + (r() - 0.5) * 50, y + (r() - 0.5) * 40, 3 + r() * 4, 3 + r() * 3);
    }
  }
  // patched with darker cement and a strip of old tar
  for (let i = 0; i < 10; i++) {
    const x = r() * w;
    const y = r() * h;
    const pw = 60 + r() * 160;
    const ph = 50 + r() * 110;
    g.fillStyle = r() < 0.3 ? 'rgba(38,36,34,0.55)' : 'rgba(118,116,110,0.35)';
    g.fillRect(x, y, pw, ph);
    g.strokeStyle = 'rgba(24,22,20,0.4)';
    g.lineWidth = 2;
    g.strokeRect(x, y, pw, ph);
  }
  for (let i = 0; i < cols * rows * 0.45; i++)
    crack(g, r, r() * w, r() * h, 4 + Math.floor(r() * 9), 'rgba(22,20,18,0.7)', 2);
  // the covered gutter along the north wall: slab covers over a dark channel, a grating here and there
  g.fillStyle = 'rgba(24,24,20,0.85)';
  g.fillRect(0, 0, w, 16);
  for (let x = 0; x < w; x += 64) {
    const grate = r() < 0.25;
    g.fillStyle = grate ? 'rgb(48,46,42)' : `rgb(${120 + r() * 20},${116 + r() * 20},110)`;
    g.fillRect(x + 2, 1, 60, 18);
    if (grate) {
      g.fillStyle = 'rgb(14,14,12)';
      for (let k = 6; k < 58; k += 8) g.fillRect(x + 2 + k, 3, 4, 14);
    }
    g.strokeStyle = 'rgba(20,18,16,0.7)';
    g.lineWidth = 2;
    g.strokeRect(x + 2, 1, 60, 18);
  }
  // general grime, rust drips and engine oil from okadas
  for (let i = 0; i < 40; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 20 + r() * 70;
    stain(g, x, y, rad, `rgba(${r() < 0.5 ? '30,26,22' : '70,52,34'},${0.15 + r() * 0.2})`);
  }
  // puddles from the morning's washing and the blocked gutters: dark and glossy, algae at the rim
  for (let i = 0; i < 13; i++) {
    const x = r() * w;
    const y = 30 + r() * (h - 60);
    const rx = 30 + r() * 80;
    const ry = 16 + r() * 36;
    const rot = r() * 3;
    g.fillStyle = 'rgba(56,66,42,0.35)';
    g.beginPath();
    g.ellipse(x, y, rx * 1.25, ry * 1.3, rot, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(30,32,30,0.62)';
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    g.fill();
    rg.fillStyle = 'rgba(14,14,14,0.95)';
    rg.beginPath();
    rg.ellipse(x, y, rx * 0.95, ry * 0.95, rot, 0, Math.PI * 2);
    rg.fill();
  }
  // children's chalk: a hopscotch court and a scrawled goal
  g.strokeStyle = 'rgba(214,210,196,0.32)';
  g.lineWidth = 4;
  const hx = 4 * T + 20;
  const hy = 4.2 * T;
  for (let k = 0; k < 4; k++) g.strokeRect(hx + k * 52, hy, 52, 52);
  g.strokeRect(hx + 52, hy - 52, 52, 52);
  g.strokeRect(hx + 156, hy - 52, 52, 52);
  g.font = 'bold 30px Georgia, serif';
  g.fillStyle = 'rgba(214,210,196,0.3)';
  g.fillText('1', hx + 18, hy + 36);
  g.fillText('2', hx + 70, hy + 36);
  g.strokeRect(10 * T + 30, 7 * T + 40, 150, 70);
  // litter: pure-water sachets, bottle caps, black nylon bags
  for (let i = 0; i < 300; i++) {
    const k = r();
    g.fillStyle =
      k < 0.45
        ? `rgba(220,226,230,${0.3 + r() * 0.3})`
        : k < 0.6
          ? `rgba(60,110,170,${0.25 + r() * 0.3})`
          : k < 0.8
            ? `rgba(20,20,20,${0.3 + r() * 0.3})`
            : `rgba(150,70,40,${0.25 + r() * 0.25})`;
    g.save();
    g.translate(r() * w, r() * h);
    g.rotate(r() * 3);
    g.fillRect(-4, -3, 5 + r() * 9, 3 + r() * 6);
    g.restore();
  }
  // the connected manholes
  roadTiles(AJEGUNLE_BACKSTREETS.layout).forEach(([x, y], n) => manhole(g, rg, x, y, 900 + n));
  // faint worn joints so the grid stays readable
  seams(g, cols, rows, 'rgba(22,20,18,0.36)', 3);
  g.translate(2, 2);
  seams(g, cols, rows, 'rgba(190,184,172,0.1)', 1);
  g.setTransform(1, 0, 0, 1, 0, 0);
}
