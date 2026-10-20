import { BoxGeometry, IcosahedronGeometry, Matrix4, TorusGeometry } from 'three';
import type { BufferGeometry, Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { concreteTexture, crateTexture, hazardStripes, sackTexture } from '../textures';
import { mat } from './helpers';

export const SOFT_VARIANTS = ['crate', 'crateStack', 'tyres', 'sacks', 'barrier'] as const;
export type SoftVariant = (typeof SOFT_VARIANTS)[number];

/** Deterministic variant so the same tile always looks the same. */
export function softVariantFor(x: number, y: number): SoftVariant {
  return SOFT_VARIANTS[(x * 7 + y * 13 + ((x * y) % 5)) % SOFT_VARIANTS.length]!;
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
