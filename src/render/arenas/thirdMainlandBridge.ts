/**
 * Third Mainland Checkpoint structures (presentation only): the bridge deck and its box girder,
 * parapets and piers standing in the lagoon far below; the lagoon itself with Makoko stilt houses,
 * dugout canoes, fish-trap stakes and a sand dredger; the low skyline across the water; the
 * checkpoint (sentry booth, striped barrier arm, painted drums, tyre spikes, sandbags); and the
 * heavy goods traffic (a fuel tanker and a container truck), all built from primitives.
 */
import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from 'three';
import type { CanvasTexture, Material } from 'three';
import { box, cyl, mat, mesh, sphere } from '../assets/helpers';
import { artRng, concreteTexture, corrugatedTexture, towerWindowsTexture } from '../textures';
import type { SetContext } from './common';
import { STREET } from './common';
import type { SiteLights } from './roadworksKit';
import { bar, lampMat, tiltedBox, uvScale, v3 } from './roadworksKit';
import { painted, weather } from './oshodiKit';

/** The lagoon's surface lies this far below the street (the bridge is high over the water). */
export const WATER = -9.0;

export function bridgePalette() {
  const conc = concreteTexture();
  return {
    deck: mat(0x9a948a, { map: conc, roughness: 1, flat: false }),
    deckDark: mat(0x6e6860, { map: conc, roughness: 1, flat: false }),
    parapet: mat(0xa49e92, { roughness: 1 }),
    rail: mat(0x7a7c78, { roughness: 0.5, metalness: 0.65 }),
    steel: mat(0x50524e, { roughness: 0.55, metalness: 0.6 }),
    black: mat(0x1c1c1c, { roughness: 0.7, metalness: 0.2 }),
    rubber: mat(0x141414, { roughness: 0.9 }),
    chrome: mat(0xb4b4b0, { roughness: 0.22, metalness: 0.95 }),
    glass: mat(0x24303a, { roughness: 0.1, metalness: 0.6 }),
    wood: mat(0x5a4230, { roughness: 0.95 }),
    woodPale: mat(0x7e6448, { roughness: 0.95 }),
    rust: mat(0x6e4228, { roughness: 0.85, metalness: 0.35 }),
    red: mat(0x9a2a1e, { roughness: 0.6 }),
    white: mat(0xc4beb0, { roughness: 0.6 }),
    green: mat(0x2e5a3a, { roughness: 0.7 }),
    sand: mat(0x9a7e56, { roughness: 1, flat: false }),
    hyacinth: mat(0x4a7a30, { roughness: 0.9, flat: false }),
    stake: mat(0x6a5a40, { roughness: 1 }),
    sandbag: mat(0x7a7058, { roughness: 1 }),
  };
}
export type BridgePalette = ReturnType<typeof bridgePalette>;

function slab(w: number, h: number, d: number, m: Material, x: number, y: number, z: number, tile = 3): Mesh {
  const b = box(w, h, d, m, x, y, z);
  uvScale(b.geometry, Math.max(1, Math.max(w, d) / tile), Math.max(1, h / tile));
  return b;
}

/**
 * The deck: a box girder from `zn` to `zs` along the whole scene, its top just under the street
 * plane, fascias down both edges with a drip lip, and twin-column piers standing on pile caps in the
 * lagoon. The parapets are added by the set.
 */
export function bridgeDeck(ctx: SetContext, P: BridgePalette, zn: number, zs: number): void {
  const s = ctx.statics;
  const w = zs - zn;
  const zc = (zn + zs) / 2;
  const top = STREET - 0.01;
  s.add(slab(170, 0.45, w, P.deck, 0, top - 0.225, zc));
  s.add(slab(170, 1.35, w - 2.6, P.deckDark, 0, top - 0.45 - 0.675, zc));
  for (const z of [zn, zs])
    s.add(box(170, 0.1, 0.16, P.deckDark, 0, top - 0.5, z + Math.sign(zc - z) * 0.05));
  for (const x of [-34, -12, 12, 34]) {
    const colH = top - 1.8 - WATER;
    for (const z of [zc - w * 0.28, zc + w * 0.28]) {
      const c = slab(1.2, colH, 1.2, P.deck, x, WATER + colH / 2, z);
      s.add(c);
    }
    s.add(slab(2.2, 0.9, w - 1.4, P.deckDark, x, top - 2.25, zc)); // the pier cap
    s.add(slab(3.2, 0.8, w * 0.75, P.deckDark, x, WATER + 0.2, zc)); // the pile cap at the waterline
  }
}

/** The lagoon: a brown-green sheet of water reflecting the sunset, out to the far shore. */
export function lagoonWater(ctx: SetContext): void {
  const map = painted(
    'tm:water',
    256,
    256,
    (g, r) => {
      g.fillStyle = '#8a948c';
      g.fillRect(0, 0, 256, 256);
      // long low ripples catching the light, darker troughs between
      for (let i = 0; i < 900; i++) {
        const y = r() * 256;
        const x = r() * 256;
        const l = 8 + r() * 40;
        g.fillStyle =
          r() < 0.55 ? `rgba(220,200,170,${0.08 + r() * 0.14})` : `rgba(20,30,28,${0.1 + r() * 0.18})`;
        g.fillRect(x, y, l, 1 + r() * 1.5);
      }
    },
    true,
    81,
  );
  const m = new MeshStandardMaterial({ color: 0x7a8682, map, roughness: 0.12, metalness: 0.55 });
  ctx.own(m);
  const geo = uvScale(new PlaneGeometry(400, 300), 40, 30);
  ctx.own(geo);
  const water = new Mesh(geo, m);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, WATER, -110);
  water.receiveShadow = true;
  water.userData.grit = 'none';
  ctx.root.add(water);
  // the low sun's glitter path across the water, twinkling as the ripples move
  const glint = painted(
    'tm:glint',
    128,
    128,
    (g, r) => {
      g.clearRect(0, 0, 128, 128);
      for (let i = 0; i < 260; i++) {
        const a = 0.25 + r() * 0.75;
        g.fillStyle = `rgba(255,${200 + r() * 50},${140 + r() * 60},${a})`;
        g.fillRect(r() * 128, r() * 128, 2 + r() * 7, 1 + r() * 1.5);
      }
    },
    true,
    83,
  );
  const gm = new MeshBasicMaterial({
    map: glint,
    color: 0xffd8a0,
    transparent: true,
    opacity: 0.85,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  ctx.own(gm);
  const ggeo = uvScale(new PlaneGeometry(46, 9), 9, 2);
  ctx.own(ggeo);
  const path = new Mesh(ggeo, gm);
  path.rotation.set(-Math.PI / 2, 0, 0.12);
  path.position.set(-24, WATER + 0.05, -27);
  path.onBeforeRender = () => {
    glint.offset.set((performance.now() / 1000) * 0.03, Math.sin(performance.now() / 700) * 0.02);
  };
  ctx.root.add(path);
}

/** A dugout fishing canoe (long, narrow, pointed), optionally with a net heap and a paddle. */
export function canoe(ctx: SetContext, P: BridgePalette, x: number, z: number, ry: number, len = 5.2): void {
  const g = new Group();
  const hull = box(0.75, 0.32, len, P.wood, 0, 0.12, 0);
  const p = hull.geometry.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const zz = p.getZ(i);
    const k = 1 - Math.pow(Math.abs(zz) / (len / 2), 3);
    p.setX(i, p.getX(i) * Math.max(0.08, k));
    if (p.getY(i) < 0) p.setX(i, p.getX(i) * 0.7);
    if (Math.abs(zz) > len * 0.4) p.setY(i, p.getY(i) + 0.08);
  }
  hull.geometry.computeVertexNormals();
  g.add(hull);
  g.add(box(0.5, 0.03, len * 0.7, P.black, 0, 0.27, 0)); // the dark wet inside
  g.add(box(0.6, 0.05, 0.12, P.woodPale, 0, 0.26, -0.6)); // a thwart
  g.add(box(0.45, 0.12, 0.5, mat(0x6a6a4e, { roughness: 1 }), 0, 0.33, len * 0.2)); // the net heap
  g.add(tiltedBox(0.05, 0.05, 1.8, P.woodPale, 0.35, 0.4, -0.3, 0.2, 0.3)); // the paddle
  g.position.set(x, WATER + 0.02, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
}

/** A Makoko-style stilt house: plank walls on a platform over the water, a rusted roof, a ladder. */
function stiltHouse(
  ctx: SetContext,
  P: BridgePalette,
  roof: Material,
  x: number,
  z: number,
  ry: number,
  w: number,
  d: number,
): void {
  const g = new Group();
  const deck = 1.3;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      g.add(box(0.12, deck + 0.5, 0.12, P.stake, (sx * w) / 2, (deck - 0.5) / 2, (sz * d) / 2));
  g.add(box(w + 0.6, 0.1, d + 0.4, P.woodPale, 0.2, deck, 0.1));
  g.add(box(w, 1.6, d, P.wood, 0, deck + 0.85, 0));
  for (let k = 0; k < 5; k++)
    g.add(box(0.02, 1.6, d + 0.01, P.woodPale, -w / 2 + 0.2 + k * (w / 5), deck + 0.85, 0)); // planks
  g.add(box(0.5, 1.0, 0.02, P.black, 0.2, deck + 0.55, d / 2 + 0.01)); // the doorway
  const r1 = tiltedBox(w + 0.5, 0.05, d / 2 + 0.4, roof, 0, deck + 1.85, -d / 4 - 0.1, 0.32);
  const r2 = tiltedBox(w + 0.5, 0.05, d / 2 + 0.4, roof, 0, deck + 1.85, d / 4 + 0.1, -0.32);
  g.add(r1, r2);
  g.position.set(x, WATER, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
}

/** The stilt village on the water, its fish-trap stakes and floating hyacinth. */
export function makoko(ctx: SetContext, P: BridgePalette, cx: number, cz: number, n: number): void {
  const r = artRng(919);
  const roofs = [
    mat(0x7a4a32, { map: corrugatedTexture(), roughness: 0.75, metalness: 0.4, flat: false }),
    mat(0x8e8a80, { map: corrugatedTexture(), roughness: 0.6, metalness: 0.5, flat: false }),
    mat(0x5e3a2a, { map: corrugatedTexture(), roughness: 0.8, metalness: 0.35, flat: false }),
  ];
  for (let i = 0; i < n; i++) {
    const x = cx + (r() - 0.5) * 22;
    const z = cz + (r() - 0.5) * 9;
    stiltHouse(ctx, P, roofs[i % 3]!, x, z, (r() - 0.5) * 0.5, 2.4 + r() * 1.6, 2.2 + r() * 1.2);
  }
  // rows of bamboo fish-trap stakes
  for (let row = 0; row < 6; row++) {
    const x0 = cx - 30 + r() * 60;
    const z0 = cz + 4 + r() * 6;
    const a = r() * Math.PI;
    for (let k = 0; k < 14; k++) {
      const h = 0.8 + r() * 0.9;
      ctx.statics.add(
        cyl(
          0.035,
          0.045,
          h,
          P.stake,
          x0 + Math.cos(a) * k * 0.7,
          WATER + h / 2 - 0.2,
          z0 + Math.sin(a) * k * 0.7,
          4,
        ),
      );
    }
  }
  // rafts of water hyacinth drifting on the current: clusters of low green clumps
  for (let i = 0; i < 12; i++) {
    const hx = cx - 30 + r() * 60;
    const hz = cz + 6 + r() * 10;
    for (let k = 0; k < 6; k++) {
      const c = sphere(
        0.35 + r() * 0.3,
        P.hyacinth,
        hx + (r() - 0.5) * 2.2,
        WATER,
        hz + (r() - 0.5) * 1.2,
        7,
      );
      c.scale.y = 0.35;
      ctx.statics.add(c);
    }
  }
}

/** A sand dredger: a rusted barge with a sand heap, a pump house and a crane jib. */
export function dredger(ctx: SetContext, P: BridgePalette, x: number, z: number, ry: number): void {
  const g = new Group();
  g.add(box(4.2, 0.8, 11, P.rust, 0, 0.2, 0));
  g.add(box(4.4, 0.12, 11.2, P.black, 0, 0.62, 0));
  const heap = cyl(0.2, 1.9, 1.5, P.sand, 0, 1.35, 1.2, 10);
  heap.scale.z = 2.2;
  g.add(heap);
  g.add(box(2.2, 1.6, 2.0, mat(0x8a8a84, { roughness: 0.7, metalness: 0.3 }), 0, 1.5, -4.0));
  g.add(cyl(0.12, 0.12, 1.3, P.black, 0.6, 2.9, -4.4, 6));
  g.add(bar(v3(-1.2, 0.7, -2.6), v3(-1.6, 4.2, 2.0), 0.08, P.rust, 6));
  g.add(bar(v3(-1.6, 4.2, 2.0), v3(-1.4, 0.8, 4.6), 0.02, P.steel, 3));
  g.position.set(x, WATER, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
  ctx.ambient.smokeColumn(x + 0.6, WATER + 3.6, z - 4.4, { shade: 0.3, size: 0.8, rate: 2 });
}

/** Lagos Island across the water: towers in the sunset haze (fog swallows them into silhouettes). */
export function skylineAcross(ctx: SetContext, P: BridgePalette, z: number): void {
  const facades = [0, 1, 2].map((k) => {
    const map = towerWindowsTexture(k + 4);
    const m = mat(0xc89a78, {
      map,
      emissive: 0xffc890,
      emissiveIntensity: 0.25,
      roughness: 0.3,
      metalness: 0.4,
      flat: false,
    });
    m.emissiveMap = map;
    return m;
  });
  const r = artRng(707);
  for (let i = 0; i < 16; i++) {
    const w = 4 + r() * 5;
    const d = 4 + r() * 4;
    const h = 10 + r() * 34;
    const x = -70 + i * 9 + (r() - 0.5) * 4;
    const zz = z - r() * 18;
    const t = box(w, h, d, facades[i % 3]!, x, WATER + h / 2, zz);
    uvScale(t.geometry, Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 6)));
    t.castShadow = false;
    ctx.statics.add(t);
  }
  // the low shoreline in front: mangrove and roofs
  ctx.statics.add(box(200, 1.6, 6, mat(0x3a4430, { roughness: 1 }), 0, WATER + 0.6, z + 6));
  void P;
}

// --------------------------------------------------------------------------------------- checkpoint

function stripesTexture(): CanvasTexture {
  return painted(
    'tm:stripes',
    128,
    32,
    (g, r) => {
      for (let k = 0; k < 8; k++) {
        g.fillStyle = k % 2 ? '#c8c2b2' : '#a42a1e';
        g.fillRect(k * 16, 0, 16, 32);
      }
      weather(g, r, 128, 32, 0.3);
    },
    false,
    91,
  );
}

/** A striped barrier arm on its counterweighted post, lowered across a lane from (x, z0) to z1. */
export function barrierArm(
  ctx: SetContext,
  P: BridgePalette,
  x: number,
  z0: number,
  z1: number,
  lift = 0,
): void {
  const s = ctx.statics;
  const len = Math.abs(z1 - z0);
  const dir = Math.sign(z1 - z0);
  s.add(box(0.4, 1.0, 0.4, P.white, x, STREET + 0.5, z0));
  s.add(box(0.44, 0.08, 0.44, P.red, x, STREET + 1.02, z0));
  const arm = new Group();
  arm.position.set(x, STREET + 0.95, z0);
  arm.rotation.x = -dir * lift;
  const m = mat(0xffffff, { map: stripesTexture(), roughness: 0.6, flat: false });
  const beam = box(0.09, 0.09, len, m, 0, 0, dir * (len / 2 + 0.15));
  uvScale(beam.geometry, Math.max(1, len / 1.6), 1);
  arm.add(beam);
  arm.add(box(0.22, 0.3, 0.4, P.black, 0, -0.05, -dir * 0.35)); // the counterweight
  arm.add(box(0.06, 0.25, 0.25, P.red, 0, -0.18, dir * (len - 0.2))); // a hanging stop plate
  s.add(arm);
  // the support fork at the far end
  s.add(box(0.08, 0.9, 0.08, P.steel, x, STREET + 0.45, z1));
  s.add(box(0.2, 0.06, 0.2, P.steel, x, STREET + 0.9, z1));
}

/** The sentry booth: a small steel cabin with windows all round, a roof and a sign. */
export function sentryBooth(
  ctx: SetContext,
  P: BridgePalette,
  L: SiteLights,
  x: number,
  z: number,
  ry: number,
  sign: CanvasTexture,
): void {
  const g = new Group();
  const w = 1.5;
  const h = 2.3;
  g.add(box(w + 0.2, 0.15, w + 0.2, P.deckDark, 0, 0.07, 0));
  g.add(box(w, 0.95, w, P.green, 0, 0.6, 0));
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    g.add(box(0.08, h - 1.0, 0.08, P.green, (sx * w) / 2, 1.08 + (h - 1.0) / 2 - 0.05, (sz * w) / 2));
  g.add(box(w - 0.1, h - 1.15, w - 0.1, P.glass, 0, 1.1 + (h - 1.15) / 2 - 0.05, 0));
  g.add(box(w + 0.35, 0.1, w + 0.35, P.white, 0, h + 0.05, 0));
  g.add(box(w + 0.1, 0.2, w + 0.1, P.green, 0, h - 0.05, 0));
  const m = mat(0xffffff, { map: sign, roughness: 0.8, flat: false });
  const plate = mesh(new PlaneGeometry(w + 0.2, 0.42), m, 0, h + 0.36, w / 2 + 0.1);
  g.add(plate);
  g.add(box(w + 0.22, 0.46, 0.05, P.steel, 0, h + 0.36, w / 2 + 0.06));
  g.add(box(0.18, 0.1, 0.1, lampMat(0xffe0b0, 2.2), 0.4, h - 0.2, w / 2 + 0.08)); // the booth lamp
  g.position.set(x, STREET, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
  g.updateMatrixWorld(true);
  const lamp = v3(0.4, h - 0.25, w / 2 + 0.15).applyMatrix4(g.matrixWorld);
  L.glow(lamp.x, lamp.y, lamp.z, 1.0, 0xffd090, 0.7);
}

/** A tyre-spike strip across a lane (z0..z1) at x. */
export function spikeStrip(ctx: SetContext, P: BridgePalette, x: number, z0: number, z1: number): void {
  const s = ctx.statics;
  const len = Math.abs(z1 - z0);
  s.add(box(0.14, 0.04, len, P.black, x, STREET + 0.02, (z0 + z1) / 2));
  for (let k = 0; k < len / 0.12; k++) {
    const z = Math.min(z0, z1) + 0.06 + k * 0.12;
    s.add(tiltedBox(0.03, 0.09, 0.03, P.chrome, x, STREET + 0.07, z, 0, 0, 0.5));
  }
}

/** Sandbags stacked into a low wall from (x0, z0) to (x1, z1), `rows` high. */
export function sandbagWall(
  ctx: SetContext,
  P: BridgePalette,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  rows: number,
): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
  const n = Math.max(1, Math.round(len / 0.55));
  const r = ctx.rng;
  for (let row = 0; row < rows; row++)
    for (let i = 0; i < n - (row % 2); i++) {
      const t = (i + 0.5 + (row % 2) * 0.5) / n;
      const b = tiltedBox(
        0.54,
        0.17,
        0.34,
        P.sandbag,
        x0 + (x1 - x0) * t,
        STREET + 0.085 + row * 0.16,
        z0 + (z1 - z0) * t,
        0,
        ry + (r() - 0.5) * 0.15,
        (r() - 0.5) * 0.08,
      );
      ctx.statics.add(b);
    }
}

// ------------------------------------------------------------------------------------- the trucks

/** Wheel with its axle along X. */
function wheel(g: Group, P: BridgePalette, x: number, z: number, r = 0.5): void {
  const t = cyl(r, r, 0.34, P.rubber, x, r, z, 14);
  t.rotation.z = Math.PI / 2;
  g.add(t);
  const hub = cyl(r * 0.5, r * 0.5, 0.36, P.steel, x, r, z, 8);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
}

/**
 * A cab-over prime mover (front +Z): chassis rails, a flat-fronted cab with a windscreen, grille,
 * bumper, headlights, sun visor, mirrors on arms and roof marker lamps, fuel tank, exhaust stack,
 * front axle and a tandem drive axle. Returns the group so the trailer can be added to it.
 */
function primeMover(P: BridgePalette, paint: Material, band: Material): Group {
  const g = new Group();
  g.add(box(0.9, 0.25, 6.2, P.black, 0, 0.75, -1.2)); // chassis rails
  // the cab: a tall flat-fronted box, its front slightly raked, a deflector on the roof
  const cab = tiltedBox(2.4, 1.85, 1.9, paint, 0, 2.05, 1.15, -0.04);
  g.add(cab);
  g.add(box(2.42, 0.42, 1.92, band, 0, 1.3, 1.15)); // the painted lower band
  g.add(box(2.44, 0.06, 1.94, P.black, 0, 1.53, 1.15)); // a pin stripe
  g.add(tiltedBox(2.1, 0.8, 0.04, P.glass, 0, 2.38, 2.11, -0.04)); // windscreen
  g.add(box(2.16, 0.06, 0.06, P.black, 0, 2.8, 2.12)); // its rubber frame
  g.add(box(2.16, 0.06, 0.06, P.black, 0, 1.96, 2.1));
  g.add(box(0.06, 0.82, 0.06, P.black, 0, 2.38, 2.13)); // the centre pillar
  for (const sx of [-1, 1]) {
    g.add(box(0.04, 0.6, 0.9, P.glass, sx * 1.21, 2.35, 1.45)); // side windows
    g.add(box(0.03, 1.5, 0.03, P.black, sx * 1.215, 1.9, 0.75)); // door seam
    g.add(box(0.05, 0.05, 0.16, P.chrome, sx * 1.23, 1.75, 1.0)); // door handle
    g.add(box(0.14, 0.42, 0.9, P.black, sx * 1.12, 0.9, 1.5)); // wheel arch
  }
  g.add(tiltedBox(2.2, 0.06, 0.9, paint, 0, 3.18, 1.25, 0.32)); // roof deflector
  g.add(box(2.3, 0.12, 0.28, paint, 0, 2.95, 2.1)); // sun visor
  for (let k = 0; k < 5; k++)
    g.add(box(0.12, 0.06, 0.06, lampMat(0xffa030, 1.4), -0.7 + k * 0.35, 3.03, 2.18));
  for (let k = 0; k < 6; k++) g.add(box(1.4, 0.05, 0.03, P.black, 0, 1.18 + k * 0.08, 2.15)); // grille slats
  g.add(box(2.45, 0.32, 0.25, P.chrome, 0, 0.72, 2.2)); // bumper
  for (const sx of [-0.95, 0.95]) {
    g.add(box(0.36, 0.2, 0.05, lampMat(0xfff0d0, 1.2), sx, 1.02, 2.15)); // headlights
    g.add(bar(v3(sx * 1.25, 2.6, 1.9), v3(sx * 1.55, 2.5, 2.05), 0.025, P.black, 4)); // mirror arm
    g.add(box(0.08, 0.38, 0.22, P.black, sx * 1.58, 2.3, 2.05)); // mirror
    g.add(box(0.12, 0.08, 0.5, P.black, sx * 1.22, 0.55, 1.4)); // step
    g.add(cyl(0.05, 0.07, 0.3, P.chrome, sx * 0.5, 3.12, 1.6, 6).rotateX(Math.PI / 2)); // air horns
  }
  const tank = cyl(0.3, 0.3, 1.1, P.chrome, 0.9, 0.7, -0.4, 12);
  tank.rotation.x = Math.PI / 2;
  g.add(tank);
  g.add(cyl(0.07, 0.07, 1.4, P.chrome, -1.0, 2.7, 0.1, 8)); // exhaust stack
  wheel(g, P, -1.05, 1.5);
  wheel(g, P, 1.05, 1.5);
  for (const z of [-1.1, -2.2]) {
    wheel(g, P, -1.05, z);
    wheel(g, P, 1.05, z);
  }
  for (const sx of [-1.05, 1.05]) g.add(box(0.4, 0.5, 0.03, P.black, sx, 0.45, -2.75)); // mud flaps
  g.add(box(1.2, 0.1, 1.2, P.steel, 0, 1.0, -1.6)); // the fifth wheel
  return g;
}

/** A painted tanker word ("INFLAMMABLE") texture. */
function tankerTexture(): CanvasTexture {
  return painted(
    'tm:tanker',
    512,
    128,
    (g, r) => {
      g.fillStyle = '#c8c2b4';
      g.fillRect(0, 0, 512, 128);
      g.fillStyle = '#9a2a1c';
      g.fillRect(0, 84, 512, 18);
      g.fillStyle = '#9a2a1c';
      g.font = 'bold 54px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('INFLAMMABLE', 256, 66);
      weather(g, r, 512, 128, 1.4);
    },
    false,
    93,
  );
}

/**
 * Heavy goods on the bridge: `kind` 'tanker' (a fuel tanker semi) or 'container' (a 20 ft box on a
 * flatbed). Placed with its front at +Z of the local frame; returns nothing (baked).
 */
export function truck(
  ctx: SetContext,
  P: BridgePalette,
  kind: 'tanker' | 'container',
  x: number,
  z: number,
  ry: number,
  paint: Material,
  band: Material,
  load?: Material,
): void {
  const g = primeMover(P, paint, band);
  const t = new Group();
  t.position.z = -1.6;
  if (kind === 'tanker') {
    t.add(box(1.0, 0.25, 8.2, P.black, 0, 1.0, -3.6));
    const tank = cyl(1.12, 1.12, 7.6, load ?? P.white, 0, 2.3, -3.6, 18);
    tank.rotation.x = Math.PI / 2;
    tank.scale.x = 1.06;
    t.add(tank);
    for (const zz of [0.2, -7.4]) {
      const cap = cyl(1.0, 1.0, 0.12, P.steel, 0, 2.3, zz, 18);
      cap.rotation.x = Math.PI / 2;
      t.add(cap);
    }
    // walkway and handrail on top, hatches, the rear ladder, side valves
    t.add(box(0.5, 0.05, 7.0, P.steel, 0, 3.45, -3.6));
    for (const zz of [-1.2, -3.6, -6.0]) t.add(cyl(0.28, 0.28, 0.14, P.steel, 0, 3.45, zz, 10));
    for (const sx of [-0.3, 0.3]) t.add(box(0.03, 0.03, 7.0, P.rail, sx, 3.9, -3.6));
    for (let k = 0; k < 6; k++)
      for (const sx of [-0.3, 0.3]) t.add(box(0.03, 0.45, 0.03, P.rail, sx, 3.67, -0.6 - k * 1.2));
    for (const sx of [-1.1, 1.1]) t.add(box(0.12, 0.12, 6.8, P.steel, sx, 1.2, -3.6)); // side guards
    const m = mat(0xffffff, { map: tankerTexture(), roughness: 0.7, flat: false });
    for (const side of [-1, 1]) {
      const p = mesh(new PlaneGeometry(4.2, 1.05), m, side * 1.2, 2.3, -3.6);
      p.rotation.y = (side * Math.PI) / 2;
      t.add(p);
    }
    t.add(bar(v3(-0.4, 1.2, -7.5), v3(-0.4, 3.45, -7.5), 0.03, P.steel, 4));
    t.add(bar(v3(0.0, 1.2, -7.5), v3(0.0, 3.45, -7.5), 0.03, P.steel, 4));
    for (const zz of [-6.0, -7.1]) {
      wheel(t, P, -1.05, zz);
      wheel(t, P, 1.05, zz);
    }
  } else {
    t.add(box(2.4, 0.2, 7.0, P.steel, 0, 1.2, -3.2)); // the flatbed
    t.add(box(1.0, 0.3, 7.0, P.black, 0, 0.95, -3.2));
    const cmap = corrugatedTexture().clone();
    cmap.needsUpdate = true;
    cmap.rotation = Math.PI / 2;
    cmap.repeat.set(1, 6);
    const cm = new MeshStandardMaterial({
      color: load ? (load as MeshStandardMaterial).color : 0x7a3a28,
      map: cmap,
      roughness: 0.7,
      metalness: 0.4,
    });
    ctx.own(cm);
    ctx.own(cmap);
    t.add(box(2.44, 2.55, 6.06, cm, 0, 2.6, -3.2));
    for (const zz of [-0.17, -6.23]) t.add(box(2.46, 2.57, 0.08, P.steel, 0, 2.6, zz)); // end frames
    for (let k = 0; k < 4; k++) t.add(box(0.04, 2.3, 0.04, P.steel, -0.6 + k * 0.4, 2.55, -6.28)); // door bars
    for (const zz of [-5.4, -6.5]) {
      wheel(t, P, -1.05, zz);
      wheel(t, P, 1.05, zz);
    }
  }
  g.add(t);
  g.position.set(x, STREET, z);
  g.rotation.y = ry;
  ctx.statics.add(g);
  g.updateMatrixWorld(true);
  const pipe = v3(-1.0, 3.4, 0.1).applyMatrix4(g.matrixWorld);
  ctx.ambient.exhaust(pipe.x, pipe.y, pipe.z, 0, 1);
}
