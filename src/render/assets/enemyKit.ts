/**
 * Builds a campaign enemy's look (assets/enemyLooks.ts, decision SV4) on a cast model: a two-tone clothing recolour,
 * headwear and props parented to the rig's bones. TEMPORARY procedural kit until each variant gets dedicated 3D
 * production (docs/CAMPAIGN_SECTOR_AI.md lists what to replace).
 *
 * Cheap by construction: every kit piece of one bone is merged into ONE vertex-coloured geometry (cached per variant,
 * bone and rig), all pieces share ONE material, and the recoloured cloth geometry is cached per palette - so a variant
 * adds one draw call per bone it dresses (two to four), and ten enemies of a variant share their buffers. Small
 * pieces cast no shadow. If the glTF cast did not load, the procedural fallback model gets the headwear and the scale.
 *
 * Bone frames of the cast are unrotated (Y up, +Z front, the character's right hand at -X): offsets below are in the
 * bone's local metres (docs/ASSET_PIPELINE.md).
 */
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RING_PLUM } from '../../assets/enemyLooks';
import type { EnemyHeadwear, EnemyLook, EnemyProp } from '../../assets/enemyLooks';
import { DEFAULT_FIT, HEAD_FIT } from './outfit';
import type { HeadFit } from './outfit';
import { addRim } from './rim';

type Bone = 'head' | 'chest' | 'spine' | 'hand_R';

interface Piece {
  geo: BufferGeometry;
  color: number;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

const GLASS = 0x3f8f4f;
const BLACK = 0x18181a;
const GOLD = 0xd8a83a;

let kitMaterial: MeshStandardMaterial | null = null;
/** The one material of every kit piece (colours are baked per vertex). */
function material(): MeshStandardMaterial {
  if (!kitMaterial) {
    kitMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05 });
    kitMaterial.name = 'enemyKit';
    addRimTo(kitMaterial);
  }
  return kitMaterial;
}

function addRimTo(m: Material): void {
  const holder = new Mesh(undefined, m);
  addRim(holder);
}

const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpE = new Euler();
const tmpP = new Vector3();
const tmpS = new Vector3();
const tmpC = new Color();

/** One piece baked: transformed, non-indexed, position + normal + colour only. */
function bake(p: Piece): BufferGeometry {
  const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()) as BufferGeometry;
  for (const name of Object.keys(g.attributes))
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  tmpE.set(...(p.rot ?? [0, 0, 0]));
  tmpQ.setFromEuler(tmpE);
  tmpP.set(...(p.pos ?? [0, 0, 0]));
  tmpS.set(...(p.scale ?? [1, 1, 1]));
  g.applyMatrix4(tmpM.compose(tmpP, tmpQ, tmpS));
  tmpC.setHex(p.color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = tmpC.r;
    col[i * 3 + 1] = tmpC.g;
    col[i * 3 + 2] = tmpC.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

// ------------------------------------------------------------------------------------------ headwear

const dome = (r: number, cover = 0.52, seg = 14): BufferGeometry =>
  new SphereGeometry(r, seg, 8, 0, Math.PI * 2, 0, Math.PI * cover);

/** Headwear pieces around the head bone (`fit`: the head's centre height and radius). */
export function headwearPieces(kind: EnemyHeadwear, color: number, accent: number, fit: HeadFit): Piece[] {
  const { centre: c, radius: r } = fit;
  switch (kind) {
    case 'cap':
      return [
        { geo: dome(r * 1.03), color, pos: [0, c + 0.03, 0] },
        {
          geo: new CylinderGeometry(r * 1.15, r * 1.15, 0.02, 14, 1, false, -Math.PI / 2, Math.PI),
          color,
          pos: [0, c + 0.04, r * 0.22],
        },
        { geo: new SphereGeometry(0.025, 6, 4), color: accent, pos: [0, c + 0.03 + r * 1.03, 0] },
      ];
    case 'bandana': {
      const knot = new BoxGeometry(0.05, 0.14, 0.02);
      return [
        { geo: dome(r * 1.02, 0.42), color, pos: [0, c + 0.02, 0] },
        {
          geo: new TorusGeometry(r * 0.99, 0.032, 6, 18),
          color,
          pos: [0, c + 0.05, 0],
          rot: [Math.PI / 2, 0, 0],
        },
        { geo: knot, color, pos: [0.04, c - 0.04, -r * 1.02], rot: [0.3, 0, 0.35] },
        { geo: knot, color, pos: [-0.03, c - 0.05, -r * 1.02], rot: [0.3, 0, -0.25] },
      ];
    }
    case 'bucket':
      return [
        { geo: dome(r, 0.5), color, pos: [0, c + 0.04, 0] },
        { geo: new CylinderGeometry(r * 1.55, r * 1.3, 0.03, 18), color, pos: [0, c + 0.035, 0] },
      ];
    case 'beanie':
      return [
        { geo: dome(r * 1.05, 0.64), color, pos: [0, c + 0.035, 0] },
        {
          geo: new TorusGeometry(r * 0.95, 0.032, 6, 18),
          color: accent,
          pos: [0, c - 0.03, 0],
          rot: [Math.PI / 2, 0, 0],
        },
      ];
    case 'hardhat':
      return [
        { geo: dome(r * 1.12, 0.5), color, pos: [0, c + 0.02, 0] },
        { geo: new CylinderGeometry(r * 1.32, r * 1.32, 0.025, 18), color, pos: [0, c + 0.02, 0.02] },
        { geo: new BoxGeometry(0.05, 0.035, r * 2.1), color: accent, pos: [0, c + 0.02 + r * 1.1, 0] },
      ];
    case 'beret':
      return [
        {
          geo: new SphereGeometry(r * 1.14, 14, 8),
          color,
          pos: [-0.02, c + r * 0.62, 0],
          scale: [1, 0.34, 1],
          rot: [0, 0, 0.18],
        },
        {
          geo: new TorusGeometry(r * 1.0, 0.022, 6, 18),
          color,
          pos: [0, c + r * 0.42, 0],
          rot: [Math.PI / 2, 0, 0],
        },
        // a plain disc badge: no text, no insignia (fictional crew)
        {
          geo: new CylinderGeometry(0.04, 0.04, 0.015, 10),
          color: accent,
          pos: [0.08, c + r * 0.55, r * 0.92],
          rot: [Math.PI / 2, 0, 0],
        },
      ];
    case 'patrolCap':
      return [
        { geo: new CylinderGeometry(r * 1.06, r * 1.0, 0.13, 16), color, pos: [0, c + r * 0.62, 0] },
        {
          geo: new CylinderGeometry(r * 1.02, r * 1.02, 0.035, 16),
          color: accent,
          pos: [0, c + r * 0.36, 0],
        },
        {
          geo: new CylinderGeometry(r * 1.12, r * 1.12, 0.018, 14, 1, false, -Math.PI / 2, Math.PI),
          color,
          pos: [0, c + r * 0.32, r * 0.2],
        },
      ];
    case 'flatCap':
      return [
        {
          geo: new SphereGeometry(r * 1.08, 14, 8),
          color,
          pos: [0, c + r * 0.5, 0.03],
          scale: [1, 0.5, 1.08],
        },
        {
          geo: new CylinderGeometry(r * 1.05, r * 1.05, 0.02, 14, 1, false, -Math.PI / 2, Math.PI),
          color,
          pos: [0, c + r * 0.36, r * 0.3],
        },
      ];
    case 'fedora':
      return [
        { geo: new CylinderGeometry(r * 0.8, r * 0.98, 0.17, 14), color, pos: [0, c + r * 0.72, 0] },
        { geo: new CylinderGeometry(r * 0.99, r * 0.99, 0.04, 14), color: accent, pos: [0, c + r * 0.42, 0] },
        { geo: new CylinderGeometry(r * 1.75, r * 1.75, 0.022, 20), color, pos: [0, c + r * 0.36, 0] },
      ];
  }
}

// ------------------------------------------------------------------------------------------ props

/** The pieces of one prop and the bone that carries them. */
export function propPieces(prop: EnemyProp, look: EnemyLook, fit: HeadFit): { bone: Bone; pieces: Piece[] } {
  const { centre: c, radius: r } = fit;
  switch (prop) {
    case 'bottle':
      return {
        bone: 'hand_R',
        pieces: [
          { geo: new CylinderGeometry(0.018, 0.022, 0.08, 8), color: GLASS, pos: [0, -0.06, 0.02] },
          { geo: new CylinderGeometry(0.042, 0.042, 0.16, 8), color: GLASS, pos: [0, -0.18, 0.02] },
        ],
      };
    case 'crate': {
      const neck = new CylinderGeometry(0.02, 0.026, 0.09, 6);
      return {
        bone: 'chest',
        pieces: [
          { geo: new BoxGeometry(0.34, 0.2, 0.22), color: 0xb2342a, pos: [0, 0.08, -0.27] },
          { geo: new BoxGeometry(0.36, 0.03, 0.24), color: 0x7e231c, pos: [0, 0.18, -0.27] },
          { geo: neck, color: GLASS, pos: [-0.1, 0.23, -0.31] },
          { geo: neck, color: GLASS, pos: [0, 0.23, -0.24] },
          { geo: neck, color: 0x7a5a2a, pos: [0.1, 0.23, -0.3] },
          {
            geo: new BoxGeometry(0.04, 0.3, 0.03),
            color: 0x2a2420,
            pos: [0.13, 0.12, -0.14],
            rot: [0.4, 0, 0],
          },
          {
            geo: new BoxGeometry(0.04, 0.3, 0.03),
            color: 0x2a2420,
            pos: [-0.13, 0.12, -0.14],
            rot: [0.4, 0, 0],
          },
        ],
      };
    }
    case 'baton':
      return {
        bone: 'hand_R',
        pieces: [
          {
            geo: new CylinderGeometry(0.024, 0.024, 0.42, 8),
            color: BLACK,
            pos: [0, -0.2, 0.06],
            rot: [0.35, 0, 0],
          },
          {
            geo: new CylinderGeometry(0.029, 0.029, 0.04, 8),
            color: look.accent,
            pos: [0, -0.06, 0.012],
            rot: [0.35, 0, 0],
          },
        ],
      };
    case 'radio':
      return {
        bone: 'chest',
        pieces: [
          { geo: new BoxGeometry(0.075, 0.13, 0.045), color: BLACK, pos: [0.1, 0.15, 0.17] },
          { geo: new CylinderGeometry(0.009, 0.009, 0.1, 5), color: BLACK, pos: [0.12, 0.26, 0.17] },
          { geo: new BoxGeometry(0.03, 0.02, 0.01), color: look.accent, pos: [0.09, 0.19, 0.196] },
        ],
      };
    case 'earpiece':
      return {
        bone: 'head',
        pieces: [
          { geo: new SphereGeometry(0.028, 6, 4), color: BLACK, pos: [-r * 0.97, c - 0.01, 0.01] },
          {
            geo: new CylinderGeometry(0.007, 0.007, 0.2, 4),
            color: 0x2a2a2e,
            pos: [-r * 0.9, c - 0.12, -0.03],
            rot: [0.2, 0, -0.15],
          },
        ],
      };
    case 'vest':
      return {
        bone: 'chest',
        pieces: [
          { geo: new BoxGeometry(0.4, 0.34, 0.31), color: RING_PLUM, pos: [0, 0.08, 0] },
          { geo: new BoxGeometry(0.405, 0.035, 0.315), color: look.accent, pos: [0, 0.02, 0] },
          { geo: new BoxGeometry(0.405, 0.035, 0.315), color: look.accent, pos: [0, 0.15, 0] },
        ],
      };
    case 'bulkyVest':
      return {
        bone: 'chest',
        pieces: [
          { geo: new BoxGeometry(0.5, 0.4, 0.37), color: 0x4a3a2c, pos: [0, 0.06, 0] },
          { geo: new BoxGeometry(0.505, 0.03, 0.375), color: 0x2a2018, pos: [0, -0.02, 0] },
          { geo: new BoxGeometry(0.505, 0.03, 0.375), color: 0x2a2018, pos: [0, 0.1, 0] },
          { geo: new BoxGeometry(0.07, 0.1, 0.37), color: 0x2a2018, pos: [0.15, 0.29, 0] },
          { geo: new BoxGeometry(0.07, 0.1, 0.37), color: 0x2a2018, pos: [-0.15, 0.29, 0] },
        ],
      };
    case 'apron':
      return {
        bone: 'spine',
        pieces: [
          { geo: new BoxGeometry(0.3, 0.42, 0.025), color: 0xa8916a, pos: [0, -0.22, 0.15] },
          { geo: new BoxGeometry(0.2, 0.09, 0.012), color: 0x6e5a3a, pos: [0, -0.27, 0.166] },
          { geo: new BoxGeometry(0.42, 0.035, 0.3), color: 0x8a7650, pos: [0, 0.08, 0.01] },
        ],
      };
    case 'sack':
      return {
        bone: 'chest',
        pieces: [
          {
            geo: new SphereGeometry(0.17, 10, 7),
            color: 0x9c8558,
            pos: [0.2, 0.27, -0.09],
            scale: [0.9, 0.72, 0.85],
          },
          { geo: new CylinderGeometry(0.03, 0.05, 0.08, 6), color: 0x7a6640, pos: [0.22, 0.4, -0.06] },
        ],
      };
    case 'sash':
      return {
        bone: 'chest',
        pieces: [
          {
            geo: new BoxGeometry(0.075, 0.6, 0.3),
            color: look.accent,
            pos: [0, 0.1, 0.005],
            rot: [0, 0, 0.72],
          },
        ],
      };
    case 'chain':
      return {
        bone: 'chest',
        pieces: [
          {
            geo: new TorusGeometry(0.12, 0.018, 5, 16),
            color: GOLD,
            pos: [0, 0.24, 0.05],
            rot: [Math.PI / 2 - 0.45, 0, 0],
          },
          { geo: new SphereGeometry(0.035, 6, 4), color: GOLD, pos: [0, 0.16, 0.15] },
        ],
      };
    case 'shades':
      return {
        bone: 'head',
        pieces: [
          { geo: new BoxGeometry(r * 1.3, 0.055, 0.04), color: 0x0c0c0e, pos: [0, c + 0.01, r * 0.86] },
        ],
      };
  }
}

// ------------------------------------------------------------------------------------------ cloth palette

const recoloured = new Map<string, BufferGeometry>();

/** A coloured cloth vertex (the jersey), as opposed to near-black cloth or an off-white trim. */
const saturated = (hi: number, lo: number): boolean => hi > 0.03 && (hi - lo) / hi > 0.35;

/**
 * A copy of `source` whose cloth vertex colours become the look's two-tone palette: saturated cloth -> primary (its
 * shading kept), dark cloth -> secondary, light trims -> trim. Cached per geometry and palette.
 */
export function paletteGeometry(source: BufferGeometry, palette: EnemyLook['palette']): BufferGeometry {
  const key = `${source.uuid}:${palette.primary}:${palette.secondary}:${palette.trim}`;
  const hit = recoloured.get(key);
  if (hit) return hit;
  const geometry = source.clone();
  const color = source.getAttribute('color');
  if (color) {
    const size = color.itemSize;
    const out = new Float32Array(color.count * size);
    let satMax = 0;
    for (let i = 0; i < color.count; i++) {
      const hi = Math.max(color.getX(i), color.getY(i), color.getZ(i));
      const lo = Math.min(color.getX(i), color.getY(i), color.getZ(i));
      if (saturated(hi, lo)) satMax = Math.max(satMax, hi);
    }
    const p = new Color(palette.primary);
    const s = new Color(palette.secondary);
    const t = new Color(palette.trim);
    for (let i = 0; i < color.count; i++) {
      const r = color.getX(i);
      const g = color.getY(i);
      const b = color.getZ(i);
      const hi = Math.max(r, g, b);
      const lo = Math.min(r, g, b);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      let base: Color;
      let k: number;
      if (saturated(hi, lo)) {
        base = p;
        k = Math.min(1.15, Math.max(0.45, hi / Math.max(0.05, satMax)));
      } else if (lum < 0.25) {
        base = s;
        k = Math.min(1.2, 0.8 + lum * 2);
      } else {
        base = t;
        k = Math.min(1.1, Math.max(0.6, lum / 0.8));
      }
      out[i * size] = Math.min(1, base.r * k);
      out[i * size + 1] = Math.min(1, base.g * k);
      out[i * size + 2] = Math.min(1, base.b * k);
      if (size > 3) out[i * size + 3] = color.getW(i);
    }
    geometry.setAttribute('color', new Float32BufferAttribute(out, size));
  }
  recoloured.set(key, geometry);
  return geometry;
}

// ------------------------------------------------------------------------------------------ assembly

const merged = new Map<string, BufferGeometry>();

/** Every piece of a look, merged per bone (cached per variant and rig). */
export function kitGeometries(look: EnemyLook, rigId: string): Map<Bone, BufferGeometry> {
  const fit = HEAD_FIT[rigId] ?? DEFAULT_FIT;
  const byBone = new Map<Bone, Piece[]>();
  const add = (bone: Bone, pieces: Piece[]): void => {
    const list = byBone.get(bone) ?? [];
    list.push(...pieces);
    byBone.set(bone, list);
  };
  add('head', headwearPieces(look.headwear, look.headwearColor, look.accent, fit));
  for (const prop of look.props) {
    const { bone, pieces } = propPieces(prop, look, fit);
    add(bone, pieces);
  }
  const out = new Map<Bone, BufferGeometry>();
  for (const [bone, pieces] of byBone) {
    const key = `${look.variant}:${rigId}:${bone}`;
    let g = merged.get(key);
    if (!g) {
      const baked = pieces.map(bake);
      g = mergeGeometries(baked) ?? baked[0]!;
      for (const b of baked) if (b !== g) b.dispose();
      for (const p of pieces) p.geo.dispose();
      g.computeBoundingSphere();
      merged.set(key, g);
    } else for (const p of pieces) p.geo.dispose();
    out.set(bone, g);
  }
  return out;
}

const isCloth = (m: Material | Material[]): boolean => !Array.isArray(m) && m.name === 'cloth';

/**
 * Dresses a freshly instanced rigged cast body (call once, before it joins the scene): the cloth palette and one kit
 * mesh per dressed bone. Returns the kit meshes (tests count them).
 */
export function applyEnemyKit(body: Object3D, rigId: string, look: EnemyLook): Mesh[] {
  body.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh && isCloth(mesh.material)) mesh.geometry = paletteGeometry(mesh.geometry, look.palette);
  });
  const meshes: Mesh[] = [];
  for (const [bone, geometry] of kitGeometries(look, rigId)) {
    const target = body.getObjectByName(bone);
    if (!target) continue;
    const m = new Mesh(geometry, material());
    m.name = `enemyKit_${bone}`;
    // the headwear and the bulky pieces cast a shadow; hand-held and small pieces do not
    m.castShadow = bone === 'head' || bone === 'chest';
    m.receiveShadow = false;
    target.add(m);
    meshes.push(m);
  }
  return meshes;
}

/**
 * The procedural fallback (no glTF cast): the headwear on its head pivot, scaled to the fallback head (a 0.15 sphere
 * centred 0.1 above the pivot). Props are skipped: the fallback is a safety net, not a look.
 */
export function applyEnemyKitFallback(head: Object3D, look: EnemyLook): Mesh | null {
  const pieces = headwearPieces(look.headwear, look.headwearColor, look.accent, {
    centre: 0.1,
    radius: 0.17,
  });
  const baked = pieces.map(bake);
  for (const p of pieces) p.geo.dispose();
  const g = mergeGeometries(baked);
  if (!g) return null;
  for (const b of baked) b.dispose();
  const m = new Mesh(g, material());
  m.castShadow = true;
  head.add(m);
  return m;
}
