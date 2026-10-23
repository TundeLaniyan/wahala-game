/**
 * The playfield floor of each arena, drawn procedurally (albedo + roughness): worn bus-park tarmac
 * with faded bay paint, oil stains and tyre marks; broken market pavers stained with red laterite
 * and palm oil; wet, cracked and milled roadworks asphalt with cement patches and survey paint.
 * Every tile keeps a faint worn seam so the grid stays readable. Presentation only.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { artRng } from '../textures';

const T = 128; // pixels per tile

export interface FloorMaps {
  map: CanvasTexture;
  roughnessMap: CanvasTexture;
}

type Ctx = CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Per-pixel value noise over a base colour (fast: one pass over ImageData). */
function noiseFill(
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

function stain(g: Ctx, x: number, y: number, rad: number, rgba: string): void {
  const grad = g.createRadialGradient(x, y, rad * 0.1, x, y, rad);
  grad.addColorStop(0, rgba);
  grad.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
  g.fillStyle = grad;
  g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}

function crack(
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
function seams(g: Ctx, cols: number, rows: number, color: string, width = 2): void {
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

function tyreTrack(g: Ctx, r: () => number, w: number, h: number, color: string): void {
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

function busPark(g: Ctx, rg: Ctx, cols: number, rows: number): void {
  const w = cols * T;
  const h = rows * T;
  const r = artRng(1301);
  noiseFill(g, w, h, [74, 71, 66], 26, 11);
  noiseFill(rg, w, h, [205, 205, 205], 30, 12);
  // patched asphalt: darker and lighter rectangles
  for (let i = 0; i < 14; i++) {
    const x = r() * w;
    const y = r() * h;
    const pw = 120 + r() * 320;
    const ph = 90 + r() * 220;
    g.fillStyle = r() < 0.5 ? 'rgba(30,28,26,0.45)' : 'rgba(120,114,104,0.25)';
    g.fillRect(x, y, pw, ph);
    g.strokeStyle = 'rgba(20,18,16,0.5)';
    g.lineWidth = 3;
    g.strokeRect(x, y, pw, ph);
  }
  // faded yellow bay lines, worn away in places
  g.setLineDash([60, 14, 22, 30]);
  for (let x = 2; x < cols; x += 3) {
    g.strokeStyle = `rgba(168,138,52,${0.35 + r() * 0.15})`;
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(x * T + T / 2, T * 0.2);
    g.lineTo(x * T + T / 2, h - T * 0.2);
    g.stroke();
  }
  g.setLineDash([]);
  // engine-oil stains, a few with tyre smears through them; dark in albedo, glossy in roughness
  for (let i = 0; i < cols * rows * 0.5; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 20 + r() * 70;
    stain(g, x, y, rad, `rgba(14,12,11,${0.35 + r() * 0.35})`);
    stain(rg, x, y, rad * 0.8, `rgba(40,40,40,${0.5 + r() * 0.3})`);
  }
  for (let i = 0; i < 9; i++) tyreTrack(g, r, w, h, 'rgba(24,22,20,0.28)');
  for (let i = 0; i < cols * rows * 0.35; i++)
    crack(g, r, r() * w, r() * h, 4 + Math.floor(r() * 8), 'rgba(18,16,14,0.7)', 2.2);
  // litter: sachet-water bags, bottle caps, paper
  for (let i = 0; i < 260; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(190,186,170,${0.25 + r() * 0.3})` : `rgba(120,60,40,${0.2 + r() * 0.3})`;
    g.fillRect(r() * w, r() * h, 3 + r() * 9, 2 + r() * 6);
  }
  seams(g, cols, rows, 'rgba(22,20,18,0.42)', 3);
}

function market(g: Ctx, rg: Ctx, cols: number, rows: number): void {
  const w = cols * T;
  const h = rows * T;
  const r = artRng(2207);
  // bedding: compacted red laterite (shows wherever pavers are broken or missing)
  noiseFill(g, w, h, [116, 70, 46], 22, 21);
  noiseFill(rg, w, h, [228, 228, 228], 18, 22);
  // interlocking concrete pavers in running bond, each a slightly different worn grey-beige;
  // clusters are broken out or missing, others cracked or sunk and darker with grime
  const pw = T / 4;
  const ph = T / 8;
  const nx = Math.ceil(w / pw) + 2;
  const ny = Math.ceil(h / ph);
  const holes = new Uint8Array(nx * ny);
  for (let i = 0; i < cols * rows * 0.22; i++) {
    // a broken patch: a small random walk of missing pavers
    let cx = Math.floor(r() * nx);
    let cy = Math.floor(r() * ny);
    const n = 2 + Math.floor(r() * 6);
    for (let k = 0; k < n; k++) {
      holes[cy * nx + cx] = r() < 0.7 ? 1 : 2; // 1 missing, 2 broken in place
      cx = Math.min(nx - 1, Math.max(0, cx + Math.floor(r() * 3) - 1));
      cy = Math.min(ny - 1, Math.max(0, cy + Math.floor(r() * 3) - 1));
    }
  }
  for (let iy = 0; iy < ny; iy++) {
    const y = iy * ph;
    const off = iy % 2 ? pw / 2 : 0;
    for (let ix = 0; ix < nx; ix++) {
      const x = ix * pw - off;
      const hole = holes[iy * nx + ix]!;
      if (hole === 1) {
        // missing: the laterite bedding with a few loose stones
        g.fillStyle = `rgba(92,48,28,${0.45 + r() * 0.25})`;
        g.fillRect(x + 1, y + 1, pw - 2, ph - 2);
        for (let k = 0; k < 3; k++) {
          const v = 90 + r() * 50;
          g.fillStyle = `rgba(${v},${v * 0.9},${v * 0.8},0.8)`;
          g.fillRect(x + r() * pw, y + r() * ph, 2 + r() * 3, 2 + r() * 2);
        }
        rg.fillStyle = 'rgba(250,250,250,0.6)';
        rg.fillRect(x, y, pw, ph);
        continue;
      }
      const v = (r() - 0.5) * 30;
      const warm = r() * 14; // some pavers have taken more red dust than others
      const sunk = r() < 0.08 ? -22 : 0;
      g.fillStyle = `rgba(${136 + v + warm + sunk},${122 + v + sunk},${106 + v - warm * 0.4 + sunk},0.86)`;
      g.fillRect(x + 1.5, y + 1.5, pw - 3, ph - 3);
      // worn, slightly lighter top face and a dark sand-filled joint
      g.fillStyle = 'rgba(255,240,220,0.06)';
      g.fillRect(x + 3, y + 3, pw - 6, ph - 6);
      g.strokeStyle = 'rgba(46,32,24,0.38)';
      g.lineWidth = 1.3;
      g.strokeRect(x + 0.7, y + 0.7, pw - 1.4, ph - 1.4);
      if (hole === 2 || r() < 0.05) {
        // cracked through
        g.strokeStyle = 'rgba(40,28,20,0.7)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(x + r() * pw, y + 1);
        g.lineTo(x + r() * pw, y + ph * (0.4 + r() * 0.3));
        g.lineTo(x + r() * pw, y + ph - 1);
        g.stroke();
      }
    }
  }
  // laterite dust blown in from the lanes: heavier towards the edges, a few trodden drifts
  for (let i = 0; i < 46; i++) {
    const edge = r() < 0.55;
    const x = edge && r() < 0.5 ? (r() < 0.5 ? r() * T : w - r() * T) : r() * w;
    const y = edge && r() < 0.5 ? (r() < 0.5 ? r() * T : h - r() * T) : r() * h;
    stain(g, x, y, 70 + r() * 190, `rgba(150,72,36,${0.1 + r() * 0.12})`);
  }
  // palm oil, spilt water and grime: dark in albedo, glossier in roughness
  for (let i = 0; i < cols * rows * 0.28; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 14 + r() * 46;
    stain(
      g,
      x,
      y,
      rad,
      r() < 0.45 ? `rgba(118,52,16,${0.25 + r() * 0.25})` : `rgba(38,28,22,${0.25 + r() * 0.25})`,
    );
    stain(rg, x, y, rad, `rgba(70,70,70,${0.45 + r() * 0.3})`);
  }
  // refuse: pure-water sachets, paper, nylon scraps, leaves, bottle tops
  for (let i = 0; i < 360; i++) {
    const c = [
      `rgba(72,82,44,${0.4 + r() * 0.3})`,
      `rgba(200,196,182,${0.3 + r() * 0.3})`,
      `rgba(48,64,92,${0.3 + r() * 0.2})`,
      `rgba(150,60,40,${0.3 + r() * 0.2})`,
    ][Math.floor(r() * 4)]!;
    g.fillStyle = c;
    g.fillRect(r() * w, r() * h, 3 + r() * 9, 2 + r() * 6);
  }
  for (let i = 0; i < cols * rows * 0.12; i++)
    crack(g, r, r() * w, r() * h, 3 + Math.floor(r() * 5), 'rgba(40,26,18,0.55)', 1.8);
  seams(g, cols, rows, 'rgba(38,24,16,0.42)', 3);
}

function roadworks(g: Ctx, rg: Ctx, cols: number, rows: number): void {
  const w = cols * T;
  const h = rows * T;
  const r = artRng(3313);
  noiseFill(g, w, h, [58, 58, 60], 22, 31);
  noiseFill(rg, w, h, [180, 180, 180], 30, 32);
  // milled (grooved) strips where the old surface was stripped
  for (let i = 0; i < 4; i++) {
    const y = r() * h;
    const sh = 160 + r() * 200;
    g.fillStyle = 'rgba(90,88,86,0.4)';
    g.fillRect(0, y, w, sh);
    g.strokeStyle = 'rgba(30,30,32,0.35)';
    g.lineWidth = 2;
    for (let x = 0; x < w; x += 7) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 3, y + sh);
      g.stroke();
    }
  }
  // raw cement patches
  for (let i = 0; i < 10; i++) {
    const x = r() * w;
    const y = r() * h;
    g.fillStyle = `rgba(130,128,122,${0.45 + r() * 0.2})`;
    g.beginPath();
    g.ellipse(x, y, 80 + r() * 200, 60 + r() * 120, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // standing water: dark in albedo, mirror-smooth in roughness
  for (let i = 0; i < cols * rows * 0.16; i++) {
    const x = r() * w;
    const y = r() * h;
    const rx = 30 + r() * 110;
    const ry = 20 + r() * 60;
    g.fillStyle = 'rgba(20,24,30,0.55)';
    g.beginPath();
    g.ellipse(x, y, rx, ry, r() * 3, 0, Math.PI * 2);
    g.fill();
    rg.fillStyle = 'rgba(14,14,14,0.92)';
    rg.beginPath();
    rg.ellipse(x, y, rx * 0.9, ry * 0.9, 0, 0, Math.PI * 2);
    rg.fill();
  }
  for (let i = 0; i < cols * rows * 0.5; i++)
    crack(g, r, r() * w, r() * h, 5 + Math.floor(r() * 9), 'rgba(12,12,14,0.75)', 2.4);
  // spray-painted survey marks
  g.lineWidth = 6;
  for (let i = 0; i < 16; i++) {
    g.strokeStyle = r() < 0.6 ? 'rgba(200,96,30,0.55)' : 'rgba(190,190,170,0.4)';
    const x = r() * w;
    const y = r() * h;
    g.beginPath();
    if (r() < 0.5) {
      g.moveTo(x - 30, y);
      g.lineTo(x + 30, y);
      g.moveTo(x, y - 30);
      g.lineTo(x, y + 30);
    } else g.arc(x, y, 24, 0, Math.PI * 1.6);
    g.stroke();
  }
  // gravel
  for (let i = 0; i < 1400; i++) {
    const v = 70 + r() * 80;
    g.fillStyle = `rgba(${v},${v},${v - 4},0.6)`;
    g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 3);
  }
  seams(g, cols, rows, 'rgba(14,14,16,0.45)', 3);
}

const DRAW: Record<string, (g: Ctx, rg: Ctx, cols: number, rows: number) => void> = {
  danfoBusPark: busPark,
  balogunMarket: market,
  lekkiRoadworks: roadworks,
};

/** Builds the floor maps for an arena, or null when canvas is unavailable (tests, workers). */
export function arenaFloorMaps(arenaId: string, cols: number, rows: number): FloorMaps | null {
  if (typeof document === 'undefined') return null;
  const draw = DRAW[arenaId] ?? busPark;
  const [c, g] = makeCanvas(cols * T, rows * T);
  const [rc, rg] = makeCanvas(cols * T, rows * T);
  draw(g, rg, cols, rows);
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  const roughnessMap = new CanvasTexture(rc);
  roughnessMap.anisotropy = 4;
  for (const t of [map, roughnessMap]) t.wrapS = t.wrapT = RepeatWrapping;
  return { map, roughnessMap };
}
