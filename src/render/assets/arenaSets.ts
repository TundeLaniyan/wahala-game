/**
 * Arena-specific set dressing outside the walls (presentation only). Everything here is static and
 * goes into the backdrop's `statics` group, which is baked into a few merged meshes. Pieces north of
 * the arena never hide a tile from the camera (it looks north), so the tall landmarks live there.
 */
import {
  AdditiveBlending,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';
import { artRng, glowTexture, towerWindowsTexture } from '../textures';
import { box, cyl, mat, uniqueMat } from './helpers';

const YELLOW = 0xf2b705;
/** The street around the raised arena slab sits this far below the arena floor. */
const STREET = -0.3;

/** Lekki Roadworks: half-built frame, tower crane, excavator, floodlight masts and a lit Lekki skyline. */
export function addLekkiSite(root: Group, statics: Group, W: number, H: number): void {
  const concrete = mat(0xa8a39a, { roughness: 0.95 });
  const rebar = mat(0x7a4a2a, { roughness: 0.7, metalness: 0.4 });
  const yellow = mat(YELLOW, { roughness: 0.45, metalness: 0.2 });
  const dark = mat(0x1d1f24, { roughness: 0.6, metalness: 0.3 });
  const glass = mat(0x2a3b55, { roughness: 0.2, metalness: 0.6 });
  const steel = mat(0x8a8f96, { roughness: 0.4, metalness: 0.6 });
  const north = -H / 2;

  // Half-built three-storey concrete frame across the north street, rebar sprouting from the top.
  const fx0 = -W / 2 - 1;
  const fx1 = 2.5;
  const fz = north - 6.2;
  for (let level = 0; level < 3; level++) {
    const y0 = level * 2.2;
    for (let x = fx0; x <= fx1 + 0.01; x += (fx1 - fx0) / 4) {
      for (const dz of [-1.3, 1.3])
        statics.add(box(0.32, 2.2, 0.32, concrete, x, STREET + y0 + 1.1, fz + dz));
    }
    statics.add(box(fx1 - fx0 + 0.8, 0.22, 3.1, concrete, (fx0 + fx1) / 2, STREET + y0 + 2.2, fz));
  }
  for (let x = fx0; x <= fx1 + 0.01; x += (fx1 - fx0) / 4) {
    for (const dz of [-1.3, 1.3]) {
      for (const k of [-0.08, 0.08])
        statics.add(cyl(0.02, 0.02, 0.9, rebar, x + k, STREET + 7.05, fz + dz, 5));
    }
  }

  // Tower crane: mast with cross-bracing, jib, counter-jib with weights, cab and hook line.
  const cx = 6;
  const cz = north - 8.5;
  const mastH = 13;
  statics.add(box(0.6, mastH, 0.6, yellow, cx, mastH / 2, cz));
  for (let y = 1; y < mastH; y += 1.2) {
    const brace = box(0.07, 1.5, 0.66, yellow, cx + 0.31, y, cz);
    brace.rotation.x = 0.75;
    statics.add(brace);
  }
  statics.add(box(16, 0.45, 0.5, yellow, cx - 5, mastH + 0.25, cz));
  statics.add(box(4.5, 0.4, 0.55, yellow, cx + 4.6, mastH + 0.2, cz));
  statics.add(box(1.4, 1.2, 0.9, mat(0x5c5f66, { roughness: 0.9 }), cx + 6.1, mastH - 0.5, cz));
  statics.add(box(1, 0.9, 1, glass, cx + 0.2, mastH - 0.55, cz + 0.6));
  statics.add(box(0.12, 2.4, 0.12, yellow, cx, mastH + 1.6, cz));
  statics.add(cyl(0.015, 0.015, 6, dark, cx - 9, mastH - 3, cz, 4));
  statics.add(box(0.5, 0.35, 0.5, dark, cx - 9, mastH - 6.1, cz));

  // Excavator parked outside the north-west corner, bucket raised.
  const ex = new Group();
  for (const dz of [-0.55, 0.55]) ex.add(box(2.2, 0.45, 0.42, dark, 0, 0.22, dz));
  ex.add(box(1.7, 0.8, 1.4, yellow, -0.15, 0.85, 0));
  ex.add(box(0.75, 0.8, 0.75, glass, 0.35, 1.6, 0.3));
  ex.add(box(0.75, 0.08, 0.8, yellow, 0.35, 2.03, 0.3));
  const boom = box(2.2, 0.3, 0.3, yellow, 1.3, 1.85, -0.25);
  boom.rotation.z = 0.55;
  const arm = box(1.5, 0.24, 0.24, yellow, 2.45, 2.05, -0.25);
  arm.rotation.z = -0.9;
  const bucket = box(0.55, 0.45, 0.6, dark, 2.85, 1.35, -0.25);
  ex.add(boom, arm, bucket);
  ex.position.set(-W / 2 - 3.6, STREET, north - 2.6);
  ex.rotation.y = -0.6;
  statics.add(ex);

  // Sand and gravel heaps, stacked drainage pipes.
  const sand = mat(0xc9a26b, { roughness: 1 });
  const gravel = mat(0x8c8780, { roughness: 1 });
  const heap = (x: number, z: number, r: number, h: number, m = sand): void => {
    const c = new Mesh(new ConeGeometry(r, h, 10), m);
    c.position.set(x, h / 2 - 0.3, z);
    c.castShadow = true;
    c.receiveShadow = true;
    statics.add(c);
  };
  heap(W / 2 + 2.6, north - 2.8, 1.4, 1.1);
  heap(W / 2 + 4.2, north - 3.6, 1.1, 0.9, gravel);
  heap(-1.5, north - 3.4, 1.0, 0.8);
  for (let i = 0; i < 3; i++) {
    const pipe = cyl(0.42, 0.42, 1.8, concrete, 3.6 + i * 0.86, 0.12 + (i === 1 ? 0.72 : 0), north - 3.1, 14);
    pipe.rotation.x = Math.PI / 2;
    statics.add(pipe);
  }

  // Floodlight masts at the corners: cool white lamp banks with a soft glow.
  const glowMat = new SpriteMaterial({
    map: glowTexture(),
    color: 0xdfe9ff,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const lampMat = mat(0xf4f8ff, { emissive: 0xe6efff, emissiveIntensity: 2.2, roughness: 0.3 });
  for (const [x, z] of [
    [-W / 2 - 1.6, north - 1.6],
    [W / 2 + 1.6, north - 1.6],
    [-W / 2 - 2.4, H / 2 + 2.6],
    [W / 2 + 2.4, H / 2 + 2.6],
  ] as const) {
    const h = z < 0 ? 6.2 : 5.2;
    statics.add(cyl(0.08, 0.12, h, steel, x, STREET + h / 2, z, 8));
    statics.add(box(1.1, 0.12, 0.12, steel, x, h, z));
    for (const dx of [-0.36, 0, 0.36]) {
      const lamp = box(0.3, 0.24, 0.12, lampMat, x + dx, h + 0.14, z + (z < 0 ? 0.08 : -0.08));
      lamp.castShadow = false;
      statics.add(lamp);
    }
    const glow = new Sprite(glowMat);
    glow.position.set(x, h + 0.15, z + (z < 0 ? 0.3 : -0.3));
    glow.scale.set(2.6, 1.6, 1);
    root.add(glow);
  }

  // The Lekki skyline at dusk: glass towers with lit offices, far behind the works (fog blues them).
  const r = artRng(909);
  for (let i = 0; i < 9; i++) {
    const w = 3 + r() * 3;
    const d = 3 + r() * 2;
    const h = 12 + r() * 16;
    const x = -34 + i * 8.5 + (r() - 0.5) * 3;
    const z = north - 22 - r() * 14;
    const map = towerWindowsTexture(i % 4).clone();
    map.needsUpdate = true;
    map.repeat.set(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 6)));
    const facade = uniqueMat(0x9fb6d8, {
      map,
      emissive: 0xffffff,
      emissiveIntensity: 0.9,
      roughness: 0.25,
      metalness: 0.4,
      flat: false,
    });
    facade.emissiveMap = map;
    const tower = box(w, h, d, facade, x, h / 2 - 0.3, z);
    tower.castShadow = false;
    statics.add(tower);
    statics.add(box(w * 0.6, 0.8, d * 0.6, dark, x, h + 0.1, z));
  }
}

/** Balogun Market: Ankara bunting strung on poles along the walls and corrugated canopies over the side walkways. */
export function addMarketCanopies(statics: Group, W: number, H: number): void {
  const pole = mat(0x6b4a2a, { roughness: 0.9 });
  const colours = [0xe63946, 0xffbe0b, 0x1d6fe0, 0x12964f, 0x8338ec, 0xfb5607, 0xff4f9a];
  const flagGeo = new ConeGeometry(0.14, 0.3, 3, 1, true);
  const string = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    h: number,
    n: number,
    seed: number,
  ): void => {
    statics.add(cyl(0.05, 0.06, h, pole, x0, h / 2, z0, 6), cyl(0.05, 0.06, h, pole, x1, h / 2, z1, 6));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const sag = Math.sin(t * Math.PI) * 0.45;
      const f = new Mesh(flagGeo, mat(colours[(i + seed) % colours.length]!, { roughness: 0.8 }));
      f.position.set(x0 + (x1 - x0) * t, h - sag - 0.15, z0 + (z1 - z0) * t);
      f.rotation.set(Math.PI, Math.atan2(x1 - x0, z1 - z0), 0);
      f.castShadow = true;
      statics.add(f);
    }
  };
  const nz = -H / 2 - 0.75;
  string(-W / 2 - 0.6, nz, -0.4, nz, 2.7, 16, 0);
  string(0.4, nz, W / 2 + 0.6, nz, 2.7, 16, 3);
  const sx = W / 2 + 0.7;
  string(sx, -H / 2, sx, H / 2 - 1.5, 2.5, 14, 1);
  string(-sx, -H / 2, -sx, H / 2 - 1.5, 2.5, 14, 5);

  // Corrugated canopies (rusty blue, green and red sheets) over the east and west trading walkways.
  const sheets = [0x2f6fa8, 0x3f8f4a, 0xb4442e, 0xc98a2a];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = -H / 2 + 1.4 + i * 2.9;
      const x = side * (W / 2 + 1.55);
      const sheet = uniqueMat(sheets[(i + (side > 0 ? 1 : 0)) % sheets.length]!, {
        roughness: 0.65,
        metalness: 0.35,
      });
      sheet.side = DoubleSide;
      const roof = new Mesh(new PlaneGeometry(1.9, 2.7, 1, 6), sheet);
      roof.position.set(x, 2.55, z);
      roof.rotation.set(-Math.PI / 2, side * 0.28, 0, 'YXZ');
      roof.castShadow = true;
      roof.receiveShadow = true;
      statics.add(roof);
      for (const dz of [-1.2, 1.2])
        statics.add(cyl(0.04, 0.04, 2.8, pole, x + side * 0.85, STREET + 1.4, z + dz, 6));
    }
  }
}

/** A low kerb line along the outside of the south wall: the foreground edge of the action camera. */
export function addSouthKerb(statics: Group, W: number, H: number, arenaId: string): void {
  const z = H / 2 + 0.62;
  if (arenaId === 'lekkiRoadworks') {
    // orange/white water-filled barriers
    const orange = mat(0xff6a13, { roughness: 0.55 });
    const white = mat(0xf2efe8, { roughness: 0.55 });
    for (let x = -W / 2 - 0.4; x < W / 2 + 0.5; x += 1.05) {
      statics.add(box(0.95, 0.3, 0.26, Math.round(x) % 2 === 0 ? orange : white, x, 0.15, z));
    }
    return;
  }
  const a = mat(arenaId === 'balogunMarket' ? 0xb88a5a : 0xcf9d1c, { roughness: 0.85 });
  const b = mat(arenaId === 'balogunMarket' ? 0x7a5634 : 0x34302a, { roughness: 0.85 });
  let k = 0;
  for (let x = -W / 2 - 0.6; x < W / 2 + 0.7; x += 0.6)
    statics.add(box(0.58, 0.1, 0.22, k++ % 2 ? a : b, x, 0.05, z));
}
