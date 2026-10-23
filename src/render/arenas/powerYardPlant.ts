/**
 * Surulere Power Yard plant (presentation only): oil-filled power transformers with radiator banks,
 * conservators and porcelain bushings; containerised diesel generator sets with exhaust stacks;
 * switchgear cabinets; wooden cable drums; a pole-mounted transformer on an H-pole; concrete
 * line poles with crossarms and insulators; a chain-link security fence topped with barbed wire; a
 * bunded diesel tank; the control room. Each piece is built from primitives in a local frame (front
 * +Z, ground y = 0) and dropped at the street level into the baked statics; lamps, beacons and arcs go
 * through `SiteLights`.
 */
import { DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import type { CanvasTexture, Material, Vector3 } from 'three';
import { box, cyl, mat, mesh, torus } from '../assets/helpers';
import type { SetContext } from './common';
import { STREET } from './common';
import type { SiteLights } from './roadworksKit';
import { bar, lampMat, tiltedBox, uvScale, v3 } from './roadworksKit';
import { painted, signTexture, weather } from './oshodiKit';

export function plantPalette() {
  return {
    tank: mat(0x5e6a62, { roughness: 0.55, metalness: 0.35 }), // transformer grey-green
    tankDark: mat(0x3c4440, { roughness: 0.6, metalness: 0.35 }),
    porcelain: mat(0x6a3a26, { roughness: 0.25, metalness: 0.05, flat: false }), // brown glazed insulators
    porcelainGrey: mat(0x9a9a94, { roughness: 0.25, metalness: 0.05, flat: false }),
    copper: mat(0x9a6038, { roughness: 0.35, metalness: 0.8 }),
    galv: mat(0x8c908e, { roughness: 0.45, metalness: 0.7 }),
    steel: mat(0x50524e, { roughness: 0.5, metalness: 0.6 }),
    cabinet: mat(0x7e8a84, { roughness: 0.5, metalness: 0.4 }),
    canopy: mat(0x2e4e3c, { roughness: 0.5, metalness: 0.35 }), // genset canopy green
    canopyAlt: mat(0xd8a42a, { roughness: 0.5, metalness: 0.25 }), // genset canopy safety yellow
    engine: mat(0xa88218, { roughness: 0.45, metalness: 0.4 }),
    black: mat(0x1a1a1a, { roughness: 0.7, metalness: 0.3 }),
    rubber: mat(0x141414, { roughness: 0.9 }),
    cable: mat(0x161616, { roughness: 0.6 }),
    wood: mat(0x7a5a3a, { roughness: 0.95 }),
    woodDark: mat(0x5a4230, { roughness: 0.95 }),
    concrete: mat(0x8a867e, { roughness: 1 }),
    concreteDark: mat(0x625e58, { roughness: 1 }),
    gravel: mat(0x6e6a64, { roughness: 1, flat: false }),
    cream: mat(0xb4ab92, { roughness: 0.9 }),
    red: mat(0x8e2a20, { roughness: 0.6 }),
    yellow: mat(0xc09a20, { roughness: 0.55 }),
    blueDrum: mat(0x2a4c80, { roughness: 0.55, metalness: 0.35 }),
    redDrum: mat(0x8a2a1e, { roughness: 0.55, metalness: 0.35 }),
    rust: mat(0x6e4028, { roughness: 0.85, metalness: 0.35 }),
    glass: mat(0x1e262a, { roughness: 0.15, metalness: 0.5 }),
  };
}
export type PlantPalette = ReturnType<typeof plantPalette>;

export interface Pose {
  x: number;
  z: number;
  ry: number;
}

function place(ctx: SetContext, g: Group, at: Pose, y = STREET, parent?: Group): Group {
  g.position.set(at.x, y, at.z);
  g.rotation.y = at.ry;
  (parent ?? ctx.statics).add(g);
  return g;
}

function worldOf(g: Group, p: Vector3): Vector3 {
  g.updateWorldMatrix(true, false);
  return p.clone().applyMatrix4(g.matrixWorld);
}

/** An axle-along-X drum / wheel. */
function drumX(r: number, w: number, m: Material, x: number, y: number, z: number, seg = 16): Mesh {
  const c = cyl(r, r, w, m, x, y, z, seg);
  c.rotation.z = Math.PI / 2;
  return c;
}

/** A stack of porcelain insulator sheds (a bushing / post insulator) standing on `y`. */
function insulator(
  g: Group,
  m: Material,
  x: number,
  y: number,
  z: number,
  h: number,
  r = 0.09,
  tilt = 0,
): void {
  const holder = new Group();
  holder.position.set(x, y, z);
  holder.rotation.z = tilt;
  holder.add(cyl(r * 0.55, r * 0.6, h, m, 0, h / 2, 0, 8));
  const n = Math.max(3, Math.round(h / 0.11));
  for (let k = 0; k < n; k++) holder.add(cyl(r, r * 1.05, 0.035, m, 0, 0.06 + (k * (h - 0.1)) / n, 0, 10));
  holder.add(cyl(0.03, 0.03, 0.1, mat(0x9a9890, { roughness: 0.4, metalness: 0.8 }), 0, h + 0.05, 0, 6));
  g.add(holder);
}

/** Painted danger boards (red band, lightning bolt, voltage). */
export function dangerTexture(kind: 'hv' | 'fuel' | 'auth' | 'control'): CanvasTexture {
  if (kind === 'fuel')
    return signTexture('py:fuel', 256, 160, {
      bg: '#d8d0b8',
      fg: '#1c1a16',
      band: { color: '#9a2a1c', text: 'DIESEL', fg: '#efe6d0' },
      lines: [
        ['NO SMOKING', 30],
        ['NO NAKED FLAME', 26],
      ],
    });
  if (kind === 'auth')
    return signTexture('py:auth', 256, 160, {
      bg: '#d8d0b8',
      fg: '#1c1a16',
      band: { color: '#1c3c6c', text: 'NOTICE', fg: '#efe6d0' },
      lines: [
        ['AUTHORISED', 30],
        ['PERSONNEL ONLY', 26],
      ],
    });
  if (kind === 'control')
    return signTexture('py:control', 512, 128, {
      bg: '#2c4c3c',
      fg: '#e6e0cc',
      lines: [
        ['SURULERE 33/11kV INJECTION', 34],
        ['CONTROL ROOM', 30],
      ],
      wear: 1.2,
    });
  return painted(
    'py:hv',
    256,
    192,
    (g, r) => {
      g.fillStyle = '#ddd6c2';
      g.fillRect(0, 0, 256, 192);
      g.fillStyle = '#a82a1c';
      g.fillRect(0, 0, 256, 58);
      g.fillStyle = '#f2ead6';
      g.font = 'bold 42px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('DANGER', 128, 31);
      // the lightning bolt
      g.fillStyle = '#1a1814';
      g.beginPath();
      g.moveTo(52, 66);
      g.lineTo(30, 122);
      g.lineTo(46, 122);
      g.lineTo(28, 180);
      g.lineTo(72, 110);
      g.lineTo(55, 110);
      g.lineTo(72, 66);
      g.closePath();
      g.fill();
      g.font = 'bold 30px system-ui, sans-serif';
      g.fillText('11,000', 160, 92);
      g.fillText('VOLTS', 160, 126);
      g.font = 'bold 22px system-ui, sans-serif';
      g.fillText('KEEP OFF', 160, 162);
      weather(g, r, 256, 192, 0.8);
    },
    false,
    61,
  );
}

/** A danger board on its own (fixed to a fence, cabinet or wall). */
export function plate(
  parent: Group,
  map: CanvasTexture,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  ry = 0,
): void {
  const m = mat(0xffffff, { map, roughness: 0.75, flat: false });
  const p = mesh(new PlaneGeometry(w, h), m, x, y, z);
  p.rotation.y = ry;
  parent.add(p);
}

/**
 * An oil-filled power transformer on its plinth: the main tank with stiffening ribs, banks of
 * radiator fins either side, the conservator on its pipe, three brown HV bushings and the LV
 * bushings, the tap changer cabinet, and the HV leads rising off the bushings. Returns the world
 * tips of the HV bushings (for the overhead leads).
 */
export function powerTransformer(ctx: SetContext, P: PlantPalette, at: Pose, scale = 1): Vector3[] {
  const g = new Group();
  g.add(box(3.6, 0.35, 2.4, P.concreteDark, 0, 0.17, 0)); // plinth
  g.add(box(2.2, 1.95, 1.4, P.tank, 0, 0.35 + 0.98, 0));
  for (let k = -2; k <= 2; k++) g.add(box(0.06, 1.95, 1.46, P.tankDark, k * 0.45, 1.33, 0)); // ribs
  g.add(box(2.3, 0.08, 1.5, P.tankDark, 0, 2.33, 0)); // the cover flange
  // radiator banks: rows of thin fins on headers either side
  for (const sx of [-1, 1]) {
    const bx = sx * 1.42;
    g.add(cyl(0.06, 0.06, 1.1, P.tankDark, sx * 1.14, 2.05, 0, 6).rotateZ(Math.PI / 2) as Mesh);
    g.add(box(0.5, 0.08, 1.2, P.tankDark, bx, 2.1, 0));
    g.add(box(0.5, 0.08, 1.2, P.tankDark, bx, 0.6, 0));
    for (let k = 0; k < 9; k++) g.add(box(0.46, 1.5, 0.025, P.tank, bx, 1.35, -0.55 + k * 0.137));
  }
  // conservator tank on its stand, pipe to the cover
  const cons = cyl(0.28, 0.28, 1.5, P.tank, 0, 2.95, -0.45, 14);
  cons.rotation.z = Math.PI / 2;
  g.add(cons);
  for (const sx of [-0.55, 0.55]) g.add(box(0.06, 0.6, 0.06, P.steel, sx, 2.6, -0.45));
  g.add(bar(v3(0.3, 2.37, -0.3), v3(0.3, 2.75, -0.45), 0.04, P.steel, 6));
  // tap changer cabinet and a nameplate
  g.add(box(0.5, 0.8, 0.3, P.tankDark, 0.75, 1.0, 0.82));
  g.add(box(0.3, 0.2, 0.02, P.galv, -0.5, 1.6, 0.71));
  // bushings: three tall HV (brown porcelain) and four short LV
  const tips: Vector3[] = [];
  for (const bx of [-0.65, 0, 0.65]) {
    insulator(g, P.porcelain, bx, 2.37, 0.25, 0.95, 0.1);
    tips.push(v3(bx, 3.37, 0.25));
  }
  for (const bx of [-0.6, -0.2, 0.2, 0.6]) insulator(g, P.porcelainGrey, bx, 2.37, -0.15, 0.32, 0.06);
  // oil-stained gravel bed and a fence-off chain around the plinth
  g.add(box(4.2, 0.08, 3.0, P.gravel, 0, 0.04, 0));
  g.scale.setScalar(scale);
  place(ctx, g, at);
  return tips.map((t) => worldOf(g, t));
}

/**
 * A containerised diesel generator set (500 kVA class): sound-attenuated canopy with louvres,
 * door seams and handles, a radiator grille at the front, a silencer and exhaust stack on the roof
 * with a rain cap, a control panel window, fuel and cable entries, yellow-black base stripes.
 * `open` swings one side door to show the yellow engine. Returns the exhaust tip.
 */
export function generatorContainer(
  ctx: SetContext,
  P: PlantPalette,
  L: SiteLights,
  at: Pose,
  o: { len?: number; paint?: Material; open?: boolean; label?: CanvasTexture } = {},
): Vector3 {
  const g = new Group();
  const len = o.len ?? 5.0;
  const w = 2.2;
  const h = 2.35;
  const paint = o.paint ?? P.canopy;
  g.add(box(w + 0.1, 0.22, len + 0.1, P.black, 0, 0.11, 0)); // the skid / fuel base
  // hazard stripes along the base
  for (let k = 0; k < Math.floor(len / 0.4); k++)
    g.add(
      tiltedBox(
        0.16,
        0.12,
        0.02,
        P.yellow,
        w / 2 + 0.06,
        0.11,
        -len / 2 + 0.2 + k * 0.4,
        0,
        Math.PI / 2,
        0.6,
      ),
    );
  g.add(box(w, h, len, paint, 0, 0.22 + h / 2, 0));
  g.add(box(w + 0.04, 0.06, len + 0.04, P.steel, 0, 0.22 + h + 0.03, 0));
  // door seams and handles on both long sides; louvre panels
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const z = -len / 2 + 0.7 + k * ((len - 1.4) / 3);
      g.add(box(0.02, h - 0.3, 0.03, P.black, sx * (w / 2 + 0.005), 0.22 + h / 2, z));
      g.add(box(0.04, 0.2, 0.04, P.galv, sx * (w / 2 + 0.02), 1.3, z + 0.25));
    }
    for (let k = 0; k < 8; k++)
      g.add(box(0.03, 0.04, 0.9, P.black, sx * (w / 2 + 0.01), 1.8 + k * 0.07, -len / 2 + 0.75));
  }
  // radiator grille at the front (+Z) and the air intake louvres at the back
  for (let k = 0; k < 12; k++) g.add(box(w - 0.3, 0.05, 0.04, P.black, 0, 0.5 + k * 0.15, len / 2 + 0.01));
  for (let k = 0; k < 10; k++) g.add(box(w - 0.4, 0.05, 0.04, P.black, 0, 0.6 + k * 0.14, -len / 2 - 0.01));
  // control panel window and an emergency stop
  g.add(box(0.03, 0.5, 0.6, P.glass, w / 2 + 0.01, 1.4, len / 2 - 1.2));
  g.add(box(0.03, 0.4, 0.5, lampMat(0x7cffa0, 0.6), w / 2 + 0.015, 1.4, len / 2 - 1.2));
  g.add(cyl(0.06, 0.06, 0.04, P.red, w / 2 + 0.03, 1.0, len / 2 - 1.2, 8).rotateZ(Math.PI / 2) as Mesh);
  // the roof: silencer drum, exhaust stack and rain cap, lifting eyes
  const sil = cyl(0.3, 0.3, 1.6, P.rust, 0, 0.22 + h + 0.4, -0.6, 12);
  sil.rotation.x = Math.PI / 2;
  g.add(sil);
  g.add(cyl(0.11, 0.11, 1.2, P.rust, 0, 0.22 + h + 0.9, -1.5, 8));
  g.add(tiltedBox(0.28, 0.02, 0.28, P.rust, 0, 0.22 + h + 1.53, -1.46, 0.6));
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    g.add(box(0.12, 0.1, 0.12, P.steel, sx * (w / 2 - 0.15), 0.22 + h + 0.08, sz * (len / 2 - 0.15)));
  // roof panels, the radiator fan guards over the front end and a cable tray along one edge
  for (let k = 1; k < 5; k++)
    g.add(box(w - 0.1, 0.03, 0.04, P.black, 0, 0.22 + h + 0.065, -len / 2 + (k * len) / 5));
  for (const fz of [len / 2 - 0.75, len / 2 - 1.75]) {
    g.add(cyl(0.42, 0.42, 0.06, P.black, 0, 0.22 + h + 0.08, fz, 16));
    for (let k = 0; k < 4; k++) {
      const spoke = box(0.84, 0.03, 0.04, P.galv, 0, 0.22 + h + 0.12, fz);
      spoke.rotation.y = (k * Math.PI) / 4;
      g.add(spoke);
    }
    g.add(torus(0.42, 0.025, P.galv, 0, 0.22 + h + 0.12, fz).rotateX(Math.PI / 2));
  }
  g.add(box(0.25, 0.08, len - 0.6, P.galv, -w / 2 + 0.2, 0.22 + h + 0.1, 0));
  // an open side door showing the engine
  if (o.open) {
    const door = box(0.04, h - 0.35, 1.1, paint, w / 2 + 0.55, 0.22 + h / 2, 0.75);
    door.rotation.y = -1.1;
    g.add(door);
    g.add(box(0.02, h - 0.35, 1.0, P.black, w / 2 + 0.004, 0.22 + h / 2, 0.3)); // the opening
    g.add(box(0.5, 0.75, 0.8, P.engine, w / 2 - 0.3, 0.8, 0.3)); // the engine block glimpsed inside
  }
  if (o.label) plate(g, o.label, 0.8, 0.5, w / 2 + 0.02, 1.85, len / 2 - 2.2, Math.PI / 2);
  place(ctx, g, at);
  const tip = worldOf(g, v3(0, 0.22 + h + 1.5, -1.5));
  ctx.ambient.smokeColumn(tip.x, tip.y, tip.z, { shade: 0.22, size: 0.55, rate: 4 });
  const beacon = worldOf(g, v3(w / 2 - 0.25, 0.22 + h + 0.16, len / 2 - 0.3));
  g.add(cyl(0.07, 0.08, 0.14, lampMat(0xffa020, 1.6), w / 2 - 0.25, 0.22 + h + 0.1, len / 2 - 0.3, 8));
  L.beacon(beacon.x, beacon.y + 0.05, beacon.z, 0xffa030, 0.9);
  return tip;
}

/** A row of switchgear / ring-main cabinets on a plinth, doors facing +Z, danger plates. */
export function switchgearRow(
  ctx: SetContext,
  P: PlantPalette,
  at: Pose,
  n: number,
  hv: CanvasTexture,
): void {
  const g = new Group();
  const w = 1.0;
  g.add(box(n * (w + 0.06) + 0.3, 0.2, 1.0, P.concreteDark, 0, 0.1, 0));
  for (let k = 0; k < n; k++) {
    const x = (k - (n - 1) / 2) * (w + 0.06);
    const h = k % 3 === 1 ? 1.75 : 1.55;
    g.add(box(w, h, 0.7, P.cabinet, x, 0.2 + h / 2, 0));
    g.add(box(w + 0.06, 0.05, 0.78, P.steel, x, 0.2 + h + 0.02, 0)); // drip hood
    g.add(box(0.02, h - 0.25, 0.02, P.black, x, 0.2 + h / 2, 0.355)); // door split
    for (const hx of [-0.08, 0.08]) g.add(box(0.03, 0.12, 0.03, P.galv, x + hx, 0.2 + h * 0.55, 0.37));
    for (let v = 0; v < 4; v++) g.add(box(0.5, 0.025, 0.02, P.black, x, 0.4 + v * 0.06, 0.355)); // vents
    g.add(box(0.12, 0.08, 0.02, lampMat(k % 2 ? 0xff4030 : 0x50ff70, 0.9), x + 0.32, 0.2 + h - 0.2, 0.36));
    if (k % 2 === 0) plate(g, hv, 0.36, 0.27, x - 0.22, 0.2 + h * 0.62, 0.362);
  }
  place(ctx, g, at);
}

/** A steel safety bollard painted yellow with black bands (around plant and tanks). */
export function bollard(ctx: SetContext, P: PlantPalette, x: number, z: number): void {
  const g = new Group();
  g.add(cyl(0.09, 0.09, 0.95, P.yellow, 0, 0.475, 0, 10));
  for (const y of [0.3, 0.62]) g.add(cyl(0.093, 0.093, 0.12, P.black, 0, y, 0, 10));
  g.add(cyl(0.1, 0.1, 0.04, P.black, 0, 0.96, 0, 10));
  place(ctx, g, { x, z, ry: 0 });
}

/** A wooden cable drum (axle along X), black cable wound on, standing or lying on its flange. */
export function cableDrum(
  ctx: SetContext,
  P: PlantPalette,
  at: Pose,
  r = 0.75,
  w = 0.8,
  lying = false,
): void {
  const g = new Group();
  const inner = new Group();
  for (const sx of [-1, 1]) {
    inner.add(drumX(r, 0.06, sx < 0 ? P.wood : P.woodDark, (sx * w) / 2, 0, 0, 18));
    // battens across the flange face
    for (let k = 0; k < 3; k++) {
      const b = box(0.02, r * 1.9, 0.12, P.woodDark, sx * (w / 2 + 0.035), 0, 0);
      b.rotation.x = (k * Math.PI) / 3;
      inner.add(b);
    }
  }
  inner.add(drumX(r * 0.72, w - 0.04, P.cable, 0, 0, 0, 18));
  inner.add(drumX(0.09, w + 0.2, P.steel, 0, 0, 0, 8));
  if (lying) {
    inner.rotation.z = Math.PI / 2;
    inner.position.y = w / 2 + 0.03;
  } else inner.position.y = r;
  g.add(inner);
  place(ctx, g, at);
}

/** A concrete line pole with a crossarm, pin insulators and (optionally) a second arm. Returns arm tips. */
export function linePole(
  ctx: SetContext,
  P: PlantPalette,
  x: number,
  z: number,
  h: number,
  ry: number,
  arms = 1,
): Vector3[] {
  const g = new Group();
  const pole = cyl(0.1, 0.16, h, P.concrete, 0, h / 2, 0, 8);
  uvScale(pole.geometry, 1, 3);
  g.add(pole);
  const tips: Vector3[] = [];
  for (let a = 0; a < arms; a++) {
    const y = h - 0.25 - a * 0.9;
    g.add(box(2.0, 0.1, 0.1, P.galv, 0, y, 0));
    g.add(bar(v3(-0.6, y - 0.02, 0), v3(0, y - 0.6, 0), 0.02, P.galv, 4)); // strut
    g.add(bar(v3(0.6, y - 0.02, 0), v3(0, y - 0.6, 0), 0.02, P.galv, 4));
    for (const ix of [-0.9, 0, 0.9]) {
      insulator(g, P.porcelainGrey, ix, y + 0.05, 0, 0.2, 0.05);
      tips.push(v3(ix, y + 0.27, 0));
    }
  }
  place(ctx, g, { x, z, ry });
  return tips.map((t) => worldOf(g, t));
}

/**
 * The pole-mounted distribution transformer: two concrete poles with a steel platform carrying the
 * pot transformer, drop-out fuses on the crossarm above, a disconnector, an earth wire, danger
 * plates. A faulty fuse holder arcs (`L.beacon` arc). Returns the crossarm tips.
 */
export function hPoleTransformer(
  ctx: SetContext,
  P: PlantPalette,
  L: SiteLights,
  at: Pose,
  hv: CanvasTexture,
): Vector3[] {
  const g = new Group();
  const h = 6.2;
  for (const sx of [-0.9, 0.9]) {
    const pole = cyl(0.11, 0.17, h, P.concrete, sx, h / 2, 0, 8);
    uvScale(pole.geometry, 1, 3);
    g.add(pole);
  }
  // platform and the pot transformer with its fins and bushings
  g.add(box(2.3, 0.08, 0.9, P.galv, 0, 2.9, 0));
  for (const sx of [-1.1, 1.1]) g.add(bar(v3(sx, 2.9, 0.4), v3(sx * 0.8, 2.3, 0.05), 0.025, P.galv, 4));
  g.add(cyl(0.42, 0.42, 1.1, P.tank, 0, 3.5, 0, 14));
  g.add(cyl(0.44, 0.44, 0.06, P.tankDark, 0, 4.06, 0, 14));
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const f = box(0.18, 0.85, 0.025, P.tankDark, Math.sin(a) * 0.5, 3.45, Math.cos(a) * 0.5);
    f.rotation.y = a;
    g.add(f);
  }
  for (const bx of [-0.22, 0, 0.22]) insulator(g, P.porcelainGrey, bx, 4.09, 0, 0.28, 0.05);
  // crossarm with three drop-out fuses (one hanging open and arcing)
  const armY = h - 0.4;
  g.add(box(2.6, 0.12, 0.12, P.galv, 0, armY, 0));
  g.add(box(2.6, 0.1, 0.1, P.galv, 0, armY - 1.0, 0));
  const tips: Vector3[] = [];
  for (const [k, ix] of [-0.9, 0, 0.9].entries()) {
    insulator(g, P.porcelainGrey, ix, armY + 0.06, 0, 0.24, 0.05);
    tips.push(v3(ix, armY + 0.32, 0));
    const fuse = tiltedBox(
      0.05,
      0.55,
      0.05,
      k === 2 ? P.black : P.porcelainGrey,
      ix,
      armY - 0.65,
      0.12,
      0,
      0,
      k === 2 ? 0.7 : 0.15,
    );
    g.add(fuse);
    g.add(bar(v3(ix, armY - 0.95, 0.1), v3(ix * 0.25, 4.38, 0.02), 0.012, P.copper, 3)); // jumper down to the pot
  }
  // the disconnector handle and earth wire down the pole, danger plate, anti-climb barbs
  g.add(bar(v3(0.9, 0.9, 0.16), v3(0.9, armY - 1.0, 0.16), 0.015, P.galv, 4));
  g.add(bar(v3(-0.9, 0.2, 0.17), v3(-0.9, 2.9, 0.17), 0.01, P.copper, 3));
  plate(g, hv, 0.42, 0.32, -0.9, 2.1, 0.19);
  for (const sx of [-0.9, 0.9])
    for (let k = 0; k < 6; k++)
      g.add(tiltedBox(0.32, 0.015, 0.015, P.steel, sx, 2.5 + (k % 2) * 0.06, 0, 0, (k * Math.PI) / 3, 0.3));
  place(ctx, g, at);
  const arc = worldOf(g, v3(0.9 + 0.25, armY - 0.85, 0.16));
  L.beacon(arc.x, arc.y, arc.z, 0xa8dcff, 1.8, 'arc');
  L.glow(arc.x, arc.y, arc.z, 0.9, 0x9ad0ff, 0.6);
  return tips.map((t) => worldOf(g, t));
}

/** A chain-link mesh texture with alpha (1 repeat = 0.5 m). */
function chainLinkTexture(): CanvasTexture {
  return painted(
    'py:chainlink',
    128,
    128,
    (g) => {
      g.clearRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(170,174,170,1)';
      g.lineWidth = 3;
      for (let k = -128; k < 256; k += 32) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k + 128, 128);
        g.moveTo(k + 128, 0);
        g.lineTo(k, 128);
        g.stroke();
      }
    },
    true,
    71,
  );
}

/**
 * A chain-link security fence along a polyline at the street level: galvanised posts, top rail,
 * V-arms carrying three strands of barbed wire, the mesh drawn as an alpha-tested texture.
 */
export function securityFence(ctx: SetContext, P: PlantPalette, pts: [number, number][], h = 2.2): void {
  const map = chainLinkTexture();
  const mesh_ = new MeshStandardMaterial({
    color: 0x9a9e9a,
    map,
    alphaTest: 0.45,
    transparent: false,
    side: DoubleSide,
    roughness: 0.5,
    metalness: 0.6,
  });
  ctx.own(mesh_);
  const s = ctx.statics;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const ry = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    const panel = new Mesh(uvScale(new PlaneGeometry(len, h - 0.1), len / 0.5, (h - 0.1) / 0.5), mesh_);
    panel.position.set(cx, STREET + 0.05 + (h - 0.1) / 2, cz);
    panel.rotation.y = ry;
    panel.castShadow = true;
    panel.receiveShadow = true;
    s.add(panel);
    const rail = box(len, 0.05, 0.05, P.galv, cx, STREET + h, cz);
    rail.rotation.y = ry;
    s.add(rail);
    const n = Math.max(1, Math.round(len / 2.5));
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const z = az + ((bz - az) * k) / n;
      s.add(cyl(0.035, 0.035, h + 0.05, P.galv, x, STREET + h / 2, z, 6));
      // V-arm for the barbed wire
      for (const side of [-1, 1]) {
        s.add(
          bar(
            v3(x, STREET + h, z),
            v3(
              x + Math.sin(ry + Math.PI / 2) * side * 0.25,
              STREET + h + 0.35,
              z + Math.cos(ry + Math.PI / 2) * side * 0.25,
            ),
            0.012,
            P.galv,
            3,
          ),
        );
      }
    }
    for (const [side, dy] of [
      [-1, 0.32],
      [1, 0.32],
      [0, 0.12],
    ] as const) {
      const ox = Math.sin(ry + Math.PI / 2) * side * 0.23;
      const oz = Math.cos(ry + Math.PI / 2) * side * 0.23;
      s.add(
        bar(v3(ax + ox, STREET + h + dy, az + oz), v3(bx + ox, STREET + h + dy, bz + oz), 0.008, P.steel, 3),
      );
    }
  }
}

/** A horizontal diesel tank on concrete saddles inside a low bund wall, with a pump and hose. */
export function dieselTank(ctx: SetContext, P: PlantPalette, at: Pose, fuel: CanvasTexture): void {
  const g = new Group();
  const len = 4.0;
  // the bund: a low wall around an oily floor
  g.add(box(2.6, 0.06, len + 0.8, P.concreteDark, 0, 0.03, 0));
  for (const sx of [-1, 1]) g.add(box(0.2, 0.5, len + 0.8, P.concrete, sx * 1.3, 0.25, 0));
  for (const sz of [-1, 1]) g.add(box(2.6, 0.5, 0.2, P.concrete, 0, 0.25, sz * (len / 2 + 0.4)));
  for (const sz of [-1.2, 1.2]) g.add(box(1.4, 0.55, 0.35, P.concrete, 0, 0.32, sz));
  const tank = cyl(0.8, 0.8, len, P.cream, 0, 1.4, 0, 18);
  tank.rotation.x = Math.PI / 2;
  g.add(tank);
  for (const sz of [-len / 2, len / 2]) {
    const cap = cyl(0.8, 0.8, 0.04, P.steel, 0, 1.4, sz, 18);
    cap.rotation.x = Math.PI / 2;
    g.add(cap);
  }
  for (const sz of [-1.5, -0.5, 0.5, 1.5]) {
    const band = cyl(0.81, 0.81, 0.06, P.rust, 0, 1.4, sz, 18);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  }
  g.add(box(0.5, 0.15, 0.5, P.steel, 0, 2.25, 0.6)); // manhole
  g.add(cyl(0.04, 0.04, 0.6, P.steel, 0.2, 2.5, -1.2, 6)); // vent
  g.add(bar(v3(-0.5, 2.2, -0.9), v3(-1.2, 0.5, -0.9), 0.025, P.steel, 4)); // ladder rails
  g.add(bar(v3(-0.75, 2.2, -0.9), v3(-1.45, 0.5, -0.9), 0.025, P.steel, 4));
  for (let k = 1; k < 6; k++) {
    const t = k / 6;
    g.add(
      bar(
        v3(-0.5 - t * 0.7, 2.2 - t * 1.7, -0.9),
        v3(-0.75 - t * 0.7, 2.2 - t * 1.7, -0.9),
        0.015,
        P.steel,
        3,
      ),
    );
  }
  plate(g, fuel, 1.0, 0.62, 0.81, 1.45, 0.4, Math.PI / 2);
  // the transfer pump and its hose snaking to the gensets
  g.add(box(0.5, 0.45, 0.4, P.red, 1.75, 0.22, 1.6));
  g.add(bar(v3(1.75, 0.3, 1.4), v3(1.6, 0.03, 0.2), 0.04, P.rubber, 5));
  place(ctx, g, at);
}

/** The control room: a single-storey block with a steel door, barred windows, an AC unit and its sign. */
export function controlRoom(
  ctx: SetContext,
  P: PlantPalette,
  L: SiteLights,
  at: Pose,
  sign: CanvasTexture,
  auth: CanvasTexture,
): void {
  const g = new Group();
  const w = 4.2;
  const d = 3.0;
  const h = 2.9;
  g.add(box(w, h, d, P.cream, 0, h / 2, 0));
  g.add(box(w + 0.3, 0.18, d + 0.3, P.concreteDark, 0, h + 0.09, 0)); // the roof slab
  g.add(box(w + 0.02, 0.5, d + 0.02, mat(0x5a6e5c, { roughness: 0.9 }), 0, 0.25, 0)); // painted plinth band
  // door and windows on the front (+Z)
  g.add(box(0.95, 2.05, 0.06, P.steel, -1.1, 1.03, d / 2 + 0.02));
  g.add(box(0.06, 0.3, 0.06, P.galv, -0.75, 1.0, d / 2 + 0.07));
  for (const wx of [0.4, 1.4]) {
    g.add(box(0.8, 0.9, 0.04, P.glass, wx, 1.65, d / 2 + 0.01));
    for (let k = 0; k < 5; k++)
      g.add(box(0.025, 0.9, 0.025, P.steel, wx - 0.32 + k * 0.16, 1.65, d / 2 + 0.05));
  }
  // split AC unit, cable tray into the wall, the sign over the door, a notice beside it
  g.add(box(0.8, 0.55, 0.32, mat(0xb6b4ac, { roughness: 0.6 }), 1.0, 0.8, d / 2 + 0.22));
  g.add(box(0.25, 0.25, 1.2, P.galv, -w / 2 + 0.3, h - 0.3, d / 2 + 0.6));
  plate(g, sign, 2.6, 0.65, 0.4, h - 0.5, d / 2 + 0.03);
  plate(g, auth, 0.5, 0.31, -0.3, 1.4, d / 2 + 0.03);
  g.add(box(0.2, 0.1, 0.12, lampMat(0xfff4dc, 1.5), -1.1, 2.3, d / 2 + 0.08)); // bulkhead lamp
  place(ctx, g, at);
  void L;
}
