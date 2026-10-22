import { BoxGeometry, IcosahedronGeometry, Matrix4, TorusGeometry } from 'three';
import type { BufferGeometry, Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { concreteTexture, crateTexture, hazardStripes, sackTexture } from '../textures';
import { mat } from './helpers';
import { assets } from './library';

const PROCEDURAL_SOFT = ['crate', 'crateStack', 'tyres', 'sacks', 'barrier'] as const;
export type SoftVariant = string;

/** Modelled variants (`prop_soft_*.glb`) when loaded, else the procedural stand-ins. */
export function softVariants(): SoftVariant[] {
  const glb = assets.loadedIds('prop_soft_');
  return glb.length > 0 ? glb : [...PROCEDURAL_SOFT];
}

/**
 * Art-direction weights for the destructible set: mostly warm wooden crates (the reference's dominant
 * breakable), then hazard barricades and tyre stacks, with the colourful market goods as accents so the
 * field reads as one coherent bus-park clutter rather than confetti. Unknown variants weigh 1.
 */
const SOFT_WEIGHTS: Record<string, number> = {
  prop_soft_crate: 4,
  prop_soft_crate_b: 3,
  prop_soft_crates: 4,
  prop_soft_barrier: 3,
  prop_soft_tyres: 3,
  prop_soft_sacks: 2,
  prop_soft_kegs: 1,
  prop_soft_cartons: 1,
};

const ARENA_SOFT_WEIGHTS: Record<string, Record<string, number>> = {
  danfoBusPark: SOFT_WEIGHTS,
  lekkiRoadworks: {
    prop_soft_barrier: 5,
    prop_soft_tyres: 5,
    prop_soft_cartons: 3,
    prop_soft_crate: 3,
    prop_soft_crates: 2,
    prop_soft_crate_b: 2,
    prop_soft_sacks: 1,
    prop_soft_kegs: 1,
  },
  balogunMarket: {
    prop_soft_sacks: 5,
    prop_soft_kegs: 4,
    prop_soft_cartons: 4,
    prop_soft_crates: 3,
    prop_soft_crate_b: 3,
    prop_soft_crate: 2,
    prop_soft_tyres: 1,
    prop_soft_barrier: 1,
  },
};

/** Deterministic variant so the same tile always looks the same. */
export function softVariantFor(
  x: number,
  y: number,
  variants: readonly SoftVariant[] = softVariants(),
  arenaId?: string,
): SoftVariant {
  const weights = (arenaId && ARENA_SOFT_WEIGHTS[arenaId]) || SOFT_WEIGHTS;
  const total = variants.reduce((n, v) => n + (weights[v] ?? 1), 0);
  // integer hash of the tile so neighbours decorrelate (no diagonal stripes of the same prop)
  let h = Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 7, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  let pick = (h >>> 0) % total;
  for (const v of variants) {
    pick -= weights[v] ?? 1;
    if (pick < 0) return v;
  }
  return variants[0]!;
}

/** Debris palette that matches a block variant. */
export function debrisKindFor(
  variant: SoftVariant,
): 'crate' | 'tyres' | 'sacks' | 'barrier' | 'cartons' | 'kegs' {
  if (variant.includes('tyre')) return 'tyres';
  if (variant.includes('sack')) return 'sacks';
  if (variant.includes('barrier')) return 'barrier';
  if (variant.includes('carton')) return 'cartons';
  if (variant.includes('keg')) return 'kegs';
  return 'crate';
}

function place(
  g: BufferGeometry,
  x: number,
  y: number,
  z: number,
  ry = 0,
  sx = 1,
  sy = 1,
  sz = 1,
  rx = 0,
): BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g.clone();
  const m = new Matrix4()
    .makeRotationY(ry)
    .multiply(new Matrix4().makeRotationX(rx))
    .multiply(new Matrix4().makeScale(sx, sy, sz));
  out.applyMatrix4(m);
  out.translate(x, y, z);
  return out;
}

export interface PropGeometry {
  geometry: BufferGeometry;
  material: Material;
}

/** Instancing parts for a soft block: modelled meshes if the variant is a loaded asset, else procedural. */
export function softBlockParts(variant: SoftVariant): PropGeometry[] {
  if (variant.startsWith('prop_soft_'))
    return assets.parts(variant).map(({ geometry, material }) => ({ geometry, material }));
  return [softBlockGeometry(variant)];
}

export function softBlockGeometry(variant: SoftVariant): PropGeometry {
  switch (variant) {
    case 'crate':
      return {
        geometry: place(new BoxGeometry(0.82, 0.82, 0.82), 0, 0.41, 0, 0.06),
        material: mat(0xffffff, { map: crateTexture(), flat: false, roughness: 0.9 }),
      };
    case 'crateStack':
      return {
        geometry: mergeGeometries([
          place(new BoxGeometry(0.8, 0.62, 0.8), 0, 0.31, 0, -0.04),
          place(new BoxGeometry(0.46, 0.4, 0.46), 0.08, 0.82, -0.05, 0.4),
        ])!,
        material: mat(0xffffff, { map: crateTexture(), flat: false, roughness: 0.9 }),
      };
    case 'tyres':
      return {
        geometry: mergeGeometries(
          [0, 1, 2].map((i) =>
            place(
              new TorusGeometry(0.27, 0.13, 8, 14),
              (i % 2) * 0.03,
              0.13 + i * 0.24,
              (i % 2) * -0.02,
              i * 0.7,
              1,
              1,
              1,
              Math.PI / 2,
            ),
          ),
        )!,
        material: mat(0x2b2b2e, { roughness: 0.95 }),
      };
    case 'sacks':
      return {
        geometry: mergeGeometries([
          place(new IcosahedronGeometry(0.3, 1), -0.14, 0.26, 0.05, 0.3, 1, 0.82, 1),
          place(new IcosahedronGeometry(0.28, 1), 0.2, 0.24, -0.1, 1.2, 1, 0.8, 1),
          place(new IcosahedronGeometry(0.26, 1), 0.02, 0.58, 0.02, 2.2, 1, 0.8, 1),
          place(new BoxGeometry(0.3, 0.2, 0.26), 0.22, 0.1, 0.22, 0.4),
        ])!,
        material: mat(0xffffff, { map: sackTexture(), roughness: 1 }),
      };
    default:
    case 'barrier':
      return {
        geometry: mergeGeometries([
          place(new BoxGeometry(0.86, 0.34, 0.12), 0, 0.62, 0),
          place(new BoxGeometry(0.1, 0.62, 0.3), -0.34, 0.31, 0),
          place(new BoxGeometry(0.1, 0.62, 0.3), 0.34, 0.31, 0),
          place(new BoxGeometry(0.86, 0.3, 0.12), 0, 0.22, 0),
        ])!,
        material: mat(0xffffff, { map: hazardStripes(), flat: false, roughness: 0.6 }),
      };
  }
}

/** Pillar variants (`prop_pillar_*.glb`) as instancing part lists, or null to use the procedural pillar. */
export function modelledPillars(): PropGeometry[][] | null {
  const ids = assets.loadedIds('prop_pillar_');
  if (ids.length === 0) return null;
  return ids.map((id) => assets.parts(id).map(({ geometry, material }) => ({ geometry, material })));
}

export function pillarParts(): { body: PropGeometry; band: PropGeometry; cap: PropGeometry } {
  return {
    body: {
      geometry: new BoxGeometry(0.84, 0.74, 0.84).translate(0, 0.37, 0),
      material: mat(0xffffff, { map: concreteTexture(), flat: false, roughness: 0.95 }),
    },
    band: {
      geometry: new BoxGeometry(0.865, 0.15, 0.865).translate(0, 0.13, 0),
      material: mat(0xffffff, { map: hazardStripes(), flat: false, roughness: 0.6 }),
    },
    cap: {
      geometry: new BoxGeometry(0.9, 0.07, 0.9).translate(0, 0.775, 0),
      material: mat(0x8c867c, { roughness: 0.95 }),
    },
  };
}
