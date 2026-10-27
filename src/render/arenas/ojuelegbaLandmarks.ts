/**
 * Ojuelegba Underbridge - the landmarks that make the stage read as Ojuelegba (presentation only; identity
 * pass). Everything here stands OFF the board, north of it or beyond its side streets:
 *
 * - the flyover north of the board: a T-beam box girder (deep fascia, ribs, soffit), a markings-painted
 *   carriageway (double yellow median, dashed lanes, white edge lines), black-and-white New Jersey barriers
 *   with a steel rail, lamp standards, tall chunky piers with black-and-white footings and a mural panel on
 *   each, and a green direction-sign gantry (Yaba, Mushin / Lawanson, Surulere / Itire / Stadium);
 * - two pedestrian link bridges across the through road's mouths (west and east), each a blue-roofed
 *   walkway on concrete legs with a stair at both ends and a green direction board for the camera;
 * - the Abalti-barracks corridor on the north-east horizon: an ochre perimeter wall with pilasters, a gated
 *   guardhouse, a small examinations-office block and, beyond them, floodlight masts and the far rim of a
 *   stadium bowl. A backdrop only: nothing there is playable.
 *
 * Boards say place names only (Lagos places; the barracks and office are plain lettering, no crest or logo);
 * every other name is fictional. Static pieces go into `ctx.statics` (baked into a few merged meshes);
 * textures are cached canvases. Without a DOM (tests) the boards are left out.
 */
import { CylinderGeometry, DoubleSide, PlaneGeometry } from 'three';
import type { CanvasTexture } from 'three';
import { concreteTexture } from '../textures';
import { box, cyl, mat, mesh, uniqueMat } from '../assets/helpers';
import type { SetContext } from './common';
import { STREET } from './common';
import { painted } from './oshodiKit';
import type { Paint } from './oshodiKit';
import type { SiteLights } from './roadworksKit';
import { tileWorld } from './rumbleV2Kit';
import { DECK_TOP, DECK_X0, DECK_X1, SOFFIT } from './ojuelegbaDeck';

const hasDom = (): boolean => typeof document !== 'undefined';

function palette() {
  const conc = hasDom() ? concreteTexture() : undefined;
  return {
    concrete: mat(0xa4a09a, { map: conc, roughness: 1, flat: false }),
    concreteLight: mat(0xc2beb4, { map: conc, roughness: 1, flat: false }),
    concreteDark: mat(0x6a6660, { map: conc, roughness: 1, flat: false }),
    white: mat(0xdedacd, { roughness: 0.8 }),
    black: mat(0x1c1c1c, { roughness: 0.75 }),
    steel: mat(0x50524e, { roughness: 0.55, metalness: 0.6 }),
    steelLight: mat(0x8c8e8a, { roughness: 0.5, metalness: 0.55 }),
    yellow: mat(0xe0ae28, { roughness: 0.65 }),
    blue: mat(0x2c5f94, { roughness: 0.6, metalness: 0.3 }),
    ochre: mat(0xcbb277, { roughness: 0.95 }),
    ochreDark: mat(0xa9935a, { roughness: 0.95 }),
    olive: mat(0x6b7a52, { roughness: 0.85 }),
    gateSteel: mat(0x2a2c2a, { roughness: 0.6, metalness: 0.5 }),
    trunk: mat(0x7a6244, { roughness: 0.9 }),
    frond: mat(0x3f7a3a, { roughness: 0.8 }),
    soil: mat(0x5a4a34, { roughness: 1 }),
    bowl: mat(0xb9b6ac, { roughness: 0.9 }),
    bowlDark: mat(0x7e7c74, { roughness: 0.9 }),
  };
}
type Pal = ReturnType<typeof palette>;

// ---------------------------------------------------------------------------------------- textures

/** The painted carriageway (tile = 14 m long, 14 m wide): double yellow median, dashed lanes, edge lines. */
function roadTexture(): CanvasTexture {
  return painted(
    'ojuelegba:deckRoad',
    256,
    256,
    (g, r) => {
      g.fillStyle = '#4a4946';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = r() < 0.5 ? `rgba(20,20,20,${r() * 0.18})` : `rgba(190,184,170,${r() * 0.1})`;
        g.fillRect(r() * 256, r() * 256, 1 + r() * 5, 1 + r() * 5);
      }
      // patched asphalt
      for (let i = 0; i < 5; i++) {
        g.fillStyle = `rgba(30,30,30,${0.25 + r() * 0.2})`;
        g.fillRect(r() * 220, r() * 220, 20 + r() * 40, 14 + r() * 30);
      }
      const m = 128; // 18.3 px per metre
      g.fillStyle = '#e0b52c';
      g.fillRect(m - 7, 0, 4, 256);
      g.fillRect(m + 3, 0, 4, 256);
      g.fillStyle = '#e8e4d4';
      for (const dx of [-73, 73]) for (const y of [0, 128]) g.fillRect(m + dx - 2, y, 4, 56);
      for (const dx of [-119, 119]) g.fillRect(m + dx - 2, 0, 4, 256);
    },
    true,
    11,
  );
}

/** A mural panel for the pier faces: a Lagos skyline, bridge arcs and a low sun in warm colours (no text). */
function muralTexture(): CanvasTexture {
  return painted(
    'ojuelegba:mural',
    128,
    256,
    (g, r) => {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#2c6f9a');
      grad.addColorStop(0.55, '#e8b35a');
      grad.addColorStop(1, '#c4562e');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 256);
      g.fillStyle = '#f6e2a2';
      g.beginPath();
      g.arc(78, 120, 22, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 9; i++) {
        const w = 10 + r() * 16;
        const h = 40 + r() * 80;
        g.fillStyle = i % 2 ? '#1f3a54' : '#2d5170';
        g.fillRect(i * 14 + r() * 4, 190 - h, w, h + 70);
      }
      g.strokeStyle = '#f1efe4';
      g.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(30 + i * 34, 215, 24, Math.PI, 0);
        g.stroke();
      }
      g.fillStyle = '#e2b52c';
      g.fillRect(0, 232, 128, 24);
    },
    false,
    12,
  );
}

type Arrow = 'left' | 'up' | 'right';
interface SignPanel {
  w: number;
  lines: string[];
  arrow: Arrow;
}

function arrow(g: Paint, kind: Arrow, cx: number, cy: number, s: number): void {
  g.save();
  g.translate(cx, cy);
  g.rotate(kind === 'left' ? -Math.PI / 2 : kind === 'right' ? Math.PI / 2 : 0);
  g.fillStyle = '#f4f2ea';
  g.beginPath();
  g.moveTo(0, -s);
  g.lineTo(s * 0.62, -s * 0.15);
  g.lineTo(s * 0.22, -s * 0.15);
  g.lineTo(s * 0.22, s * 0.8);
  g.lineTo(-s * 0.22, s * 0.8);
  g.lineTo(-s * 0.22, -s * 0.15);
  g.lineTo(-s * 0.62, -s * 0.15);
  g.closePath();
  g.fill();
  g.restore();
}

/** One canvas of side-by-side green direction boards (white border, bold white lettering, a white arrow). */
function directionTexture(
  key: string,
  w: number,
  h: number,
  panels: SignPanel[],
  seed: number,
): CanvasTexture {
  const total = panels.reduce((n, p) => n + p.w, 0);
  return painted(
    key,
    w,
    h,
    (g, r) => {
      g.fillStyle = '#2c2c2a';
      g.fillRect(0, 0, w, h);
      let x = 0;
      for (const p of panels) {
        const pw = Math.round((p.w / total) * w);
        g.fillStyle = '#17674a';
        g.fillRect(x + 6, 6, pw - 12, h - 12);
        g.strokeStyle = '#f2f0e6';
        g.lineWidth = Math.max(4, h * 0.025);
        g.strokeRect(x + 14, 14, pw - 28, h - 28);
        const side = h * 0.46;
        const ax = p.arrow === 'right' ? x + pw - side * 0.62 : x + side * 0.62;
        const tx = p.arrow === 'right' ? x + (pw - side) / 2 : x + side + (pw - side) / 2;
        arrow(g, p.arrow, ax, h / 2, side * 0.5);
        const size = Math.min(h * 0.3, (pw - side * 1.3) / 5.4);
        g.fillStyle = '#f4f2ea';
        g.font = `bold ${Math.round(size)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const lh = size * 1.12;
        const y0 = h / 2 - ((p.lines.length - 1) * lh) / 2;
        p.lines.forEach((t, i) => g.fillText(t, tx, y0 + i * lh, pw - side * 1.15));
        x += pw;
      }
      for (let i = 0; i < 160; i++) {
        g.fillStyle = r() < 0.6 ? `rgba(20,20,16,${r() * 0.18})` : `rgba(230,224,206,${r() * 0.12})`;
        g.fillRect(r() * w, r() * h, 2 + r() * 8, 1 + r() * 4);
      }
    },
    false,
    seed,
  );
}

/** A plain painted fascia board (one line of bold lettering on a flat colour, weathered). */
function fasciaTexture(
  key: string,
  w: number,
  h: number,
  bg: string,
  fg: string,
  text: string,
): CanvasTexture {
  return painted(
    key,
    w,
    h,
    (g, r) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = fg;
      g.font = `bold ${Math.round(h * 0.52)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2, w * 0.94);
      for (let i = 0; i < 120; i++) {
        g.fillStyle = r() < 0.6 ? `rgba(24,20,14,${r() * 0.2})` : `rgba(235,226,200,${r() * 0.14})`;
        g.fillRect(r() * w, r() * h, 2 + r() * 8, 1 + r() * 4);
      }
    },
    false,
    19,
  );
}

/** A flat textured plane facing +z (or `ry`), one draw call per distinct map. */
function board(
  ctx: SetContext,
  map: CanvasTexture | null,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  ry = 0,
): void {
  if (!map) return;
  const m = uniqueMat(0xffffff, { map, roughness: 0.82, flat: false });
  m.side = DoubleSide;
  ctx.own(m);
  const p = mesh(new PlaneGeometry(w, h), m, x, y, z);
  p.rotation.y = ry;
  ctx.statics.add(p);
}

// ------------------------------------------------------------------------------------- the flyover

/**
 * The flyover running on north of the board over the deck columns. Deck top at `DECK_TOP` (the same level the
 * living environment's traffic drives on and the overhead over the board uses).
 */
export function flyover(ctx: SetContext, L: SiteLights): void {
  const { W, H } = ctx;
  const P = palette();
  const s = ctx.statics;
  const { wx } = tileWorld(W, H);
  const north = -H / 2;
  const x0 = wx(DECK_X0) - 0.5;
  const x1 = wx(DECK_X1) + 0.5;
  const width = x1 - x0;
  const cx = (x0 + x1) / 2;
  const z0 = north - 0.45;
  const z1 = north - 46;
  const len = z0 - z1;
  const zc = (z0 + z1) / 2;
  const at = (
    w: number,
    h: number,
    d: number,
    m: Pal[keyof Pal],
    x: number,
    yBottom: number,
    z: number,
  ): void => {
    s.add(box(w, h, d, m, x, yBottom + h / 2, z));
  };

  // T-beam box girder: slab, four dark soffit beams, light fascia on both edges
  at(width, 0.4, len, P.concrete, cx, DECK_TOP - 0.4, zc);
  for (const bx of [-5.2, -1.75, 1.75, 5.2]) at(1.1, 1.1, len, P.concreteDark, cx + bx, SOFFIT, zc);
  at(width - 1.2, 0.35, len, P.concreteDark, cx, DECK_TOP - 0.75, zc);
  for (const side of [-1, 1]) {
    const ex = cx + side * (width / 2 - 0.23);
    at(0.46, 0.6, len, P.concreteDark, ex, SOFFIT, zc);
    at(0.46, 1.18, len, P.concrete, ex, SOFFIT + 0.6, zc);
    at(0.5, 0.12, len, P.concreteLight, ex, DECK_TOP - 0.12, zc);
    // New Jersey barrier with a black block every other metre, steel rail and posts
    at(0.5, 0.78, len, P.concreteLight, ex, DECK_TOP, zc);
    for (let z = z0 - 1; z > z1 + 0.5; z -= 2) at(0.54, 0.8, 1.0, P.black, ex, DECK_TOP, z);
    at(0.09, 0.09, len, P.steel, ex, DECK_TOP + 1.1, zc);
    for (let z = z0 - 1.5; z > z1; z -= 3) at(0.08, 0.34, 0.08, P.steel, ex, DECK_TOP + 0.78, z);
    // lamp standards with a swept arm over the carriageway, every 9 m
    for (let z = z0 - 3; z > z1 + 1; z -= 9) {
      s.add(cyl(0.06, 0.09, 3.7, P.steel, ex, DECK_TOP + 1.85, z, 6));
      at(1.5, 0.07, 0.07, P.steel, ex - side * 0.75, DECK_TOP + 3.65, z);
      at(0.5, 0.1, 0.24, P.white, ex - side * 1.5, DECK_TOP + 3.58, z);
    }
  }
  // the carriageway itself, painted
  if (hasDom()) {
    const tex = roadTexture();
    tex.repeat.set(1, len / 14);
    const road = uniqueMat(0xffffff, { map: tex, roughness: 0.92, flat: false });
    ctx.own(road);
    const plane = mesh(new PlaneGeometry(width - 1.0, len), road, cx, DECK_TOP + 0.015, zc);
    plane.rotation.x = -Math.PI / 2;
    plane.castShadow = false;
    s.add(plane);
  }

  // bents: twin chunky columns every 8 m on a deep crosshead, black-and-white footings, a mural on the
  // south face of each column
  const mural = hasDom() ? muralTexture() : null;
  for (let z = z0 - 4; z > z1 + 2; z -= 8) {
    for (const dx of [-4.8, 4.8]) {
      const x = cx + dx;
      s.add(cyl(0.85, 0.98, SOFFIT - STREET, P.concrete, x, STREET + (SOFFIT - STREET) / 2, z, 8));
      s.add(cyl(1.02, 1.02, 0.34, P.black, x, STREET + 0.17, z, 8));
      s.add(cyl(1.02, 1.02, 0.34, P.white, x, STREET + 0.51, z, 8));
      at(2.3, 0.3, 2.3, P.concreteDark, x, STREET, z);
      board(ctx, mural, 1.1, 2.3, x, STREET + 1.95, z + 0.98);
    }
    at(width - 0.8, 1.0, 1.9, P.concrete, cx, SOFFIT - 1.0, z);
    at(width - 2.2, 0.35, 2.1, P.concreteDark, cx, SOFFIT - 1.35, z);
  }

  // the direction-sign gantry over the carriageway, boards facing the camera (south)
  const gz = north - 2.4; // between the deck's start and its first bent: inside the whole-arena frame
  for (const side of [-1, 1]) {
    const px = cx + side * (width / 2 - 0.55);
    s.add(cyl(0.12, 0.14, 5.9, P.steel, px, DECK_TOP + 2.95, gz, 8));
    at(0.9, 0.12, 0.9, P.steelLight, px, DECK_TOP, gz);
  }
  at(width - 0.6, 0.12, 0.12, P.steel, cx, DECK_TOP + 5.35, gz);
  at(width - 0.6, 0.12, 0.12, P.steel, cx, DECK_TOP + 3.3, gz);
  for (let i = 0; i < 9; i++)
    at(0.07, 2.1, 0.07, P.steel, x0 + 0.6 + (i * (width - 1.2)) / 8, DECK_TOP + 3.3, gz);
  if (hasDom()) {
    const bw = width - 1.0;
    const tex = directionTexture(
      'ojuelegba:gantry',
      1536,
      256,
      [
        { w: 3.6, lines: ['YABA'], arrow: 'left' },
        { w: 4.0, lines: ['MUSHIN', 'LAWANSON'], arrow: 'up' },
        { w: 5.2, lines: ['SURULERE', 'ITIRE', 'STADIUM'], arrow: 'right' },
      ],
      23,
    );
    board(ctx, tex, bw, bw * (256 / 1536), cx, DECK_TOP + 4.3, gz + 0.1);
  }
  L.glow(cx - 5.4, DECK_TOP + 3.9, z0 - 3, 1.6, 0xe8f4ff, 0.5);
  L.glow(cx + 5.4, DECK_TOP + 3.9, z0 - 3, 1.6, 0xe8f4ff, 0.5);
}

// ---------------------------------------------------------------------------- pedestrian link bridge

/**
 * A pedestrian link bridge across the through road's west mouth, just beyond the board edge: a walkway on two
 * concrete legs with a blue corrugated roof and railings, a landing at each end and a stair running outward
 * (west) from each landing, plus a green direction board on the roof's south face for the camera.
 */
export function linkBridge(ctx: SetContext): void {
  const { W } = ctx;
  const P = palette();
  const s = ctx.statics;
  const x = -W / 2 - 1.6;
  const deckY = STREET + 3.3;
  const zN = -3.4;
  const zS = 4.4;
  const zc = (zN + zS) / 2;
  const wdt = 2.0;
  const at = (
    w: number,
    h: number,
    d: number,
    m: Pal[keyof Pal],
    px: number,
    yBottom: number,
    pz: number,
  ): void => {
    s.add(box(w, h, d, m, px, yBottom + h / 2, pz));
  };
  const half = wdt / 2;
  // walkway slab with a deep edge beam, rails on both sides, a blue corrugated roof on posts
  at(wdt, 0.3, zS - zN, P.concrete, x, deckY - 0.3, zc);
  for (const dx of [-half + 0.04, half - 0.04]) {
    at(0.05, 0.05, zS - zN, P.steel, x + dx, deckY + 1.0, zc);
    at(0.05, 0.05, zS - zN, P.steel, x + dx, deckY + 0.5, zc);
    for (let z = zN; z <= zS + 0.01; z += 1.0) at(0.04, 1.0, 0.04, P.steel, x + dx, deckY, z);
    for (const z of [zN + 0.2, zc, zS - 0.2]) at(0.1, 2.5, 0.1, P.steel, x + dx, deckY, z);
  }
  at(wdt + 0.5, 0.08, zS - zN + 0.3, P.blue, x, deckY + 2.5, zc);
  // legs on the pavements either side of the road (the road is z -2 .. 2), a deep beam over each
  for (const z of [zN + 0.4, zS - 0.4]) {
    at(1.2, deckY - 0.35 - STREET, 0.7, P.concrete, x, STREET, z);
    at(wdt + 0.3, 0.35, 0.9, P.concreteDark, x, deckY - 0.65, z);
  }
  // landings (north: z < zN, south: z > zS) with rails, and the stairs running west from their west edges
  const steps = 10;
  const rise = (deckY - STREET) / steps;
  const run = 0.42;
  for (const dir of [-1, 1] as const) {
    const zl = dir < 0 ? zN - 1.0 : zS + 1.0; // landing centre
    at(wdt, 0.3, 2.0, P.concrete, x, deckY - 0.3, zl);
    at(0.05, 0.05, 2.0, P.steel, x + half - 0.04, deckY + 1.0, zl);
    at(wdt, 0.05, 0.05, P.steel, x, deckY + 1.0, zl + dir * 1.0 - 0.0);
    at(0.5, deckY - 0.3 - STREET, 0.5, P.concrete, x + 0.5, STREET, zl + dir * 0.7);
    const x0 = x - half;
    for (let i = 1; i <= steps; i++) {
      const h = deckY - 0.3 - i * rise + 0.3;
      at(run, Math.max(0.1, h - STREET), 1.8, P.concreteLight, x0 - (i - 0.5) * run, STREET, zl);
    }
    const len = steps * run;
    for (const dz of [-0.95, 0.95]) {
      const stringer = box(
        Math.hypot(len, deckY - STREET),
        0.06,
        0.06,
        P.steel,
        x0 - len / 2,
        STREET + (deckY - STREET) / 2 + 1.0,
        zl + dz,
      );
      stringer.rotation.z = Math.atan2(deckY - STREET, len);
      s.add(stringer);
    }
  }
  // the direction board standing on the roof's south end, facing the camera: every destination in one place
  if (hasDom()) {
    for (const dx of [-1.8, 1.8])
      s.add(cyl(0.04, 0.04, 1.3, P.steel, x - 1.5 + dx, deckY + 3.15, zS + 0.05, 6));
    const tex = directionTexture(
      'ojuelegba:bridge',
      1280,
      320,
      [
        { w: 3.0, lines: ['YABA'], arrow: 'left' },
        { w: 3.4, lines: ['MUSHIN', 'LAWANSON'], arrow: 'up' },
        { w: 4.4, lines: ['SURULERE', 'ITIRE', 'STADIUM'], arrow: 'right' },
      ],
      31,
    );
    board(ctx, tex, 4.4, 1.1, x - 1.5, deckY + 3.45, zS + 0.1); // shifted west so it stays off the board
  }
}

// ------------------------------------------------------------------------ barracks and stadium corridor

/**
 * The north-east horizon, seen over the far buildings: an ochre perimeter wall running east-west (its lettering
 * faces the camera) with a gated guardhouse ("ABALTI BARRACKS" in plain lettering, no crest), a small
 * examinations office with a plain "WAEC" fascia in front of it, floodlight masts behind and the far rim of a
 * stadium bowl. Restrained: low, far, a backdrop; nothing there is playable.
 */
export function barracksCorridor(ctx: SetContext): void {
  const { H } = ctx;
  const P = palette();
  const s = ctx.statics;
  const zw = -H / 2 - 9; // the wall's line, just behind the first row of far buildings
  const xa = 10;
  const xb = 48;
  const xg = 25; // the gate
  const wallH = 4.2;
  const at = (
    w: number,
    h: number,
    d: number,
    m: Pal[keyof Pal],
    px: number,
    yBottom: number,
    pz: number,
  ): void => {
    s.add(box(w, h, d, m, px, yBottom + h / 2, pz));
  };
  const xc = (xa + xb) / 2;
  at(xb - xa, wallH, 0.5, P.ochre, xc, STREET, zw);
  at(xb - xa, 0.3, 0.64, P.ochreDark, xc, STREET + wallH, zw);
  for (let x = xa + 2; x < xb - 1; x += 4) at(0.6, wallH + 0.5, 0.9, P.ochreDark, x, STREET, zw + 0.1);
  // the gate: two tall towers (they stand above the roofline), a dark steel gate between, a guard post in front
  const towerH = 10.5;
  for (const dx of [-2.6, 2.6]) {
    at(1.8, towerH, 1.8, P.ochreDark, xg + dx, STREET, zw);
    at(2.1, 0.3, 2.1, P.ochre, xg + dx, STREET + towerH, zw);
  }
  at(3.4, wallH - 0.2, 0.12, P.gateSteel, xg, STREET, zw + 0.1);
  for (let x = xg - 1.6; x <= xg + 1.6; x += 0.3)
    at(0.04, wallH - 0.4, 0.04, P.steelLight, x, STREET + 0.1, zw + 0.2);
  at(5.4, 1.5, 1.7, P.ochre, xg, STREET + wallH, zw); // the lintel block carrying the name board
  at(1.6, 2.1, 1.6, P.olive, xg + 4.6, STREET, zw + 2.0);
  at(1.9, 0.12, 1.9, P.concreteDark, xg + 4.6, STREET + 2.1, zw + 2.0);
  if (hasDom())
    board(
      ctx,
      fasciaTexture('ojuelegba:abalti', 512, 96, '#c9b074', '#2a2418', 'ABALTI BARRACKS'),
      5.2,
      0.98,
      xg,
      STREET + wallH + 0.75,
      zw + 0.9,
    );
  // the examinations office: a pale three-storey block with a plain fascia
  const ox = xb - 6;
  const oz = zw + 4.4;
  at(8, 9.4, 4.6, P.concreteLight, ox, STREET, oz);
  at(8.4, 0.3, 5.0, P.concreteDark, ox, STREET + 9.4, oz);
  for (let f = 0; f < 3; f++)
    for (let i = 0; i < 4; i++)
      at(1.0, 1.0, 0.06, P.blue, ox - 2.7 + i * 1.8, STREET + 1.3 + f * 2.9, oz + 2.33);
  if (hasDom())
    board(
      ctx,
      fasciaTexture('ojuelegba:waec', 256, 72, '#f2efe6', '#1b3a5e', 'WAEC'),
      3.0,
      0.84,
      ox,
      STREET + 8.5,
      oz + 2.36,
    );
  // floodlight masts behind the wall (lamp banks face south), tall enough to show over the roofs
  for (const [mx, mz] of [
    [xg - 12, zw - 4],
    [xg + 9, zw - 6],
    [xg + 20, zw - 4],
  ] as const) {
    s.add(cyl(0.2, 0.32, 19, P.steel, mx, STREET + 9.5, mz, 6));
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 4; c++)
        at(0.56, 0.44, 0.3, P.white, mx - 1.0 + c * 0.67, STREET + 19 + r * 0.5, mz + 0.2);
  }
  // the far rim of a stadium bowl: a pale tiered wall and a darker roof ring, high enough to show over the roofs
  const bx = xb + 14;
  const bz = zw - 26;
  s.add(mesh(new CylinderGeometry(30, 27, 15, 44, 1, true, -1.0, 2.0), P.bowl, bx, STREET + 7.5, bz));
  s.add(
    mesh(new CylinderGeometry(30.8, 30.8, 1.2, 44, 1, true, -1.0, 2.0), P.bowlDark, bx, STREET + 15.4, bz),
  );
}
