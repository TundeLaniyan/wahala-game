/**
 * Lekki Roadworks plant (presentation only): a tracked excavator, a single-drum roller, a site
 * concrete mixer, a canopied generator set, a skip of rubble, a towable lighting tower and a tar
 * boiler. Every machine is built from primitives in a local frame (front +Z, ground y = 0), dropped
 * into the baked statics at the street level; lamps and beacons go through `SiteLights`.
 */
import { BoxGeometry, CylinderGeometry, Group, LatheGeometry, Vector2 } from 'three';
import type { Material, Vector3 } from 'three';
import { box, cyl, mesh } from '../assets/helpers';
import type { SetContext } from './common';
import { STREET } from './common';
import type { SitePalette, SiteLights } from './roadworksKit';
import { bar, beam, lampMat, mound, tiltedBox, v3 } from './roadworksKit';

/** A wheel / roller / drum whose axle runs along X. */
function axleX(r: number, w: number, m: Material, x: number, y: number, z: number, seg = 14) {
  const c = cyl(r, r, w, m, x, y, z, seg);
  c.rotation.z = Math.PI / 2;
  return c;
}

/** World position of a point given in a machine's local frame. */
function toWorld(g: Group, p: Vector3): Vector3 {
  g.updateWorldMatrix(true, false);
  return p.clone().applyMatrix4(g.matrixWorld);
}

export interface Pose {
  x: number;
  z: number;
  ry: number;
}

/**
 * A 20-tonne class tracked excavator: stadium tracks with grousers, sprockets and idlers, a slew
 * ring, the upper house with counterweight, engine hood, exhaust and handrails, a glazed cab with
 * roof lamps and a beacon, and a two-piece banana boom, stick and toothed bucket with chrome-rod
 * rams. `slew` turns the upper house against the tracks; the arm is posed digging at ground level.
 */
/** Arm poses: digging at ground level in front of the tracks, or raised to dump over a skip. */
const ARM = {
  dig: { boom: 48, stick: -94, curl: -0.35 },
  load: { boom: 60, stick: -48, curl: 0.9 },
} as const;

export function excavator(
  ctx: SetContext,
  P: SitePalette,
  L: SiteLights,
  at: Pose,
  slew = 0.3,
  pose: keyof typeof ARM = 'dig',
): void {
  const arm = ARM[pose];
  const g = new Group();
  // --- undercarriage
  const len = 3.3;
  const r = 0.36;
  for (const sx of [-0.95, 0.95]) {
    g.add(box(0.5, r * 2, len - r * 2, P.track, sx, r, 0));
    for (const ez of [-1, 1]) g.add(axleX(r, 0.5, P.track, sx, r, ez * (len / 2 - r), 12));
    for (let z = -len / 2 + r; z <= len / 2 - r + 0.01; z += 0.2)
      g.add(box(0.54, 0.05, 0.08, P.track, sx, r * 2 + 0.015, z));
    // sprocket (rear) and idler (front) hubs, bottom rollers on the outer face
    g.add(axleX(0.22, 0.58, P.black, sx, r, -(len / 2 - r), 10));
    g.add(axleX(0.18, 0.56, P.black, sx, r, len / 2 - r, 10));
    for (let k = -1; k <= 1; k++) g.add(axleX(0.11, 0.54, P.steel, sx, 0.17, k * 0.7, 8));
  }
  g.add(box(1.3, 0.4, 1.4, P.black, 0, 0.55, 0));
  for (const sx of [-0.62, 0.62]) g.add(box(0.26, 0.3, len - 1.1, P.plantWorn, sx, 0.42, 0));
  g.add(cyl(0.82, 0.82, 0.18, P.black, 0, 0.84, 0, 18));

  // --- upper house
  const up = new Group();
  up.position.y = 0.93;
  up.rotation.y = slew;
  g.add(up);
  up.add(box(2.3, 0.18, 2.95, P.black, 0, 0.09, -0.15));
  up.add(box(2.2, 0.86, 1.85, P.plant, 0.05, 0.6, -0.5));
  // counterweight with a rounded tail, scuffed where it swings past things
  up.add(box(2.34, 0.72, 0.5, P.plant, 0, 0.55, -1.42));
  up.add(axleX(0.36, 2.34, P.plantWorn, 0, 0.55, -1.66, 14));
  // engine hood, louvres, exhaust stack, handrail
  up.add(box(1.1, 0.16, 1.2, P.plantWorn, 0.5, 1.11, -0.75));
  for (let k = 0; k < 6; k++) up.add(box(0.03, 0.34, 0.06, P.black, 1.16, 0.62, -1.15 + k * 0.14));
  up.add(cyl(0.055, 0.055, 0.5, P.black, 0.78, 1.42, -0.32, 8));
  up.add(cyl(0.07, 0.07, 0.06, P.rust, 0.78, 1.68, -0.32, 8));
  up.add(bar(v3(1.05, 1.19, -1.3), v3(1.05, 1.5, -1.3), 0.02, P.plant, 5));
  up.add(bar(v3(1.05, 1.19, 0.2), v3(1.05, 1.5, 0.2), 0.02, P.plant, 5));
  up.add(bar(v3(1.05, 1.5, -1.3), v3(1.05, 1.5, 0.2), 0.02, P.plant, 5));
  // tool box / fuel tank ahead of the hood on the right
  up.add(box(0.78, 0.62, 0.95, P.plant, 0.68, 0.52, 0.72));
  up.add(box(0.8, 0.04, 0.97, P.black, 0.68, 0.84, 0.72));
  // cab on the left front: glass box, dark posts, ochre skirt and roof, lamps and beacon
  const cx = -0.56;
  const cz = 0.5;
  up.add(box(0.96, 1.2, 1.18, P.glass, cx, 0.82, cz));
  up.add(box(0.98, 0.34, 1.2, P.plant, cx, 0.36, cz));
  up.add(box(1.02, 0.07, 1.26, P.plant, cx, 1.45, cz - 0.02));
  for (const px of [-0.47, 0.47])
    for (const pz of [-0.58, 0.58]) up.add(box(0.06, 1.12, 0.06, P.black, cx + px, 0.88, cz + pz));
  up.add(box(0.05, 0.9, 0.05, P.black, cx - 0.48, 0.92, cz + 0.05)); // door frame
  up.add(box(0.9, 0.04, 0.04, P.black, cx, 1.02, cz + 0.6)); // windscreen rail
  up.add(box(0.16, 0.1, 0.1, P.black, cx - 0.3, 1.53, cz + 0.55));
  up.add(box(0.16, 0.1, 0.1, P.black, cx + 0.3, 1.53, cz + 0.55));
  up.add(box(0.12, 0.07, 0.02, lampMat(0xfff1d6), cx - 0.3, 1.53, cz + 0.61));
  up.add(box(0.12, 0.07, 0.02, lampMat(0xfff1d6), cx + 0.3, 1.53, cz + 0.61));
  up.add(cyl(0.07, 0.08, 0.12, P.black, cx + 0.25, 1.54, cz - 0.4, 8));

  // --- boom, stick and bucket in the house's YZ plane (x = 0.15)
  const bx = 0.15;
  const deg = Math.PI / 180;
  const at2 = (p: Vector3, a: number, l: number): Vector3 =>
    v3(bx, p.y + Math.sin(a * deg) * l, p.z + Math.cos(a * deg) * l);
  const F = v3(bx, 0.62, 0.95);
  const K = at2(F, arm.boom, 2.45);
  const T = at2(K, -14, 1.75);
  const stickA = arm.stick;
  const H = at2(T, stickA, -0.5); // stick heel above the boom tip
  const S = at2(T, stickA, 2.25);
  up.add(beam(F, K, 0.3, 0.4, P.plant));
  up.add(beam(K, T, 0.28, 0.32, P.plant));
  up.add(box(0.36, 0.5, 0.5, P.plant, bx, K.y, K.z));
  up.add(axleX(0.12, 0.44, P.black, bx, F.y, F.z, 8));
  up.add(beam(H, S, 0.26, 0.34, P.plantWorn));
  up.add(axleX(0.1, 0.4, P.black, bx, T.y, T.z, 8));
  // hydraulic rams: ochre barrel, chrome rod
  const ram = (a: Vector3, b: Vector3, rr: number): void => {
    const m = a.clone().lerp(b, 0.58);
    up.add(bar(a, m, rr, P.plant, 8), bar(m, b, rr * 0.55, P.chrome, 6));
  };
  const boomMid = F.clone()
    .lerp(K, 0.6)
    .add(v3(0, -0.24, 0.12));
  ram(v3(bx - 0.24, 0.38, 1.2), boomMid.clone().setX(bx - 0.24), 0.075);
  ram(v3(bx + 0.24, 0.38, 1.2), boomMid.clone().setX(bx + 0.24), 0.075);
  ram(
    F.clone()
      .lerp(K, 0.75)
      .add(v3(0, 0.3, 0)),
    H.clone().add(v3(0, 0.05, -0.12)),
    0.065,
  );
  ram(
    H.clone()
      .lerp(S, 0.15)
      .add(v3(0, 0, 0.22)),
    S.clone().add(v3(0, 0.25, 0.25)),
    0.055,
  );
  // hoses along the boom
  up.add(bar(F.clone().add(v3(0.17, 0.2, 0)), K.clone().add(v3(0.17, 0.26, 0)), 0.025, P.black, 5));
  // boom work lamp
  const lampAt = F.clone()
    .lerp(K, 0.85)
    .add(v3(0, 0.28, 0));
  up.add(box(0.16, 0.12, 0.1, P.black, bx + 0.22, lampAt.y, lampAt.z));
  up.add(box(0.13, 0.09, 0.02, lampMat(0xfff1d6), bx + 0.22, lampAt.y, lampAt.z + 0.055));
  // bucket: a half drum with side plates, curled, five teeth on the lip
  const bucket = new Group();
  bucket.position.copy(S);
  bucket.rotation.x = arm.curl;
  const shell = mesh(new CylinderGeometry(0.32, 0.32, 0.7, 10, 1, false, 0, Math.PI), P.black, 0, -0.22, 0.1);
  shell.rotation.z = -Math.PI / 2; // trough below the axle, open to the dig
  bucket.add(shell);
  bucket.add(box(0.72, 0.05, 0.4, P.plantWorn, 0, 0.08, 0.12));
  for (let k = -2; k <= 2; k++) bucket.add(box(0.07, 0.06, 0.14, P.steel, k * 0.14, -0.22, 0.48));
  up.add(bucket);

  g.position.set(at.x, STREET, at.z);
  g.rotation.y = at.ry;
  ctx.statics.add(g);

  // lights: cab roof lamps throw forward, the boom lamp down at the bucket, a beacon on the cab
  const roof = toWorld(up, v3(cx, 1.53, cz + 0.62));
  const lamp = toWorld(up, v3(bx + 0.22, lampAt.y, lampAt.z + 0.06));
  L.glow(roof.x, roof.y, roof.z, 0.9, 0xfff0d0, 0.9);
  L.glow(lamp.x, lamp.y, lamp.z, 0.7, 0xfff0d0, 0.9);
  const bc = toWorld(up, v3(cx + 0.25, 1.68, cz - 0.4));
  L.beacon(bc.x, bc.y, bc.z, 0xff9a20, 0.8);
}

/** A single-drum vibratory roller: drum in its frame, articulated chassis, rear tyres, ROPS canopy. */
export function roller(ctx: SetContext, P: SitePalette, L: SiteLights, at: Pose): void {
  const g = new Group();
  // front drum and its yoke
  g.add(axleX(0.58, 1.66, P.steel, 0, 0.58, 1.1, 20));
  // the drum hangs in a yoke: side cheeks with the vibrator housings, a crossbeam behind the drum
  for (const sx of [-0.9, 0.9]) {
    g.add(box(0.1, 0.62, 1.0, P.plant, sx, 0.72, 1.0));
    g.add(beam(v3(sx, 1.0, 0.55), v3(sx * 0.5, 1.05, 0.25), 0.12, 0.2, P.plant));
    g.add(axleX(0.24, 0.16, P.black, sx * 1.03, 0.58, 1.1, 10));
  }
  g.add(box(1.9, 0.22, 0.25, P.plant, 0, 1.08, 0.45));
  g.add(box(1.7, 0.08, 0.12, P.black, 0, 0.9, 1.82)); // scraper bar
  // articulation and rear chassis with the engine hood
  g.add(box(0.5, 0.45, 0.5, P.black, 0, 0.75, 0.2));
  g.add(box(1.6, 0.7, 2.0, P.plant, 0, 0.95, -0.95));
  g.add(box(1.5, 0.18, 1.3, P.plantWorn, 0, 1.38, -1.25));
  for (let k = 0; k < 5; k++) g.add(box(1.2, 0.03, 0.06, P.black, 0, 1.48, -1.65 + k * 0.16));
  g.add(cyl(0.05, 0.05, 0.5, P.black, 0.5, 1.7, -0.75, 8));
  for (const sx of [-0.85, 0.85]) {
    g.add(axleX(0.52, 0.5, P.rubber, sx, 0.52, -1.2, 16));
    g.add(axleX(0.26, 0.52, P.steel, sx, 0.52, -1.2, 10));
  }
  // operator platform, seat, wheel, ROPS canopy
  g.add(box(1.5, 0.08, 0.9, P.black, 0, 1.32, -0.15));
  g.add(box(0.5, 0.45, 0.45, P.black, 0, 1.6, -0.3));
  g.add(box(0.5, 0.5, 0.1, P.black, 0, 1.88, -0.52));
  const wheel = cyl(0.17, 0.17, 0.03, P.black, 0, 1.75, 0.15, 12);
  wheel.rotation.x = -0.9;
  g.add(wheel, cyl(0.025, 0.025, 0.5, P.black, 0, 1.55, 0.22, 5));
  // two-post ROPS behind the seat, the canopy cantilevered forward over the operator
  for (const sx of [-0.66, 0.66]) {
    g.add(box(0.1, 1.45, 0.1, P.black, sx, 2.05, -0.62));
    g.add(beam(v3(sx, 2.6, -0.62), v3(sx, 2.72, 0.2), 0.07, 0.07, P.black));
  }
  g.add(box(1.4, 0.08, 0.1, P.black, 0, 2.5, -0.62));
  g.add(tiltedBox(1.45, 0.06, 1.0, P.black, 0, 2.76, -0.2, -0.08));
  g.add(box(0.1, 0.07, 0.06, lampMat(0xfff1d6), -0.6, 2.66, 0.42));
  g.add(box(0.1, 0.07, 0.06, lampMat(0xfff1d6), 0.6, 2.66, 0.42));
  g.position.set(at.x, STREET, at.z);
  g.rotation.y = at.ry;
  ctx.statics.add(g);
  const bc = toWorld(g, v3(0, 2.84, -0.2));
  L.beacon(bc.x, bc.y, bc.z, 0xff9a20, 0.7);
  for (const sx of [-0.6, 0.6]) {
    const p = toWorld(g, v3(sx, 2.66, 0.46));
    L.glow(p.x, p.y, p.z, 0.6, 0xfff0d0, 0.8);
  }
}

/** A site tilting-drum concrete mixer on its two-wheel frame, with the hopper and a small engine. */
export function concreteMixer(ctx: SetContext, P: SitePalette, at: Pose): void {
  const g = new Group();
  const pts = [
    new Vector2(0.18, -0.62),
    new Vector2(0.42, -0.5),
    new Vector2(0.55, -0.15),
    new Vector2(0.55, 0.12),
    new Vector2(0.36, 0.48),
    new Vector2(0.26, 0.6),
    new Vector2(0.22, 0.6),
  ];
  const drum = mesh(new LatheGeometry(pts, 16), P.rust, 0, 1.05, 0.15);
  drum.rotation.x = 1.15; // mouth tipped up towards the loader
  g.add(drum);
  g.add(cyl(0.6, 0.6, 0.05, P.rust, 0, 1.05, 0.15, 18)); // ring gear
  for (const sx of [-0.62, 0.62]) {
    g.add(beam(v3(sx, 0.35, -0.2), v3(sx * 0.95, 1.1, 0.15), 0.08, 0.08, P.black));
    g.add(beam(v3(sx, 0.35, 0.55), v3(sx * 0.95, 1.1, 0.15), 0.08, 0.08, P.black));
    g.add(axleX(0.3, 0.16, P.rubber, sx + Math.sign(sx) * 0.1, 0.3, 0.15, 14));
  }
  g.add(box(1.3, 0.1, 0.12, P.black, 0, 0.38, 0.15));
  g.add(beam(v3(0, 0.38, 0.15), v3(0, 0.25, 1.25), 0.07, 0.07, P.black)); // tow bar
  g.add(box(0.5, 0.42, 0.42, P.olive, 0, 0.66, -0.55)); // petrol engine
  g.add(cyl(0.04, 0.04, 0.2, P.black, 0.15, 0.95, -0.6, 6));
  g.add(tiltedBox(0.7, 0.06, 0.55, P.steel, 0, 0.55, 0.85, -0.35)); // loading hopper chute
  g.position.set(at.x, STREET, at.z);
  g.rotation.y = at.ry;
  ctx.statics.add(g);
}

/** A canopied diesel generator set on its fuel-tank base: louvres, panel door, exhaust, cables. */
export function generatorSet(ctx: SetContext, P: SitePalette, L: SiteLights, at: Pose): Vector3 {
  const g = new Group();
  g.add(box(2.6, 0.3, 1.2, P.black, 0, 0.15, 0));
  g.add(box(2.5, 1.15, 1.1, P.olive, 0, 0.88, 0));
  g.add(box(2.56, 0.06, 1.16, P.steel, 0, 1.47, 0));
  for (const sz of [-1, 1]) {
    for (let k = 0; k < 7; k++) g.add(box(0.05, 0.6, 0.03, P.black, -1.0 + k * 0.12, 0.92, sz * 0.56));
    g.add(box(0.7, 0.75, 0.02, P.steel, 0.7, 0.85, sz * 0.555)); // access doors
  }
  g.add(box(0.36, 0.26, 0.03, lampMat(0x86ff9a, 0.9), 0.72, 1.05, 0.565)); // control panel display
  g.add(cyl(0.07, 0.07, 0.55, P.rust, -0.9, 1.75, 0, 8));
  g.add(box(0.3, 0.12, 0.3, P.black, 1.1, 1.55, 0.2));
  g.position.set(at.x, STREET, at.z);
  g.rotation.y = at.ry;
  ctx.statics.add(g);
  const panel = toWorld(g, v3(0.72, 1.05, 0.6));
  L.glow(panel.x, panel.y, panel.z, 0.35, 0x6aff8a, 0.5);
  const ex = toWorld(g, v3(-0.9, 2.05, 0));
  ctx.ambient.smokeColumn(ex.x, ex.y, ex.z, { shade: 0.32, size: 0.45, rate: 3 });
  return toWorld(g, v3(1.3, 0.2, 0));
}

/** A steel skip, tapered and rusted, heaped with broken concrete and bent rebar. */
export function skip(ctx: SetContext, P: SitePalette, at: Pose, paint: Material = P.plantWorn): void {
  const g = new Group();
  const geo = new BoxGeometry(1.6, 0.95, 2.4);
  const p = geo.attributes.position!;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setZ(i, p.getZ(i) * 1.32);
  geo.computeVertexNormals();
  g.add(mesh(geo, paint, 0, 0.55, 0));
  for (const sx of [-0.83, 0.83]) g.add(box(0.08, 0.12, 0.3, P.black, sx, 0.9, 0)); // lifting lugs
  g.add(box(1.5, 0.12, 2.2, P.black, 0, 0.06, 0));
  g.add(mound(P.concreteDark, 0, 0.95, 0, 0.85, 0.35, 3));
  const rr = ctx.rng;
  for (let k = 0; k < 7; k++) {
    g.add(
      tiltedBox(
        0.3 + rr() * 0.3,
        0.12 + rr() * 0.1,
        0.25 + rr() * 0.3,
        k % 3 ? P.concrete : P.block,
        (rr() - 0.5) * 1.1,
        1.1 + rr() * 0.15,
        (rr() - 0.5) * 2.0,
        rr() * 0.6,
        rr() * 3,
        rr() * 0.6,
      ),
    );
  }
  for (let k = 0; k < 4; k++)
    g.add(bar(v3(-0.4 + k * 0.25, 1.0, -0.6), v3(-0.7 + k * 0.4, 1.75, -1.0 + k * 0.5), 0.015, P.rebar, 4));
  g.position.set(at.x, STREET, at.z);
  g.rotation.y = at.ry;
  ctx.statics.add(g);
}

/**
 * A towable lighting tower: trailer with outriggers, a diesel canopy, a three-stage mast and four
 * lamp heads on a crossbar aimed at `aim` (world). Returns the lamp-bar centre.
 */
export function lightTower(
  ctx: SetContext,
  P: SitePalette,
  L: SiteLights,
  x: number,
  z: number,
  aim: Vector3,
  height = 5.6,
  trailer = true,
  color = 0xe8eeff,
): Vector3 {
  const yaw = Math.atan2(aim.x - x, aim.z - z);
  const g = new Group();
  if (!trailer) {
    // a fixed mast on a precast ballast block, cable tied up the pole
    g.add(box(0.9, 0.55, 0.9, P.concrete, 0, 0.27, -0.5));
    g.add(box(0.3, 0.12, 0.3, P.steel, 0, 0.6, -0.5));
    g.add(bar(v3(0.09, 0.55, -0.42), v3(0.06, height - 0.1, -0.46), 0.015, P.black, 4));
  }
  // diesel canopy with a ridged roof, the mast base and exhaust breaking up the top
  if (trailer) g.add(box(1.2, 0.95, 1.8, P.olive, 0, 0.72, 0.1));
  if (trailer) {
    for (const s of [-1, 1]) g.add(tiltedBox(0.66, 0.05, 1.86, P.steel, s * 0.3, 1.24, 0.1, 0, 0, s * -0.22));
    g.add(box(0.36, 0.3, 0.36, P.black, 0, 1.35, -0.5));
    g.add(cyl(0.04, 0.04, 0.35, P.rust, 0.4, 1.45, 0.6, 6));
    for (let k = 0; k < 5; k++) g.add(box(1.27, 0.05, 0.05, P.black, 0, 0.95, -0.6 + k * 0.12));
    g.add(box(1.4, 0.16, 2.2, P.black, 0, 0.25, 0));
    for (const sx of [-0.78, 0.78]) g.add(axleX(0.3, 0.2, P.rubber, sx, 0.3, -0.2, 12));
    g.add(beam(v3(0, 0.25, 1.1), v3(0, 0.2, 2.0), 0.08, 0.08, P.black)); // drawbar
    for (const [ox, oz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      g.add(beam(v3(ox * 0.6, 0.3, oz * 0.9), v3(ox * 1.4, 0.05, oz * 1.3), 0.07, 0.07, P.black));
      g.add(box(0.2, 0.04, 0.2, P.black, ox * 1.4, 0.02, oz * 1.3));
    }
  }
  // three telescopic stages
  const stages = [0.09, 0.07, 0.05];
  const base = trailer ? 1.3 : 0.6;
  const seg = (height - base) / 3;
  stages.forEach((rr, k) => g.add(box(rr * 2, seg + 0.15, rr * 2, P.tube, 0, base + seg * (k + 0.5), -0.5)));
  const top = height;
  g.add(box(1.7, 0.08, 0.08, P.black, 0, top, -0.5));
  for (const lx of [-0.62, -0.21, 0.21, 0.62]) {
    const head = new Group();
    head.position.set(lx, top + 0.12, -0.5);
    head.rotation.x = 0.5; // tipped down towards the work
    head.add(box(0.36, 0.28, 0.12, P.black, 0, 0, 0));
    head.add(box(0.3, 0.22, 0.02, lampMat(color, 3.2), 0, 0, 0.065));
    g.add(head);
  }
  g.position.set(x, STREET, z);
  g.rotation.y = yaw;
  ctx.statics.add(g);
  const c = toWorld(g, v3(0, top + 0.12, -0.38));
  L.glow(c.x, c.y, c.z, 2.6, color, 0.9);
  for (const lx of [-0.42, 0.42]) {
    const p = toWorld(g, v3(lx, top + 0.12, -0.38));
    L.glow(p.x, p.y, p.z, 0.9, 0xffffff, 0.9);
  }
  return c;
}

/** A soot-black tar boiler on a wheeled frame, a fire glowing in its firebox and smoke from the flue. */
export function tarBoiler(ctx: SetContext, P: SitePalette, L: SiteLights, at: Pose): void {
  const g = new Group();
  g.add(axleX(0.42, 1.1, P.black, 0, 0.78, 0, 14));
  for (const sx of [-0.6, 0.6]) g.add(axleX(0.25, 0.1, P.rubber, sx, 0.25, 0, 10));
  g.add(box(1.1, 0.35, 0.7, P.rust, 0, 0.32, 0));
  g.add(box(0.4, 0.2, 0.02, lampMat(0xff6a1a, 1.8), 0, 0.32, 0.36)); // firebox mouth
  g.add(cyl(0.07, 0.07, 0.8, P.black, 0.35, 1.5, 0, 8));
  g.add(beam(v3(0, 0.3, 0.35), v3(0, 0.2, 1.05), 0.06, 0.06, P.black));
  g.add(box(0.5, 0.05, 0.5, P.black, -0.2, 1.22, 0)); // lid
  g.position.set(at.x, STREET, at.z);
  g.rotation.y = at.ry;
  ctx.statics.add(g);
  const mouth = toWorld(g, v3(0, 0.32, 0.4));
  L.glow(mouth.x, mouth.y, mouth.z, 0.9, 0xff6a1a, 0.8);
  const flue = toWorld(g, v3(0.35, 1.95, 0));
  ctx.ambient.smokeColumn(flue.x, flue.y, flue.z, { shade: 0.12, size: 0.7, rate: 4 });
}
