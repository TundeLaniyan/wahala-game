/**
 * Oshodi Interchange structures (presentation only): the elevated expressway that crosses north of
 * the junction on hammerhead piers, the slip road peeling off it and dropping east, the covered
 * steel footbridge over the west road, and the overhead direction sign. All built from primitives
 * into the baked statics; textures are painted once on canvases (stained concrete, fly posters,
 * the green direction board).
 */
import { BoxGeometry, Group, Mesh, PlaneGeometry } from 'three';
import type { CanvasTexture, Material, MeshStandardMaterial } from 'three';
import { box, cyl, mat, mesh } from '../assets/helpers';
import { concreteTexture } from '../textures';
import type { SetContext } from './common';
import { STREET } from './common';
import { bar, beam, tiltedBox, uvScale, v3 } from './roadworksKit';
import { painted, parapetX, sign, signTexture, weather } from './oshodiKit';

export function flyoverPalette() {
  const conc = concreteTexture();
  return {
    deck: mat(0x8e897f, { map: conc, roughness: 1, flat: false }),
    deckDark: mat(0x6a665e, { map: conc, roughness: 1, flat: false }),
    pier: mat(0x948e84, { map: conc, roughness: 1, flat: false }),
    parapet: mat(0x9a958a, { roughness: 1 }),
    steel: mat(0x50524e, { roughness: 0.55, metalness: 0.6 }),
    greenSteel: mat(0x5e7a6a, { roughness: 0.6, metalness: 0.4 }),
    rust: mat(0x6e4430, { roughness: 0.85, metalness: 0.35 }),
    asphalt: mat(0x3a3936, { roughness: 0.9 }),
    tread: mat(0x5c5a54, { roughness: 0.8, metalness: 0.3 }),
    black: mat(0x1c1c1c, { roughness: 0.7 }),
    yellow: mat(0xb08a22, { roughness: 0.65 }),
    white: mat(0xb8b4a8, { roughness: 0.7 }),
  };
}
export type FlyoverPalette = ReturnType<typeof flyoverPalette>;

/** The south fascia of the expressway: stained concrete with rain streaks and a faded painted band. */
function fasciaTexture() {
  return painted(
    'osh:fascia',
    1024,
    128,
    (g, r) => {
      g.fillStyle = '#8f8a80';
      g.fillRect(0, 0, 1024, 128);
      for (let i = 0; i < 900; i++) {
        const v = 120 + r() * 40;
        g.fillStyle = `rgba(${v},${v - 4},${v - 10},${r() * 0.25})`;
        g.fillRect(r() * 1024, r() * 128, 3 + r() * 14, 2 + r() * 8);
      }
      // a faded painted band (old council colours) along the lip
      g.fillStyle = 'rgba(60,96,70,0.55)';
      g.fillRect(0, 18, 1024, 14);
      g.fillStyle = 'rgba(196,170,70,0.5)';
      g.fillRect(0, 32, 1024, 6);
      // black rain streaks running down from the drainage spouts
      for (let i = 0; i < 70; i++) {
        const x = r() * 1024;
        const grad = g.createLinearGradient(x, 0, x, 128);
        grad.addColorStop(0, `rgba(26,24,20,${0.3 + r() * 0.4})`);
        grad.addColorStop(1, 'rgba(26,24,20,0)');
        g.fillStyle = grad;
        g.fillRect(x, 30 + r() * 20, 2 + r() * 9, 40 + r() * 70);
      }
      // painted lettering, half worn away
      g.fillStyle = 'rgba(230,226,210,0.5)';
      g.font = 'bold 30px system-ui, sans-serif';
      g.fillText('OSHODI', 120, 84);
      g.fillText('OSHODI', 640, 84);
      g.fillStyle = 'rgba(196,60,40,0.42)';
      g.font = 'bold 22px system-ui, sans-serif';
      g.fillText('POST NO BILLS', 380, 100);
      weather(g, r, 1024, 128, 0.6);
    },
    true,
    31,
  );
}

/** Fly posters pasted on the piers: church crusades, political faces, pure water, music shows. */
function posterTexture() {
  return painted(
    'osh:posters',
    256,
    256,
    (g, r) => {
      const cols = ['#c8b480', '#a63c2c', '#2c4c7c', '#d8d2c0', '#3c6c44', '#c86a2a', '#6a3c6c', '#e0c040'];
      const words = [
        'CRUSADE',
        'VOTE',
        'LIVE!',
        'PURE WATER',
        'FUJI NITE',
        'MIRACLE',
        'JESUS IS LORD',
        'SALE',
      ];
      for (let i = 0; i < 16; i++) {
        const x = (i % 4) * 64;
        const y = Math.floor(i / 4) * 64;
        g.fillStyle = cols[i % cols.length]!;
        g.fillRect(x + 2, y + 2, 60, 60);
        g.fillStyle = 'rgba(20,16,12,0.75)';
        g.font = 'bold 11px system-ui, sans-serif';
        g.fillText(words[(i * 3) % words.length]!, x + 5, y + 16, 54);
        g.fillStyle = 'rgba(40,30,24,0.55)';
        g.beginPath();
        g.arc(x + 32, y + 40, 12, 0, Math.PI * 2);
        g.fill();
      }
      weather(g, r, 256, 256, 1.6);
      // torn edges: scraps of older posters
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(150,146,136,${0.5 + r() * 0.4})`;
        g.fillRect(r() * 256, r() * 256, 4 + r() * 16, 3 + r() * 10);
      }
    },
    false,
    32,
  );
}

/** A box with concrete UVs repeating every `tile` metres along its long faces. */
function slab(
  w: number,
  h: number,
  d: number,
  m: Material,
  x: number,
  y: number,
  z: number,
  tile = 2.5,
): Mesh {
  const b = box(w, h, d, m, x, y, z);
  uvScale(b.geometry, Math.max(1, Math.max(w, d) / tile), Math.max(1, h / tile));
  return b;
}

export interface Expressway {
  /** z of the south fascia */
  front: number;
  /** z of the north edge */
  back: number;
  /** height of the soffit above the street */
  soffit: number;
  /** girder depth */
  depth: number;
  piers: number[];
}

/**
 * The expressway: a box-girder deck crossing the whole scene east-west north of the junction,
 * hammerhead piers on the central reservation, a stained fascia with drainage spouts, parapets with
 * lamp-standard bases, fly posters on the piers.
 */
export function expressway(ctx: SetContext, P: FlyoverPalette, e: Expressway): void {
  const s = ctx.statics;
  const y0 = STREET + e.soffit;
  const mid = (e.front + e.back) / 2;
  const width = e.front - e.back;
  // the girder and deck slab (cantilevered wings either side)
  s.add(slab(90, e.depth * 0.7, width - 1.6, P.deckDark, 0, y0 + e.depth * 0.35, mid));
  s.add(slab(90, e.depth * 0.3, width, P.deck, 0, y0 + e.depth * 0.85, mid));
  // the fascia faces south: its painted face is a separate plane so the texture runs along it
  const fmap = fasciaTexture();
  const fm = mat(0xffffff, { map: fmap, roughness: 0.95, flat: false });
  const fascia = mesh(
    uvScale(new PlaneGeometry(90, e.depth * 0.42), 90 / 10, 1),
    fm,
    0,
    y0 + e.depth * 0.79,
    e.front + 0.012,
  );
  s.add(fascia);
  // a drip lip and drainage spouts dribbling black streaks
  s.add(box(90, 0.08, 0.12, P.deckDark, 0, y0 + e.depth * 0.58, e.front - 0.02));
  for (let x = -21; x <= 21; x += 3.5)
    s.add(cyl(0.05, 0.05, 0.35, P.rust, x, y0 + e.depth * 0.5, e.front + 0.1, 6));
  // parapets on the deck edges (the south one is all the camera sees of the carriageway above)
  const top = y0 + e.depth;
  parapetX(ctx, -45, 45, e.front - 0.2, P.parapet, { y: top, h: 0.8, face: -1 });
  parapetX(ctx, -45, 45, e.back + 0.2, P.parapet, { y: top, h: 0.8, face: 1 });
  // bearings and hammerhead piers
  const posters = mat(0xffffff, { map: posterTexture(), roughness: 0.95, flat: false });
  for (const x of e.piers) {
    const colH = e.soffit - 0.9;
    const col = cyl(0.62, 0.7, colH, P.pier, x, STREET + colH / 2, mid, 10);
    col.scale.z = 1.35;
    uvScale(col.geometry, 2, colH / 2);
    s.add(col);
    // the hammerhead: a tapered cap spreading under the girder
    const cap = new BoxGeometry(1.6, 0.9, width - 2.0);
    const p = cap.attributes.position!;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setZ(i, p.getZ(i) * 0.45);
    cap.computeVertexNormals();
    s.add(mesh(cap, P.pier, x, y0 - 0.45, mid));
    for (const bz of [-1.6, 0, 1.6]) s.add(box(0.5, 0.08, 0.5, P.black, x, y0 - 0.04, mid + bz));
    // fly posters wrapped on the south face of the column, a plinth stained by the street
    const poster = new Mesh(new PlaneGeometry(1.1, 1.3), posters);
    poster.position.set(x, STREET + 1.25, mid + 0.95);
    s.add(poster);
    s.add(box(1.5, 0.35, 2.0, P.deckDark, x, STREET + 0.17, mid));
  }
}

/**
 * A slip road peeling off the expressway's south side at x = `x0` and dropping east to the street
 * at x = `x1`, between z = `zs` (south edge) and `zn`. Returns the surface height at a given x.
 */
export function slipRoad(
  ctx: SetContext,
  P: FlyoverPalette,
  o: { x0: number; x1: number; zs: number; zn: number; top: number },
): (x: number) => number {
  const s = ctx.statics;
  const len = o.x1 - o.x0;
  const width = o.zs - o.zn;
  const zc = (o.zs + o.zn) / 2;
  // the ramp may run east (x1 > x0) or west (x1 < x0)
  const at = (x: number): number => STREET + o.top * Math.max(0, Math.min(1, (o.x1 - x) / len));
  const slope = Math.atan(o.top / len);
  const dir = Math.sign(len);
  const midX = (o.x0 + o.x1) / 2;
  const deckLen = Math.hypot(len, o.top);
  const thick = 0.75;
  const holder = new Group();
  holder.position.set(midX, (at(o.x0) + at(o.x1)) / 2, zc);
  holder.rotation.z = -slope;
  const deck = slab(deckLen, thick, width, P.deckDark, 0, -thick / 2, 0);
  holder.add(deck);
  holder.add(box(deckLen, 0.03, width - 0.5, P.asphalt, 0, 0.015, 0));
  // parapets either side of the ramp
  for (const side of [-1, 1]) {
    holder.add(box(deckLen, 0.7, 0.22, P.parapet, 0, 0.35, side * (width / 2 - 0.11)));
    holder.add(box(deckLen, 0.05, 0.3, P.parapet, 0, 0.72, side * (width / 2 - 0.11)));
  }
  // painted chevrons on the gore where it leaves the expressway
  for (let k = 0; k < 4; k++)
    holder.add(
      tiltedBox(
        0.5,
        0.012,
        0.1,
        P.white,
        dir * (-deckLen / 2 + 0.6 + k * 0.45),
        0.035,
        -width / 2 + 0.6,
        0,
        dir * 0.6,
      ),
    );
  s.add(holder);
  // round piers under the ramp
  for (let k = 1; k * 3.6 < Math.abs(len) - 2; k++) {
    const x = o.x0 + dir * (k * 3.6 - 1.2);
    const h = at(x) - STREET - thick;
    if (h < 0.6) continue;
    s.add(cyl(0.38, 0.42, h, P.pier, x, STREET + h / 2, zc, 10));
    s.add(box(0.9, 0.3, width - 0.6, P.pier, x, STREET + h - 0.15, zc));
  }
  return at;
}

/**
 * The covered steel footbridge over a road, running north-south at x between z0 (north) and z1, its
 * walkway at `h` above the street, with a stair dropping west at each end.
 */
export function footbridge(
  ctx: SetContext,
  P: FlyoverPalette,
  o: { x: number; z0: number; z1: number; h: number; stairs: number; banner?: CanvasTexture },
): void {
  const s = ctx.statics;
  const y = STREET + o.h;
  const len = o.z1 - o.z0;
  const zc = (o.z0 + o.z1) / 2;
  const w = 1.5;
  // walkway, truss sides, handrails
  s.add(box(w, 0.12, len, P.tread, o.x, y, zc));
  s.add(box(w + 0.1, 0.22, len, P.greenSteel, o.x, y - 0.17, zc));
  for (const sx of [-1, 1]) {
    const px = o.x + sx * (w / 2);
    s.add(box(0.07, 0.07, len, P.greenSteel, px, y + 1.05, zc)); // top chord
    s.add(box(0.05, 0.05, len, P.greenSteel, px, y + 0.5, zc));
    for (let k = 0; k <= Math.round(len / 1.2); k++) {
      const z = o.z0 + (k * len) / Math.round(len / 1.2);
      s.add(box(0.06, 1.05, 0.06, P.greenSteel, px, y + 0.52, z));
      if (k > 0)
        s.add(
          bar(v3(px, y + 0.06, z - len / Math.round(len / 1.2)), v3(px, y + 1.05, z), 0.022, P.greenSteel, 4),
        );
    }
  }
  // hawkers' goods hung over the rails, a torn banner on the side facing the junction
  if (o.banner) {
    const bm = mat(0xffffff, { map: o.banner, roughness: 0.9, flat: false });
    const b = mesh(new PlaneGeometry(len * 0.6, 0.55), bm, o.x + w / 2 + 0.06, y + 0.55, zc);
    b.rotation.y = Math.PI / 2;
    s.add(b);
  }
  // the trestle columns at both ends
  for (const z of [o.z0 + 0.3, o.z1 - 0.3]) {
    for (const sx of [-0.55, 0.55]) s.add(box(0.2, o.h, 0.2, P.greenSteel, o.x + sx, STREET + o.h / 2, z));
    s.add(box(1.3, 0.15, 0.25, P.greenSteel, o.x, y - 0.33, z));
  }
  // stairs dropping west at each end
  for (const z of [o.z0 + 0.55, o.z1 - 0.55]) {
    const steps = Math.round(o.h / 0.19);
    const run = o.stairs;
    // built in a frame at the bridge's west edge (local x runs west as negative)
    const holder = new Group();
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      holder.add(box(0.27, 0.05, 1.05, P.tread, -0.8 - t * run, y - t * o.h - 0.03, 0));
    }
    for (const sz of [-0.55, 0.55]) {
      holder.add(beam(v3(-0.75, y - 0.1, sz), v3(-0.8 - run, STREET + 0.05, sz), 0.08, 0.2, P.greenSteel));
      holder.add(bar(v3(-0.8, y + 0.9, sz), v3(-0.8 - run, STREET + 0.9, sz), 0.025, P.greenSteel, 4));
    }
    holder.position.set(o.x, 0, z);
    s.add(holder);
  }
}

/** The overhead direction sign on a portal gantry across a road (posts at z0 / z1, x fixed). */
export function directionGantry(
  ctx: SetContext,
  P: FlyoverPalette,
  x: number,
  z0: number,
  z1: number,
  h: number,
  ry: number,
): void {
  const s = ctx.statics;
  for (const z of [z0, z1]) {
    s.add(box(0.5, 0.25, 0.5, P.deckDark, x, STREET + 0.12, z));
    s.add(cyl(0.11, 0.13, h + 0.6, P.steel, x, STREET + (h + 0.6) / 2, z, 8));
  }
  const zc = (z0 + z1) / 2;
  const span = Math.abs(z1 - z0);
  for (const dy of [h - 0.05, h + 0.55]) s.add(box(0.12, 0.12, span, P.steel, x, STREET + dy, zc));
  for (let k = 0; k <= 5; k++) {
    const z = Math.min(z0, z1) + (k * span) / 5;
    s.add(box(0.05, 0.6, 0.05, P.steel, x, STREET + h + 0.25, z));
  }
  const map = signTexture(
    'osh:direction',
    512,
    256,
    {
      bg: '#1f5a3c',
      fg: '#e8e6dc',
      border: '#e8e6dc',
      lines: [
        ['IKEJA  •  AGEGE  ↑', 46],
        ['APAPA  •  MILE 2  →', 46],
        ['OSHODI TERMINAL  ←', 38],
      ],
      wear: 0.8,
    },
    41,
  );
  sign(
    ctx,
    map,
    x + Math.sin(ry) * 0.12,
    h + 0.25,
    zc + Math.cos(ry) * 0.12,
    Math.min(3.0, span * 0.85),
    1.45,
    ry,
  );
}

/** Small helper so the set can tint one-off materials without keeping a palette. */
export function paint(color: number, rough = 0.8, metal = 0.1): MeshStandardMaterial {
  return mat(color, { roughness: rough, metalness: metal });
}
